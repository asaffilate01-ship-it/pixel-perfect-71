/** Marketing only. Never use this result to authorise a quote or payment. */
export function publicDeliveryAvailable(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = value as Record<string, unknown>;
  return (
    status.available === true &&
    Array.isArray(status.fulfilments) &&
    status.fulfilments.includes("delivery")
  );
}

/** Anonymous, no-store request; only the public boolean enters the query cache. */
export async function readPublicDeliveryAvailability(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetcher("/api/checkout", {
    signal,
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Delivery availability could not be checked.");
  return publicDeliveryAvailable(await response.json());
}
