export type ServiceConfirmation = {
  postcode: string;
  fulfilment: string;
  location: string;
  channelOpen: boolean;
};

export function normalisePostcode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

/** Browser guidance only. The server must independently recheck coverage. */
export function checkoutBlocker(input: {
  comingSoon: boolean;
  loading: boolean;
  source?: string | undefined;
  channelOpen: boolean;
  fulfilmentAllowed: boolean;
  lineCount: number;
  postcode: string;
  location: string | null;
  fulfilment: string;
  confirmation: ServiceConfirmation | null;
}): string | null {
  if (input.comingSoon) return "Ordering is not open yet. You can still browse MealDeck.";
  if (input.loading) return "Checking the latest menu. Please wait.";
  if (input.source !== "live") return "This is a preview menu. Live checkout is unavailable.";
  if (!input.location || !input.fulfilmentAllowed) return "Choose an available collection or delivery option for this kitchen.";
  if (!input.channelOpen) return "This kitchen is closed for orders. You can still browse the menu.";
  if (!input.lineCount) return "Add a dish to your basket first.";
  const confirmed = input.confirmation;
  if (!confirmed || !normalisePostcode(input.postcode)
    || normalisePostcode(confirmed.postcode) !== normalisePostcode(input.postcode)
    || confirmed.fulfilment !== input.fulfilment || confirmed.location !== input.location) {
    return "Check your current postcode and fulfilment option before continuing.";
  }
  if (!confirmed.channelOpen) return "Your chosen service is currently closed. Check your postcode again later.";
  return null;
}

/** Resolve only configured location IDs; never guess a kitchen from a postcode. */
export function serviceLocation(
  value: unknown,
  locations: ReadonlyArray<{ key: "luton" | "stalbans"; locationId: string; tenantId: string }>,
): { location: "luton" | "stalbans"; channelOpen: boolean } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const data = row as Record<string, unknown>;
  if (data["served"] !== true || typeof data["location_id"] !== "string") return null;
  const matches = locations.filter(entry => entry.locationId && entry.tenantId && entry.locationId === data["location_id"] && entry.tenantId === data["tenant_id"]);
  if (matches.length !== 1) return null;
  return { location: matches[0]!.key, channelOpen: data["channel_open"] === true };
}
