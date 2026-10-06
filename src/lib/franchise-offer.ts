export const OFFER_VERSION = "2026-10-06";

export type Territory = {
  code: string;
  name: string;
  region: string;
  status: string;
  fee: number | null;
  currency: string;
  isSellable: boolean;
  note?: string;
};

/** Public operator-franchise terms. Location-specific setup costs are quoted separately. */
export const DEFAULT_PROGRAMME = Object.freeze({
  key: "mealdeck-england-wales",
  name: "MealDeck England & Wales",
  currency: "GBP",
  feeMin: 7500,
  feeMax: 25000,
  royaltyPercent: 5.5,
  marketingPercent: 1.5,
  techFeePerOrder: 0.25,
  supplyMarkupPercent: 10,
});

export const TAKEN_MARKETS = [
  { name: "Luton", status: "taken", note: "LU4 8NU" },
  { name: "St Albans", status: "taken", note: "AL1 3JU" },
  { name: "Bedford", status: "taken", note: "Elstow Road" },
  { name: "Milton Keynes", status: "taken", note: "Existing network allocation" },
  { name: "Islington / Camden", status: "taken", note: "N7 8XH · Caledonian Road area" },
] as const;

const planned = (code: string, name: string, note: string): Territory => ({
  code: "planned-" + code,
  name,
  region: "London",
  status: "planned",
  fee: null,
  currency: "GBP",
  isSellable: false,
  note,
});

/** Search areas only: none of these entries represents a live availability claim or reservation. */
export const PLANNED_TERRITORIES: Territory[] = [
  planned("southall", "Southall", "Outer-west search area. The exact site and territory are assessed together."),
  planned("battersea", "Battersea", "South-west search area around suitable Battersea Park Road / Queenstown Road premises."),
  planned("bow-mile-end", "Bow / Mile End", "Inner-east search area. Delivery boundaries are assessed from the selected kitchen."),
  planned("acton", "Acton / North Acton", "Compare suitable premises with Park Royal and Alperton before selecting the initial western kitchen."),
  planned("central-south", "Borough / west Bermondsey", "Central-south search area; Elephant & Castle is an alternative site orientation."),
  planned("deptford", "Deptford / New Cross", "South-east search area, with its boundary assessed against the central-south kitchen."),
  planned("kilburn", "Kilburn", "A later north-west candidate, subject to incremental demand and neighbouring territories."),
  planned("alperton", "Alperton / Wembley", "An alternative western search area to compare with Acton / North Acton / Park Royal."),
  planned("stratford-leyton", "Stratford / Leyton", "A further east / north-east candidate, assessed alongside the first eastern kitchen."),
  planned("tottenham-edmonton", "Tottenham / Edmonton", "A future northern search area, subject to site and territory assessment."),
  planned("barking-ilford", "Barking / Ilford", "A future eastern search area, subject to site and territory assessment."),
  planned("croydon", "Thornton Heath / Croydon", "A future southern search area, subject to site and territory assessment."),
];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function label(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return Array.from(value.trim(), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("").slice(0, max);
}

function normalName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const takenNames = new Set([
  "luton", "luton dunstable", "st albans", "bedford", "milton keynes", "islington", "islington camden",
  "camden islington", "islington caledonian road area", "islington camden caledonian road area",
]);
const takenPostcodes = ["LU48NU", "AL13JU", "N78XH"];

/** Protect known allocated anchors without treating all of Camden as allocated. */
function allocatedAnchor(value: Record<string, unknown>): boolean {
  const name = normalName(label(value["name"], 160));
  if (takenNames.has(name)) return true;
  const postcodeFields = [value["name"], value["postcode"], value["anchorPostcode"], value["anchor_postcode"], value["note"]];
  return postcodeFields.some((part) => {
    const compact = label(part, 400).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return takenPostcodes.some((postcode) => compact.includes(postcode));
  });
}

/** Allowlist public fields and fail closed for malformed or contradictory availability. */
export function normaliseTerritories(input: unknown): Territory[] {
  if (!Array.isArray(input)) return [];
  const result = new Map<string, Territory>();
  for (const item of input.slice(0, 500)) {
    if (!record(item)) continue;
    const rawCode = typeof item["code"] === "string" ? item["code"].trim() : "";
    if (rawCode.length > 40) continue;
    const code = label(rawCode, 40);
    const name = label(item["name"], 160);
    const region = label(item["region"], 80);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(code) || !name || !region) continue;
    if (item["currency"] !== undefined && item["currency"] !== "GBP") continue;
    const rawStatus = label(item["status"], 40).toLowerCase();
    const knownStatuses = ["available", "taken", "reserved", "coming_soon", "unavailable", "planned"];
    let status = knownStatuses.includes(rawStatus) ? rawStatus : "planned";
    if (allocatedAnchor(item)) status = "taken";
    if (status === "available" && item["isSellable"] !== true) status = "unavailable";
    const fee = typeof item["fee"] === "number" && Number.isFinite(item["fee"]) && item["fee"] >= DEFAULT_PROGRAMME.feeMin && item["fee"] <= DEFAULT_PROGRAMME.feeMax ? item["fee"] : null;
    const territory: Territory = {
      code, name, region, status, fee, currency: "GBP",
      isSellable: status === "available" && item["isSellable"] === true,
    };
    const previous = result.get(code);
    if (previous) {
      // Duplicate entries cannot re-enable a previously unavailable or contradictory territory.
      if (previous.name !== name || previous.status !== status || previous.isSellable !== territory.isSellable) {
        result.set(code, { ...previous, status: "unavailable", isSellable: false, fee: null });
      }
      continue;
    }
    result.set(code, territory);
  }
  return [...result.values()];
}

export function money(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

export function techFee(value: number): string {
  return Math.round(value * 100) + "p";
}
