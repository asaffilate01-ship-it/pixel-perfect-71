import { mealDeckArtwork } from "@/lib/brand-logos";

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
      alt={decorative ? "" : "MealDeck — One Order. Every Craving."}
      aria-hidden={decorative || undefined}
      width={mealDeckArtwork.width}
      height={mealDeckArtwork.height}
      loading={loading}
      decoding="async"
    />
  );
}
