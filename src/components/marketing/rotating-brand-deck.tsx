import { useEffect, useRef, useState } from "react";
import cardBack from "@/assets/mealdeck-card-back.png";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { mealDeckArtwork, logoDimensionsBySrc } from "@/lib/brand-logos";
import { marketingBrands } from "@/lib/marketing-brands";
import { chefTitles, heroFoodDeck } from "@/lib/hero-food-deck";
import { suitArtwork } from "@/lib/food-suit-artwork";
import { MEALDECK_BUSINESS } from "@/lib/business-identity";
import { useDeckMotion } from "@/hooks/use-deck-motion";
const stepSeconds = 3;
const introDuration = 4600;

function CardBack({ side }: { side: "left" | "right" }) {
  return (
    <div className={`md-deck-shadow md-deck-shadow-${side}`} aria-hidden="true">
      <img
        src={cardBack}
        alt=""
        className="md-deck-back-art"
        width={896}
        height={1200}
        decoding="async"
      />
    </div>
  );
}

function shuffleBrands<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    const other = copy[j];
    if (tmp === undefined || other === undefined) continue;
    copy[i] = other;
    copy[j] = tmp;
  }
  return copy;
}

export function RotatingBrandDeck() {
  const stageRef = useRef<HTMLDivElement>(null);
  const { canAnimate, simplifiedMotion } = useDeckMotion(stageRef);
  const [introComplete, setIntroComplete] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Random starting order each load — shuffled after mount so SSR and the
  // first client render stay identical (no hydration mismatch).
  const [brandOrder, setBrandOrder] = useState(marketingBrands);
  const logoCard = {
    id: "mealdeck",
    name: "MealDeck",
    category: MEALDECK_BUSINESS.tagline,
    logo: mealDeckArtwork.src,
    rank: "M",
    suit: "burger" as const,
  };
  const brandCards = heroFoodDeck.map((foodCard, index) => {
    const brand = brandOrder[index % brandOrder.length];
    return {
      ...brand,
      ...foodCard,
      name: brand?.name ?? "MealDeck",
      category: brand?.category ?? "",
      logo: brand?.logo ?? mealDeckArtwork.src,
    };
  });
  // The full food deck is data, not 53 permanently animated DOM surfaces.
  // Keep the brief all-brand fan on desktops, then mount only the visible
  // card. Phones, zoomed pages and reduced-motion visitors start with one.
  const deck = [logoCard, ...brandCards];
  const animate = canAnimate && !paused;
  const gathering = animate && !simplifiedMotion && !introComplete;
  const cards = gathering
    ? [logoCard, ...brandCards.slice(0, brandOrder.length)]
    : [deck[activeIndex] ?? logoCard];
  const nextIndex = (activeIndex + 1) % deck.length;
  const nextLogo = deck[nextIndex]?.logo ?? mealDeckArtwork.src;

  useEffect(() => {
    setBrandOrder(shuffleBrands(marketingBrands));
  }, []);

  useEffect(() => {
    if (!animate) return;
    if (!introComplete) {
      const timer = window.setTimeout(
        () => setIntroComplete(true),
        simplifiedMotion ? 0 : introDuration,
      );
      return () => window.clearTimeout(timer);
    }
    // Warm only the next logo. Slow/failed downloads leave the current face
    // visible instead of showing empty cards or eagerly loading the full deck.
    const image = new Image();
    image.decoding = "async";
    let elapsed = false;
    let loaded = false;
    let cancelled = false;
    const advance = () => {
      if (!cancelled && elapsed && loaded) setActiveIndex(nextIndex);
    };
    image.onload = () => {
      loaded = true;
      advance();
    };
    image.src = nextLogo;
    loaded = image.complete && image.naturalWidth > 0;
    const timer = window.setTimeout(() => {
      elapsed = true;
      advance();
    }, stepSeconds * 1000);
    return () => {
      cancelled = true;
      image.onload = null;
      window.clearTimeout(timer);
    };
  }, [animate, introComplete, simplifiedMotion, nextIndex, nextLogo]);

  return (
    <div
      ref={stageRef}
      className={`md-deck-stage ${gathering ? "is-gathering" : animate && introComplete ? "is-cycling" : "is-static"}${simplifiedMotion ? " is-simple" : ""}`}
      aria-label="MealDeck restaurant brand showcase"
    >
      <CardBack side="left" />
      <CardBack side="right" />
      {cards.map((card, index) => {
        const isMealDeck = card.id === "mealdeck";
        const centeredIndex = index - (cards.length - 1) / 2;
        return (
          <div
            key={`${gathering ? "intro" : "cycle"}-${card.id}`}
            className="md-deck-card"
            aria-hidden="true"
            style={
              {
                "--fan-x": `${centeredIndex * 15}px`,
                "--fan-y": `${Math.abs(centeredIndex) * 3.2}px`,
                "--fan-rotate": `${centeredIndex * 4.2}deg`,
                "--fan-z": `${cards.length - Math.abs(centeredIndex)}`,
              } as React.CSSProperties
            }
          >
            <div
              className={`md-deck-card-inner${isMealDeck ? " is-mealdeck" : ""}`}
              aria-label={`${card.name}${isMealDeck ? "" : `, ${chefTitles[card.rank] ?? card.rank} of ${card.suit}`}`}
            >
              {isMealDeck ? (
                <MealDeckLogo className="md-deck-card-art" decorative />
              ) : (
                <>
                  <span className="md-deck-corner md-deck-corner-tl" aria-hidden="true">
                    <b>{card.rank}</b>
                    <img src={suitArtwork[card.suit]} alt="" className="md-deck-food-suit" />
                  </span>
                  <span className="md-deck-corner md-deck-corner-br" aria-hidden="true">
                    <b>{card.rank}</b>
                    <img src={suitArtwork[card.suit]} alt="" className="md-deck-food-suit" />
                  </span>
                  <img
                    src={card.logo}
                    alt=""
                    className="md-deck-brand-logo"
                    width={logoDimensionsBySrc[card.logo]?.width}
                    height={logoDimensionsBySrc[card.logo]?.height}
                    decoding="async"
                  />
                  <div className="md-deck-caption">
                    <strong>{card.name}</strong>
                    <span>{card.category}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="md-deck-motion-control"
        aria-pressed={paused}
        onClick={() => {
          setIntroComplete(true);
          setPaused((value) => !value);
        }}
      >
        {paused ? "Resume cards" : "Pause cards"}
      </button>
    </div>
  );
}
