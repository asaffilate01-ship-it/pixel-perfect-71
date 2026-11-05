export type MealDeckCheckoutMode = "member" | "guest";

export const CHECKOUT_MODE_KEY = "mealdeck-checkout-mode-v1";

/** Guest requests use the private browser cookie, even when a member is signed in. */
export async function requestMealDeckCheckout<T>(
  mode: MealDeckCheckoutMode,
  input: Record<string, unknown>,
  getAccessToken: () => Promise<string | null>,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mode === "member") {
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in and verify your email to continue.");
    headers["Authorization"] = "Bearer " + token;
  }
  const response = await request("/api/checkout", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    credentials: "same-origin",
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  const result = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new Error(result.message ?? "We couldn't complete that request. Please try again.");
  return result;
}
