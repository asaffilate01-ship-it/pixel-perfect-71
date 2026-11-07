export type ReceiptModifier = {
  name: string;
  groupName: string;
  quantityPerParent: number;
  priceDeltaPence: number;
};
export type ReceiptItem = {
  lineId: string;
  parentLineId: string | null;
  brandName: string;
  name: string;
  quantity: number;
  baseUnitPence: number;
  unitPence: number;
  linePence: number;
  notes: string | null;
  modifiers: ReceiptModifier[];
  mealComponents?: {
    slot: "main" | "side" | "drink";
    name: string;
    quantityPerParent: number;
    replacement: boolean;
  }[];
};
export type ReceiptPackingPlan = {
  version: 1;
  separateBags: boolean;
  cutleryRequested: boolean;
  bags: { number: number; name?: string; allocations: { lineId: string; quantity: number }[] }[];
};
export type MealDeckReceipt = {
  schemaVersion: 1;
  orderId: string;
  copyNumber: number;
  reprintOf: string | null;
  reprintReason: string | null;
  displayCode: string;
  orderNumber?: string | null;
  paymentMethod?: "card" | "cash";
  brand: "MealDeck";
  tradingName: "313 Brands Ltd";
  locationName: string;
  createdAt: string;
  paidAt: string;
  acceptedAt: string;
  fulfilment: "pickup" | "curbside";
  customerName: string;
  car: null | { make: string; colour: string; registrationLast4: string };
  cutleryRequested: boolean;
  packingPlan: ReceiptPackingPlan;
  items: ReceiptItem[];
  subtotalPence: number;
  discountPence: number;
  totalPence: number;
  currency: "GBP";
  orderNotes: string | null;
};
export type PrinterProfile = {
  columns?: 32 | 42 | 48;
  cut?: "none" | "partial" | "full";
  feedLines?: number;
};
export const RECEIPT_LIMITS: Readonly<{
  items: 180;
  bags: 10;
  modifiers: 100;
  lines: 600;
  bytes: 32768;
}>;
export class ReceiptError extends Error {
  code: string;
  constructor(code: string);
}
export function validateReceipt(input: unknown): MealDeckReceipt;
export function encodeReceiptLogo(): Uint8Array;
export function encodeReceiptGamesQr(): Uint8Array;
export function encodeReceipt(
  input: unknown,
  profile?: PrinterProfile,
): { bytes: Uint8Array; text: string; lineCount: number; warnings: string[] };
