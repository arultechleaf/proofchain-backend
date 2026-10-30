import { BadRequestException } from '@nestjs/common';

// The package entry point runs a debug routine; the library file is the safe import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (data: Buffer, options?: Record<string, unknown>) => Promise<unknown> = require('pdf-parse/lib/pdf-parse.js');

/** One text fragment of the PDF with its position on the page (PDF points, origin bottom-left). */
interface Fragment { text: string; x: number; width: number; y: number }
/** Fragments that touch each other, merged back into one piece of text. */
interface Cell { text: string; x: number; end: number }
interface Row { y: number; cells: Cell[] }

export interface ParsedInvoiceLine {
  description: string;
  hsnCode: string | null;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
}

export interface ParsedInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  seller: string | null;
  buyer: string | null;
  lines: ParsedInvoiceLine[];
  warnings: string[];
}

const ROW_TOLERANCE = 3;   // fragments of one printed line differ slightly in y
const MERGE_GAP = 1;       // fragments closer than this belong to the same word / number
const PAGE_GAP = 10000;    // keeps pages in reading order when sorting by y

async function readFragments(file: Buffer): Promise<Fragment[]> {
  const fragments: Fragment[] = [];
  let page = 0;
  await pdfParse(file, {
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string; width: number; transform: number[] }> }> }) => {
      const content = await pageData.getTextContent();
      for (const item of content.items) {
        if (!item.str.trim()) continue;
        fragments.push({ text: item.str, x: item.transform[4], width: item.width, y: item.transform[5] - page * PAGE_GAP });
      }
      page += 1;
      return '';
    },
  });
  return fragments;
}

function buildRows(fragments: Fragment[]): Row[] {
  const sorted = [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: Array<{ y: number; items: Fragment[] }> = [];
  for (const f of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.y - f.y) <= ROW_TOLERANCE) last.items.push(f);
    else groups.push({ y: f.y, items: [f] });
  }
  return groups.map((g) => {
    const cells: Cell[] = [];
    for (const f of g.items.sort((a, b) => a.x - b.x)) {
      const prev = cells[cells.length - 1];
      if (prev && f.x - prev.end <= MERGE_GAP) {
        prev.text += f.text;
        prev.end = Math.max(prev.end, f.x + f.width);
      } else {
        cells.push({ text: f.text, x: f.x, end: f.x + f.width });
      }
    }
    return { y: g.y, cells };
  });
}

const rowText = (row: Row, maxX = Infinity) =>
  row.cells.filter((c) => c.x < maxX).map((c) => c.text.trim()).join(' ').replace(/\s+/g, ' ').trim();

