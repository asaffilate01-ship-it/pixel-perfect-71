/** Asset failures need a new document; invalidation reuses the failed module URL. */
export function isRouteAssetError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = error.message;
  if (typeof message !== "string") return false;

  return (
    message.startsWith("Failed to fetch dynamically imported module") ||
    message.startsWith("error loading dynamically imported module") ||
    message.startsWith("Importing a module script failed") ||
    message.startsWith("Unable to preload CSS for ")
  );
}

export async function recoverMealDeckRoute(
  error: unknown,
  actions: {
    invalidate: () => Promise<unknown>;
    reset: () => void;
    reload: () => void;
  },
): Promise<void> {
  if (isRouteAssetError(error)) {
    // Only a deliberate user action reaches this branch. TanStack already owns
    // its one-time automatic module recovery; do not create another reload loop.
    actions.reload();
    return;
  }

  // Resetting before the loader settles can immediately display its old error.
  await actions.invalidate();
  actions.reset();
}
