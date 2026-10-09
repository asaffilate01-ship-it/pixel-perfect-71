import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, CheckCircle2, Gamepad2, Gift, LockKeyhole, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  BRAND_THEMES, FOOD_SUITS, GAME_CATALOGUE, INGREDIENTS, RECIPES,
  isBrandTheme, makePairs, recipeMatches, type BrandTheme, type PairCard, type SuitArt,
} from "@/lib/dishbee-play";
import { suitArtwork, tileArtwork } from "@/lib/food-suit-artwork";
import { seo } from "@/lib/seo";
import cardBack from "@/assets/mealdeck-card-back.png";
import cardFront from "@/assets/mealdeck-card-front.png";

type Game = "pairs" | "recipe";

export const Route = createFileRoute("/play")({
  validateSearch: (search: Record<string, unknown>): { brand?: BrandTheme } => ({
    ...(isBrandTheme(search["brand"]) ? { brand: search["brand"] } : {}),
  }),
  head: () => seo({
    title: "MealDeck Play — Free Food Card Games",
    description: "Play free, entertainment-only food card games. No gambling, stakes, or redeemable gameplay prizes. MealDeck purchase rewards remain separate.",
    path: "/play",
  }),
  component: PlayPage,
});

function FoodPairs({ brand }: { brand: BrandTheme }) {
  const [cards, setCards] = useState<PairCard[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [round, setRound] = useState(0);

  // Defer randomisation until mount to prevent mismatched server-rendered markup.
  useEffect(() => { setCards(makePairs(brand)); }, [brand]);

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [first, second] = flipped;
    if (first === undefined || second === undefined) return;
    const a = cards.find((card) => card.id === first);
    const b = cards.find((card) => card.id === second);
    const match = a && b && a.food === b.food;
    const timer = setTimeout(() => {
      if (match) setMatched((previous) => [...previous, first, second]);
      setFlipped([]);
    }, match ? 250 : 850);
    return () => clearTimeout(timer);
  }, [cards, flipped]);

  function restart() {
    setCards(makePairs(brand));
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setRound((value) => value + 1);
  }

  function flip(id: number) {
    if (flipped.length === 2 || flipped.includes(id) || matched.includes(id)) return;
    setFlipped((previous) => [...previous, id]);
    if (flipped.length === 1) setMoves((previous) => previous + 1);
  }

  const complete = cards.length > 0 && matched.length === cards.length;
  return (
    <section className="dp-game-panel" aria-label="Food Pairs">
      <div className="dp-game-head">
        <div><h2>Food Pairs</h2><p>Turn over two cards. Match all six food pairs.</p></div>
        <button className="dp-small-button" type="button" onClick={restart}><RotateCcw size={16} /> New game</button>
      </div>
      <div className="dp-statline"><span>Pairs <b>{matched.length / 2} / 6</b></span><span>Moves <b>{moves}</b></span><span>Cost <b>Free</b></span></div>
      <div className="dp-pairs-grid">
        {cards.map((card, index) => {
          const shown = flipped.includes(card.id) || matched.includes(card.id);
          return (
            <button type="button" key={`${round}-${card.id}`} className={`dp-pair-card ${shown ? "is-revealed" : ""} ${matched.includes(card.id) ? "is-matched" : ""}`}
              style={{ "--i": index } as CSSProperties}
              onClick={() => flip(card.id)} disabled={shown || flipped.length === 2 || complete}
              aria-label={shown ? card.label + " matched or revealed" : "Reveal food card"}
              aria-pressed={shown}>
              <span className="dp-pair-flip" aria-hidden="true">
                <span className="dp-pair-face dp-pair-cover"><img className="dp-cover-art" src={cardBack} alt="" loading="lazy" /></span>
                <span className="dp-pair-face dp-pair-front"><img src={suitArtwork[card.art]} alt="" loading="lazy" /><small>{card.label}</small></span>
              </span>
            </button>
          );
        })}
      </div>
      {complete && <p className="dp-win-message"><CheckCircle2 size={20} /> All pairs found in {moves} moves! A great game — no monetary prizes.</p>}
      <p className="dp-fineprint">Entertainment only. Game results do not award points, meals, cash or discounts.</p>
    </section>
  );
}

function RecipeRush() {
  const [recipe, setRecipe] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [complete, setComplete] = useState(false);
  const current = RECIPES[recipe] ?? RECIPES[0];

  function selectIngredient(id: string) {
    if (complete) return;
    setFeedback("");
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : previous.length < 3 ? [...previous, id] : previous,
    );
  }

  function check() {
    if (selected.length !== 3 || complete) return;
    if (!recipeMatches(selected, current.ingredients)) {
      setFeedback("Not quite! Check the recipe and try another combination.");
      return;
    }
    setFeedback("Perfect recipe! You got it.");
    if (recipe === RECIPES.length - 1) setComplete(true);
    else {
      setRecipe((value) => value + 1);
      setSelected([]);
    }
  }

  function restart() {
    setRecipe(0); setSelected([]); setFeedback(""); setComplete(false);
  }

  return (
    <section className="dp-game-panel" aria-label="Recipe Rush">
      <div className="dp-game-head">
        <div><h2>Recipe Rush</h2><p>Choose exactly three ingredients for each signature dish.</p></div>
        <button className="dp-small-button" type="button" onClick={restart}><RotateCcw size={16} /> Restart</button>
      </div>
      <div className="dp-recipe-target">
        <img className="dp-recipe-art" src={suitArtwork[(complete ? "cake" : current.art) as SuitArt]} alt="" loading="lazy" />
        <div>
          <small>{complete ? "Challenge complete" : `Recipe ${recipe + 1} of ${RECIPES.length}`}</small>
          <h3>{complete ? "Master Chef!" : current.label}</h3>
          <p>{complete ? "Three recipes completed. Well played!" : "Select the ingredients that belong in this dish."}</p>
        </div>
      </div>
      <div className="dp-ingredient-grid">
        {INGREDIENTS.map((item, index) => (
          <button key={item.id} type="button" disabled={complete} aria-pressed={selected.includes(item.id)} onClick={() => selectIngredient(item.id)}
            style={{ "--i": index } as CSSProperties}
            className={`dp-ingredient ${selected.includes(item.id) ? "is-selected" : ""}`}>
            <img className="dp-ingredient-art" src={tileArtwork[item.art]} alt="" loading="lazy" /><small>{item.label}</small>
          </button>
        ))}
      </div>
      <div className="dp-recipe-footer">
        <span>{selected.length} / 3 ingredients</span>
        <button type="button" className="dp-main-button" disabled={selected.length !== 3 || complete} onClick={check}>Check recipe <ArrowRight size={16}/></button>
      </div>
      {feedback && <p role="status" className="dp-game-feedback">{feedback}</p>}
      {complete && <button type="button" className="dp-small-button" onClick={restart}>Play again</button>}
      <p className="dp-fineprint">Entertainment only. No game play or results affect food rewards.</p>
    </section>
  );
}