/** "4,15,563" or "₹ 4,83,612.16" -> number; null when there is no number. */
function toNumber(text: string): number | null {
  const m = text.replace(/[₹,\s]/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

interface Column { key: 'hsn' | 'qty' | 'rate' | 'per' | 'disc' | 'amount'; x: number }

/** Where each numeric column of the item table starts, read from the header row. */
function readColumns(header: Row): { columns: Column[]; serialX: number | null } {
  const columns: Column[] = [];
  let serialX: number | null = null;
  const add = (key: Column['key'], x: number) => { if (!columns.some((c) => c.key === key)) columns.push({ key, x }); };
  for (const c of header.cells) {
    const t = c.text.trim().toLowerCase();
    if (/^(sl|sr|s\.?\s?no|#)/.test(t)) serialX ??= c.x;
    else if (/^(hsn|sac)/.test(t)) add('hsn', c.x);
    else if (/^(quantity|qty)/.test(t)) add('qty', c.x);
    else if (/^(rate|price)/.test(t)) add('rate', c.x);
    else if (/^per$/.test(t)) add('per', c.x);
    else if (/^disc/.test(t)) add('disc', c.x);
    else if (/^(amount|total)/.test(t)) add('amount', c.x);
  }
  return { columns: columns.sort((a, b) => a.x - b.x), serialX };
}

/** A cell belongs to the column whose header start is nearest below its own start (boundaries at midpoints). */
function columnOf(x: number, columns: Column[]): Column['key'] | 'left' {
  const first = columns[0];
  const firstGap = columns[1] ? (columns[1].x - first.x) / 2 : 30;
  if (x < first.x - firstGap) return 'left';
  let key = first.key;
  for (let i = 1; i < columns.length; i++) {
    if (x >= (columns[i - 1].x + columns[i].x) / 2) key = columns[i].key;
  }
  return key;
}

function readTable(rows: Row[], warnings: string[]): ParsedInvoiceLine[] {
  const headerIndex = rows.findIndex((r) => {
    const t = rowText(r).toLowerCase();
    return t.includes('description') && /quantity|qty/.test(t) && /amount|total/.test(t);
  });
  if (headerIndex < 0) {
    warnings.push('Could not find the item table (a header with Description, Quantity and Amount).');
    return [];
  }
  const { columns, serialX: headerSerialX } = readColumns(rows[headerIndex]);
  if (!columns.some((c) => c.key === 'qty')) {
    warnings.push('The item table has no quantity column.');
    return [];
  }

  const body: Row[] = [];
  for (const r of rows.slice(headerIndex + 1)) {
    if (/^(total|sub\s?total|amount chargeable|grand total)\b/i.test(rowText(r, columns[0].x))) break;
    body.push(r);
  }
  const serialX = headerSerialX ?? Math.min(...body.flatMap((r) => r.cells.map((c) => c.x)));

  const lines: ParsedInvoiceLine[] = [];
  let current: (ParsedInvoiceLine & { parts: string[] }) | null = null;
  const finish = () => {
    if (current) {
      const { parts, ...line } = current;
      line.description = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (line.description) lines.push(line);
    }
    current = null;
  };

  for (const r of body) {
    const byColumn: Record<string, string[]> = {};
    let serial = false;
    for (const c of r.cells) {
      const col = columnOf(c.x, columns);
      if (col === 'left' && /^\d{1,3}$/.test(c.text.trim()) && c.x <= serialX + 8) { serial = true; continue; }
      (byColumn[col] ??= []).push(c.text.trim());
    }
    const hasNumbers = ['qty', 'rate', 'amount'].some((k) => byColumn[k]?.length);
    const text = (byColumn.left ?? []).join(' ');

    if (serial) {
      finish();
      current = { description: '', parts: text ? [text] : [], hsnCode: null, quantity: null, unit: null, rate: null, amount: null };
    } else if (hasNumbers) {
      // tax, freight or round-off lines carry amounts but are not goods
      finish();
      continue;
    } else if (current && text) {
      current.parts.push(text);
      continue;
    } else {
      continue;
    }

    const qty = (byColumn.qty ?? []).join(' ').match(/^\s*(-?[\d,]+(?:\.\d+)?)\s*([A-Za-z][A-Za-z./]*)?/);
    current.hsnCode = (byColumn.hsn ?? []).join('').trim() || null;
    current.quantity = qty ? toNumber(qty[1]) : null;
    current.unit = (qty?.[2] || (byColumn.per ?? []).join(' ').trim()) || null;
    current.rate = toNumber((byColumn.rate ?? []).join(' '));
    current.amount = toNumber((byColumn.amount ?? []).join(' '));
  }
  finish();
  if (!lines.length) warnings.push('The item table was found but no item lines could be read.');
  return lines;
}

/** The text printed just below a label such as "Invoice No." (same column, within a line or two). */
function valueBelow(rows: Row[], label: RegExp): string | null {
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i].cells.find((c) => label.test(c.text.trim()));
    if (!cell) continue;
    for (const next of rows.slice(i + 1, i + 3)) {
      const value = next.cells.filter((c) => c.x >= cell.x - 15 && c.x <= cell.x + 15);
      if (value.length) return value.map((c) => c.text.trim()).join('').trim() || null;
    }
  }
  return null;
}

function readParties(rows: Row[]): { seller: string | null; buyer: string | null } {
  const LEFT = 350;
  const titleIndex = rows.findIndex((r) => /invoice|bill|estimate|quotation/i.test(rowText(r)) && r.cells.length <= 3);
  const sellerRow = rows.slice(titleIndex + 1).find((r) => rowText(r, LEFT));
  const buyerIndex = rows.findIndex((r) => /^(buyer|bill(ed)? to|consignee|ship to|to:?)\b/i.test(rowText(r, LEFT)));
  const buyerRow = buyerIndex >= 0 ? rows.slice(buyerIndex + 1).find((r) => rowText(r, LEFT)) : undefined;
  return {
    seller: sellerRow ? rowText(sellerRow, LEFT) : null,
    buyer: buyerRow ? rowText(buyerRow, LEFT) : null,
  };
}

/** Read an invoice PDF (text-based, e.g. exported from Tally, Zoho, Busy) into its item lines. */
export async function parseInvoicePdf(file: Buffer): Promise<ParsedInvoice> {
  if (file.subarray(0, 4).toString('latin1') !== '%PDF') throw new BadRequestException('That file is not a PDF');
  let fragments: Fragment[];
  try {
    fragments = await readFragments(file);
  } catch {
    throw new BadRequestException('Could not read that PDF');
  }
  if (!fragments.length) {
    throw new BadRequestException('This PDF has no readable text (it looks like a scan). Upload a PDF exported from your billing software.');
  }
  const rows = buildRows(fragments);
  const warnings: string[] = [];
  const lines = readTable(rows, warnings);
  return {
    invoiceNumber: valueBelow(rows, /^invoice$/i),
    invoiceDate: valueBelow(rows, /^dated$/i),
    ...readParties(rows),
    lines,
    warnings,
  };
}
