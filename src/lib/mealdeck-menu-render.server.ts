import { parseMealDeckPublicMenu, type MealDeckPublicMenuSnapshot } from "./mealdeck-public-menu";
import { handlePublicMenuRequest } from "./mealdeck-public-menu.server";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

const MENU_RENDER_TIMEOUT_MS = 2_000;

/**
 * Render the same reviewed public menu as the browser endpoint. No request data,
 * customer cookie, tenant selector or privileged credential enters this read.
 */
export async function readMealDeckMenuForRender(
  env: MealDeckRuntimeEnv,
  fetcher: typeof fetch = fetch,
  requestSignal?: AbortSignal,
): Promise<MealDeckPublicMenuSnapshot | null> {
  if (requestSignal?.aborted) return null;
  const deadline = AbortSignal.timeout(MENU_RENDER_TIMEOUT_MS);
  const boundedFetch: typeof fetch = async (input, init) => {
    const signals = [
      deadline,
      requestSignal,
      init?.signal,
      input instanceof Request ? input.signal : undefined,
    ].filter((signal): signal is AbortSignal => !!signal);
    const signal = AbortSignal.any(signals);
    signal.throwIfAborted();
    return fetcher(input, { ...init, signal, cache: "no-store" });
  };

  try {
    const response = await handlePublicMenuRequest(
      new Request("https://mealdeck.co.uk/api/public/menu"),
      env,
      boundedFetch,
    );
    if (!response.ok) return null;
    return parseMealDeckPublicMenu(await response.json());
  } catch {
    // A slow/unavailable menu must not break the page. Client refresh retains
    // its ordinary failure state and never treats a source fallback as live.
    return null;
  }
}