function PlayPage() {
  const { brand = "mealdeck" } = Route.useSearch();
  const theme = BRAND_THEMES[brand];
  const [game, setGame] = useState<Game>("pairs");
  const collectionSuits: SuitArt[] = ["burger", "french-taco", "fries", "drink", "cake"];
  return (
    <div className="md-marketing-shell dp-shell" style={{ "--dp-accent": theme.accent } as CSSProperties}>
      <SiteHeader />
      <main className="dp-main">
        <div className="dp-container">
          <div className="dp-eyebrow"><Gamepad2 size={18} /> MEALDECK PLAY · {theme.label.toUpperCase()}</div>
          <div className="dp-intro">
            <div><h1>Good food. <em>Great games.</em></h1><p>{theme.subtitle} Quick games, food-themed cards and fun challenges — all free, no gambling.</p>
              <div className="dp-claims"><span><ShieldCheck size={16}/> No gambling</span><span><CheckCircle2 size={16}/> Free to play</span><span><Sparkles size={16}/> Food-themed cards</span></div>
            </div>
            <div className="dp-feature-card">
              <img className="dp-feature-art" src={brand === "mealdeck" ? cardFront : suitArtwork[theme.art]} alt="" loading="lazy" />
              <strong>{theme.label}</strong>
              <small>PLAY EDITION</small>
            </div>
          </div>
          <div className="dp-brands"><span>Play as</span>{Object.entries(BRAND_THEMES).map(([id, item]) =>
            <Link key={id} to="/play" search={{ brand: id as BrandTheme }} className={`dp-brand-pill ${brand === id ? "is-active" : ""}`} aria-current={brand === id ? "page" : undefined}>
              <img className="dp-pill-art" src={suitArtwork[item.art]} alt="" loading="lazy" /> {item.label}
            </Link>,
          )}</div>
          <div className="dp-suits" aria-label="Our four food card suits">{FOOD_SUITS.map((suit) => <div key={suit.id}><img src={suitArtwork[suit.art]} alt="" loading="lazy" /><b>{suit.label}</b><small>{suit.brand}</small></div>)}</div>
          <div className="dp-section-title"><div><small>READY TO PLAY</small><h2>Choose your game</h2></div><p>Scores and badges are for fun only.</p></div>
          <div className="dp-game-select">
            <button type="button" onClick={() => setGame("pairs")} aria-pressed={game === "pairs"} className={game === "pairs" ? "is-active" : ""}>
              <img className="dp-tab-art" src={suitArtwork.burger} alt="" loading="lazy" /> Food Pairs <small>Memory game</small>
            </button>
            <button type="button" onClick={() => setGame("recipe")} aria-pressed={game === "recipe"} className={game === "recipe" ? "is-active" : ""}>
              <img className="dp-tab-art" src={suitArtwork.chicken} alt="" loading="lazy" /> Recipe Rush <small>Food puzzle</small>
            </button>
          </div>
          {game === "pairs" ? <FoodPairs brand={brand} /> : <RecipeRush />}
          <section className="dp-collection">
            <div className="dp-section-title"><div><small>SEPARATE FROM THE GAMES</small><h2>Full House Rewards</h2></div><Gift size={27}/></div>
            <p>Food rewards will be earned only from verified eligible purchases, never from card-game outcomes. Guaranteed milestones can be enabled once the loyalty ledger and redemption flow are connected.</p>
            <div className="dp-collection-cards">{collectionSuits.map((art, index) => <div key={art}><img src={suitArtwork[art]} alt="" loading="lazy" /><LockKeyhole size={15}/><small>Card {index + 1}</small></div>)}</div>
            <p className="dp-pending"><LockKeyhole size={16}/> Purchase rewards are not active in this preview. No simulated points or vouchers are issued.</p>
            <Link to="/order" className="dp-order-link">Browse MealDeck food <ArrowRight size={17}/></Link>
          </section>
          <div className="dp-section-title"><div><small>COMING NEXT</small><h2>More games</h2></div></div>
          <div className="dp-catalogue">{GAME_CATALOGUE.filter((entry) => entry.state === "planned").map((entry) => <article key={entry.id}><LockKeyhole size={17}/><h3>{entry.name}</h3><p>{entry.description}</p><small>In development</small></article>)}</div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
