/**
 * GST invoice arithmetic. Pure functions, no database, so the same rules can be unit-tested and
 * mirrored in the browser for the live preview (frontend/lib/gst.ts must stay in step with this).
 *
 *   gross       = quantity × price per unit
 *   discount    = a flat amount or a percentage of gross (never more than gross)
 *   taxable     = gross − discount
 *   GST         = taxable × GST rate
 *   line total  = taxable + GST
 *
 * Within one state GST is split equally into CGST + SGST; between states it is all IGST.
 */
export type DiscountType = 'amount' | 'percent';
export type SupplyKind = 'intra' | 'inter';

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineInput {
  quantity: number;
  rate: number;
  /** GST rate in percent (0 for exempt / nil-rated). */
  taxRate: number;
  discountType?: DiscountType;
  discountValue?: number;
}

export interface LineCalc {
  /** quantity × rate, before discount */
  amount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
}

export function calcLine(l: LineInput): LineCalc | { error: string } {
  const amount = round2(l.quantity * l.rate);
  const value = l.discountValue ?? 0;
  if (value < 0) return { error: 'discount cannot be negative' };
  const type = l.discountType ?? 'amount';
  if (type === 'percent' && value > 100) return { error: 'discount cannot be more than 100%' };
  const discountAmount = round2(type === 'percent' ? (amount * value) / 100 : value);
  if (discountAmount > amount) return { error: 'discount cannot be more than the line amount' };
  const taxableAmount = round2(amount - discountAmount);
  const gstAmount = round2((taxableAmount * l.taxRate) / 100);
  return { amount, discountAmount, taxableAmount, gstAmount, lineTotal: round2(taxableAmount + gstAmount) };
}

/** First two digits of a valid-looking GSTIN are the state code (e.g. 29 = Karnataka). */
export function stateCode(gstin?: string | null): string | null {
  const g = (gstin ?? '').trim();
  return /^\d{2}[0-9A-Za-z]{13}$/.test(g) ? g.slice(0, 2) : null;
}

/**
 * Intra-state (CGST + SGST) or inter-state (IGST).
 * The place of supply is the one the user gave, otherwise the customer's GSTIN state. When either
 * state is unknown the sale is treated as within the seller's own state.
 */
export function supplyKind(sellerGstin?: string | null, customerGstin?: string | null, placeOfSupply?: string | null): SupplyKind {
  const seller = stateCode(sellerGstin);
  const buyer = placeOfSupply?.trim() || stateCode(customerGstin);
  return seller && buyer && seller !== buyer ? 'inter' : 'intra';
}

export interface Totals {
  /** Sum of gross line amounts, before any discount. */
  subtotal: number;
  /** Line discounts plus any invoice-level discount. */
  discount: number;
  /** Subtotal minus line discounts: the value GST is charged on. */
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  total: number;
}

export function calcTotals(
  lines: LineCalc[],
  kind: SupplyKind,
  opts: { extraDiscount?: number; roundOff?: boolean } = {},
): Totals | { error: string } {
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const lineDiscount = round2(lines.reduce((s, l) => s + l.discountAmount, 0));
  const taxableValue = round2(subtotal - lineDiscount);
  const gst = round2(lines.reduce((s, l) => s + l.gstAmount, 0));

  // Split so that CGST + SGST always add back to exactly the GST charged.
  const cgst = kind === 'intra' ? round2(gst / 2) : 0;
  const sgst = kind === 'intra' ? round2(gst - cgst) : 0;
  const igst = kind === 'inter' ? gst : 0;

  const extra = round2(opts.extraDiscount ?? 0);
  if (extra < 0) return { error: 'Discount cannot be negative' };
  if (extra > taxableValue + gst) return { error: 'Discount cannot exceed the invoice total' };

  const beforeRound = round2(taxableValue + gst - extra);
  const roundOff = opts.roundOff ? round2(Math.round(beforeRound) - beforeRound) : 0;
  return {
    subtotal,
    discount: round2(lineDiscount + extra),
    taxableValue,
    cgst, sgst, igst,
    taxTotal: gst,
    roundOff,
    total: round2(beforeRound + roundOff),
  };
}
