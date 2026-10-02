import mealDeckLogo from "@/assets/mealdeck-card-logo.png";
import { marketingBrands } from "@/lib/marketing-brands";

const cycleSeconds = 45;
const stepSeconds = cycleSeconds / (marketingBrands.length + 1);

export function RotatingBrandDeck() {
  const cards = [
    { id: "mealdeck", name: "MealDeck", category: "One Order. Every Craving.", logo: mealDeckLogo },
    ...marketingBrands,
  ];

  return (
    <div className="md-deck-stage" aria-label="MealDeck brand card showcase">
      <div className="md-deck-shadow md-deck-shadow-left" aria-hidden="true" />
      <div className="md-deck-shadow md-deck-shadow-right" aria-hidden="true" />
      {cards.map((card, index) => (
        <div
          key={card.id}
          className="md-deck-card"
          style={{ animationDelay: `${index * stepSeconds}s` }}
        >
          <div className="md-deck-card-inner">
            <span className="md-deck-index">{index === 0 ? "M" : marketingBrands[index - 1]?.rank}</span>
            <span className="md-deck-suit">{index === 0 ? "♦" : marketingBrands[index - 1]?.suit}</span>
            <img src={card.logo} alt="" className={index === 0 ? "md-deck-mealdeck-logo" : "md-deck-brand-logo"} />
            <div className="md-deck-caption">
              <strong>{card.name}</strong>
              <span>{card.category}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
