
import { BadRequestException } from '@nestjs/common';

// The package entry point runs a debug routine; the library file is the safe import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (data: Uint8Array, options?: Record<string, unknown>) => Promise<unknown> = require('pdf-parse/lib/pdf-parse.js');

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
  /** Combined GST rate in percent (CGST + SGST, or IGST); null when the invoice does not say. */
  gstRate: number | null;
  /** GST on this line, worked out from the rate. */
  gstAmount: number | null;
  /** Amount plus GST. */
  lineTotal: number | null;
}

export interface ParsedInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  seller: string | null;
  buyer: string | null;
  /** Whether the tax is split into CGST + SGST (same state) or charged as IGST. */
  taxType: 'cgst_sgst' | 'igst' | null;
  /** The invoice's printed grand total, when it could be read. */
  grandTotal: number | null;
  lines: ParsedInvoiceLine[];
  warnings: string[];
}

const ROW_TOLERANCE = 3;   // fragments of one printed line differ slightly in y
const MERGE_GAP = 1;       // fragments closer than this belong to the same word / number
const PAGE_GAP = 10000;    // keeps pages in reading order when sorting by y

async function readFragments(file: Uint8Array): Promise<Fragment[]> {
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

interface Column { key: 'hsn' | 'qty' | 'rate' | 'per' | 'disc' | 'amount'; x: number; mid: number }

/** Where each numeric column of the item table starts, read from the header row. */
function readColumns(header: Row): { columns: Column[]; serialX: number | null } {
  const columns: Column[] = [];
  let serialX: number | null = null;
  const add = (key: Column['key'], cell: Cell) => { if (!columns.some((c) => c.key === key)) columns.push({ key, x: cell.x, mid: (cell.x + cell.end) / 2 }); };
  for (const c of header.cells) {
    const t = c.text.trim().toLowerCase();
    if (/^(sl|sr|s\.?\s?no|#)/.test(t)) serialX ??= c.x;
    else if (/^(hsn|sac)/.test(t)) add('hsn', c);
    else if (/^(quantity|qty)/.test(t)) add('qty', c);
    else if (/^(rate|price)/.test(t)) add('rate', c);
    else if (/^per$/.test(t)) add('per', c);
    else if (/^disc/.test(t)) add('disc', c);
    else if (/^(amount|total)/.test(t)) add('amount', c);
  }
  return { columns: columns.sort((a, b) => a.x - b.x), serialX };
}

/**
 * A cell belongs to the column whose header it sits closest to (centre to centre). Numbers are often right-aligned under
 * their header, so comparing start positions would push them into the next column.
 */
function columnOf(cell: Cell, columns: Column[]): Column['key'] | 'left' {
  const first = columns[0];
  const firstGap = columns[1] ? (columns[1].x - first.x) / 2 : 30;
  if (cell.x < first.x - firstGap) return 'left';
  const mid = (cell.x + cell.end) / 2;
  let best = first;
  for (const c of columns) if (Math.abs(c.mid - mid) < Math.abs(best.mid - mid)) best = c;
  return best.key;
}

function readTable(rows: Row[], warnings: string[]): { lines: ParsedInvoiceLine[]; grandTotal: number | null } {
  const headerIndex = rows.findIndex((r) => {
    const t = rowText(r).toLowerCase();
    return t.includes('description') && /quantity|qty/.test(t) && /amount|total/.test(t);
  });
  if (headerIndex < 0) {
    warnings.push('Could not find the item table (a header with Description, Quantity and Amount).');
    return { lines: [], grandTotal: null };
  }
  const { columns, serialX: headerSerialX } = readColumns(rows[headerIndex]);
  if (!columns.some((c) => c.key === 'qty')) {
    warnings.push('The item table has no quantity column.');
    return { lines: [], grandTotal: null };
  }

  const body: Row[] = [];
  let grandTotal: number | null = null;
  for (const r of rows.slice(headerIndex + 1)) {
    if (/^(total|sub\s?total|amount chargeable|grand total)\b/i.test(rowText(r, columns[0].x))) {
      // the printed total sits in the amount column of this row
      const amountColumn = columns.find((c) => c.key === 'amount');
      const cells = amountColumn ? r.cells.filter((c) => c.x >= amountColumn.x - 20) : [];
      // a "Subtotal" row is not the invoice total
      grandTotal = /^sub\s?total/i.test(rowText(r, columns[0].x)) ? null : toNumber(cells.map((c) => c.text).join(''));
      break;
    }
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
      const col = columnOf(c, columns);
      if (col === 'left' && /^\d{1,3}$/.test(c.text.trim()) && c.x <= serialX + 8) { serial = true; continue; }
      (byColumn[col] ??= []).push(c.text.trim());
    }
    const hasNumbers = ['qty', 'rate', 'amount'].some((k) => byColumn[k]?.length);
    const text = (byColumn.left ?? []).join(' ');

    if (serial) {
      finish();
      current = { description: '', parts: text ? [text] : [], hsnCode: null, quantity: null, unit: null, rate: null, amount: null, gstRate: null, gstAmount: null, lineTotal: null };
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
  for (const l of lines) {
    if (l.rate === null && l.quantity && l.amount !== null) l.rate = Math.round((l.amount / l.quantity) * 100) / 100;
  }
  if (!lines.length) warnings.push('The item table was found but no item lines could be read.');
  return { lines, grandTotal };
}

interface TaxRow { hsn: string | null; rate: number }

/** Invoices that print their tax as plain rows ("CGST 9%", "SGST 9%" or "IGST 18%") instead of a summary table. */
function readTaxLines(rows: Row[]): { taxRows: TaxRow[]; taxType: 'cgst_sgst' | 'igst' | null } {
  const rates = new Map<string, number>();
  for (const r of rows) {
    const m = rowText(r).match(/\b(CGST|SGST|UTGST|IGST|GST)\b\s*(?:@|-|:)?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (m) rates.set(m[1].toUpperCase(), parseFloat(m[2]));
  }
  if (!rates.size) return { taxRows: [], taxType: null };
  // a single "GST @ 18%" row is already the combined rate; CGST/SGST rows are added together
  if (rates.size === 1 && rates.has('GST')) return { taxRows: [{ hsn: null, rate: rates.get('GST')! }], taxType: 'cgst_sgst' };
  rates.delete('GST');
  const total = [...rates.values()].reduce((a, b) => a + b, 0);
  return { taxRows: [{ hsn: null, rate: total }], taxType: rates.has('IGST') ? 'igst' : 'cgst_sgst' };
}

/**
 * The tax summary under the items ("Taxable Value | Central Tax Rate Amount | State Tax Rate Amount"): its rates, per HSN
 * when the invoice lists them that way. Item lines rarely print their own GST, so this is where it comes from.
 */
function readTaxSummary(rows: Row[]): { taxRows: TaxRow[]; taxType: 'cgst_sgst' | 'igst' | null } {
  const headerIndex = rows.findIndex((r) => {
    const t = rowText(r).toLowerCase();
    return t.includes('taxable') && /central|state|integrated|cgst|sgst|igst/.test(t);
  });
  if (headerIndex < 0) return readTaxLines(rows);
  const headerText = rowText(rows[headerIndex]).toLowerCase() + ' ' + rowText(rows[headerIndex + 1] ?? { y: 0, cells: [] }).toLowerCase();
  const taxType = /integrated|igst/.test(headerText) ? 'igst' : 'cgst_sgst';

  const taxRows: TaxRow[] = [];
  for (const r of rows.slice(headerIndex + 1, headerIndex + 12)) {
    if (/^(tax amount|company|declaration|total)\b/i.test(rowText(r))) break;
    const cells = [...r.cells].sort((a, b) => a.x - b.x).map((c) => c.text.trim());
    const percents = cells.filter((c) => /^\d+(\.\d+)?%$/.test(c));
    if (!percents.length) continue;
    const beforeFirstPercent = cells.slice(0, cells.findIndex((c) => /%$/.test(c))).filter((c) => /^[\d,]+(\.\d+)?$/.test(c));
    const hsn = beforeFirstPercent.length >= 2 && /^\d{4,8}$/.test(beforeFirstPercent[0]) ? beforeFirstPercent[0] : null;
    taxRows.push({ hsn, rate: percents.reduce((sum, c) => sum + parseFloat(c), 0) });
  }
  return { taxRows, taxType };
}

const money = (n: number) => Math.round(n * 100) / 100;

/** Give every item its GST rate (by HSN when the summary lists several rates, else the single rate) and its split amounts. */
function applyGst(lines: ParsedInvoiceLine[], taxRows: TaxRow[], warnings: string[]) {
  if (!taxRows.length) {
    warnings.push('No GST summary found on the invoice, so GST is not shown per item.');
    return;
  }
  const rates = new Set(taxRows.map((t) => t.rate));
  let unresolved = 0;
  for (const line of lines) {
    const byHsn = line.hsnCode ? taxRows.find((t) => t.hsn === line.hsnCode) : undefined;
    const rate = byHsn?.rate ?? (rates.size === 1 ? taxRows[0].rate : null);
    if (rate === null || line.amount === null) { unresolved += 1; continue; }
    line.gstRate = rate;
    line.gstAmount = money((line.amount * rate) / 100);
    line.lineTotal = money(line.amount + line.gstAmount);
  }
  if (unresolved) warnings.push(`GST could not be matched for ${unresolved} item(s): the invoice lists several rates and these have no matching HSN code.`);
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

/** "Invoice No: DEMO-001" printed on one line: the text after the label. */
function valueInline(rows: Row[], label: RegExp): string | null {
  for (const r of rows) {
    const text = rowText(r);
    const m = text.match(label);
    if (m && m.index !== undefined) {
      const value = text.slice(m.index + m[0].length).trim();
      if (value) return value;
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
    // a "From" / "Bill To" label with the name printed just below it is the most reliable layout
    seller: valueBelow(rows, /^from$/i) ?? (sellerRow ? rowText(sellerRow, LEFT) : null),
    buyer: valueBelow(rows, /^bill\s*to$/i) ?? (buyerRow ? rowText(buyerRow, LEFT) : null),
  };
}

/** Read an invoice PDF (text-based, e.g. exported from Tally, Zoho, Busy) into its item lines. */
export async function parseInvoicePdf(file: Buffer): Promise<ParsedInvoice> {
  if (file.subarray(0, 4).toString('latin1') !== '%PDF') throw new BadRequestException('That file is not a PDF');
  let fragments: Fragment[];
  try {
    // Hand the library a plain Uint8Array: inside the running Nest app it fails on a Node Buffer ("bad XRef entry" on
    // valid files) but reads the same bytes from a Uint8Array.
    fragments = await readFragments(new Uint8Array(file));
  } catch (err) {
    // the reason (password-protected, damaged, unsupported) is what the user needs to fix it
    const reason = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(`Could not read that PDF (${reason.slice(0, 120)})`);
  }
  if (!fragments.length) {
    throw new BadRequestException('This PDF has no readable text (it looks like a scan). Upload a PDF exported from your billing software.');
  }
  const rows = buildRows(fragments);
  const warnings: string[] = [];
  const table = readTable(rows, warnings);
  const lines = table.lines;
  // the last "Total" / "Grand Total" row, when the item table did not end on one
  const totalRow = [...rows].reverse().find((r) => /^(grand\s*)?total\b/i.test(rowText(r)));
  const grandTotal = table.grandTotal ?? (totalRow ? toNumber(rowText(totalRow).replace(/^(grand\s*)?total/i, '')) : null);
  const { taxRows, taxType } = readTaxSummary(rows);
  applyGst(lines, taxRows, warnings);
  return {
    // "Invoice No: X" on one line first; Tally-style invoices print the value below the "Invoice" / "Dated" labels
    invoiceNumber: valueInline(rows, /invoice\s*(?:no|number|#)\.?\s*:/i) ?? valueBelow(rows, /^invoice$/i),
    invoiceDate: valueInline(rows, /(?<!due\s)\bdate\s*:/i) ?? valueBelow(rows, /^dated$/i),
    ...readParties(rows),
    taxType,
    grandTotal,
    lines,
    warnings,
  };
}
