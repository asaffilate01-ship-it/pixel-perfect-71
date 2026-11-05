import { mealDeckArtwork } from "@/lib/brand-logos";
import { MEALDECK_BUSINESS } from "@/lib/business-identity";

/** Keep the full approved card, including its existing registered mark, visible. */
export function MealDeckLogo({
  className = "",
  decorative = false,
  loading = "eager",
}: {
  className?: string;
  decorative?: boolean;
  loading?: "eager" | "lazy";
}) {
  return (
    <img
      className={`md-mealdeck-logo ${className}`}
      src={mealDeckArtwork.src}
      alt={decorative ? "" : `MealDeck — ${MEALDECK_BUSINESS.tagline}`}
      aria-hidden={decorative || undefined}
      width={mealDeckArtwork.width}
      height={mealDeckArtwork.height}
      loading={loading}
      decoding="async"
    />
  );
}
