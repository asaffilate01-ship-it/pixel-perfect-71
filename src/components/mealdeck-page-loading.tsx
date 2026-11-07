import { LoaderCircle } from "lucide-react";

/** Eager, provider-free fallback: it must also work before a route is ready. */
export function MealDeckPageLoading() {
  return (
    <section
      className="flex min-h-[55svh] items-center justify-center bg-background px-6 py-12 text-foreground"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <LoaderCircle className="size-7 text-primary motion-safe:animate-spin" aria-hidden="true" />
        <p className="font-display text-lg font-semibold">Loading your page…</p>
      </div>
    </section>
  );
}
