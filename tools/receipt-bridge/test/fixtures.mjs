import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Journal } from "../journal.mjs";
import { ReceiptBridge } from "../service.mjs";

export const ORIGIN = "https://mealdeck.co.uk";
export const JOB = "aaaaaaaa-1111-4111-8111-111111111111";
export const NEXT_JOB = "bbbbbbbb-2222-4222-8222-222222222222";
export const CLAIM = "cccccccc-3333-4333-8333-333333333333";
export const ORDER = "dddddddd-4444-4444-8444-444444444444";
export function fixture() {
  return {
    schemaVersion: 1,
    orderId: ORDER,
    copyNumber: 1,
    reprintOf: null,
    reprintReason: null,
    displayCode: "0427",
    brand: "MealDeck",
    tradingName: "313 Brands Ltd",
    locationName: "Luton",
    createdAt: "2026-11-05T15:55:00.000Z",
    paidAt: "2026-11-05T16:05:00.000Z",
    acceptedAt: "2026-11-05T16:06:00.000Z",
    fulfilment: "curbside",
    customerName: "Test Customer",
    car: { make: "Ford", colour: "Blue", registrationLast4: "AB12" },
    cutleryRequested: true,
    packingPlan: {
      version: 1,
      separateBags: true,
      cutleryRequested: true,
      bags: [1, 2].map((number) => ({
        number,
        allocations: [
          { lineId: "burger", quantity: 1 },
          { lineId: "fries", quantity: 1 },
          { lineId: "mocktail", quantity: 1 },
        ],
      })),
    },
    items: [
      {
        lineId: "burger",
        parentLineId: null,
        brandName: "Tavo",
        name: "Cruncher",
        quantity: 2,
        baseUnitPence: 449,
        unitPence: 849,
        linePence: 1698,
        notes: "No gherkin",
        modifiers: [
          {
            name: "Fries and drink",
            groupName: "Make it a meal",
            quantityPerParent: 1,
            priceDeltaPence: 250,
          },
          {
            name: "Fiery Sweet Chilli",
            groupName: "Dip your burger",
            quantityPerParent: 1,
            priceDeltaPence: 150,
          },
        ],
      },
      {
        lineId: "fries",
        parentLineId: "burger",
        brandName: "Load’d",
        name: "King of Hearts loaded fries",
        quantity: 2,
        baseUnitPence: 299,
        unitPence: 299,
        linePence: 598,
        notes: null,
        modifiers: [],
      },
      {
        lineId: "mocktail",
        parentLineId: "burger",
        brandName: "Moktl",
        name: "Mango Mirage",
        quantity: 2,
        baseUnitPence: 299,
        unitPence: 299,
        linePence: 598,
        notes: null,
        modifiers: [
          {
            name: "Mango Mirage",
            groupName: "Mocktail flavour",
            quantityPerParent: 1,
            priceDeltaPence: 0,
          },
        ],
      },
    ],
    subtotalPence: 2894,
    discountPence: 868,
    totalPence: 2026,
    currency: "GBP",
    orderNotes: "Please keep both meals in separate bags.",
  };
}
export const job = (receipt = fixture(), jobId = JOB) => ({ jobId, claimToken: CLAIM, receipt });
export async function harness(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "mealdeck-bridge-test-"));
  const h = {
    directory,
    writes: [],
    canonical: fixture(),
    lookups: [],
    journal: null,
    bridge: null,
  };
  const writer =
    options.writer ??
    (async (bytes, beforeWrite) => {
      await beforeWrite();
      h.writes.push(Buffer.from(bytes));
    });
  const fetchClaimedReceipt =
    options.fetchClaimedReceipt ??
    (async (input) => {
      h.lookups.push(input);
      return structuredClone(h.canonical);
    });
  const start = async () => {
    h.journal = await Journal.open(directory);
    h.bridge = new ReceiptBridge({
      journal: h.journal,
      writer,
      allowedOrigins: [ORIGIN],
      profile: options.profile ?? {},
      fetchClaimedReceipt,
    });
  };
  await start();
  h.restart = async () => {
    await h.journal.close();
    h.journal = null;
    await start();
  };
  t.after(async () => {
    if (h.journal) await h.journal.close();
    await rm(directory, { recursive: true, force: true });
  });
  return h;
}
