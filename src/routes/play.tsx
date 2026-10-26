import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Gamepad2, Gift, LockKeyhole, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { KitchenChaos, BrandSnap, GoDish, FullHouse, KitchenStacks } from "@/components/play/premium-games";
import { gameBrandArtwork } from "@/lib/game-brand-artwork";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  BRAND_THEMES, FOOD_SUITS, GAME_CATALOGUE, INGREDIENTS, RECIPES,
  isBrandTheme, makePairs, recipeMatches, type BrandTheme, type PairCard, type SuitArt,
} from "@/lib/dishbee-play";
import { gameFoodArtwork as foodArtwork, gameFoodArtwork as suitArtwork, gameFoodArtwork as tileArtwork } from "@/lib/game-food-artwork";
import { seo } from "@/lib/seo";
import cardBack from "@/assets/mealdeck-card-back.png";

type Game = (typeof GAME_CATALOGUE)[number]["id"];

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
        <div><h2>Food Pairs</h2><p>{BRAND_THEMES[brand].label} deck — turn over two cards and match all six pairs.</p></div>
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
                <span className="dp-pair-face dp-pair-front"><img src={foodArtwork[card.art]} alt="" loading="lazy" /><small>{card.label}</small></span>
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
  const collectionSuits: SuitArt[] = ["burger", "chicken", "french-taco", "cake"];

  const playPanels: Record<Game, ReactNode> = {
    pairs: <FoodPairs key={brand} brand={brand} />,
    recipe: <RecipeRush key={brand} />,
    "kitchen-chaos": <KitchenChaos />,
    snap: <BrandSnap />,
    "go-dish": <GoDish />,
    "full-house": <FullHouse />,
    solitaire: <KitchenStacks />,
  };
  const gameIcons: Record<Game, SuitArt> = {
    pairs: "burger", recipe: "french-taco", "kitchen-chaos": "chicken",
    snap: "cake", "go-dish": "french-taco", "full-house": "cake", solitaire: "burger",
  };
  return (
    <div className="md-marketing-shell dp-shell" style={{ "--dp-accent": theme.accent } as CSSProperties}>
      <SiteHeader />
      <main className="dp-main">
        <div className="dp-container">
          <div className="dp-eyebrow"><Gamepad2 size={18} /> DISHBEE PLAY · {theme.label.toUpperCase()}</div>
          <div className="dp-intro">
            <div>
              <h1>Good food. <em>Great games.</em></h1>
              <p>{theme.subtitle} Seven original food-themed games, with the approved MealDeck symbols and official brand artwork.</p>
              <div className="dp-claims"><span><ShieldCheck size={16}/> No gambling</span><span><CheckCircle2 size={16}/> Always free</span><span><Sparkles size={16}/> Purely for fun</span></div>
            </div>
            <div className="dp-feature-card">
              <img className="dp-feature-art" src={gameBrandArtwork[brand]} alt={`${theme.label} official artwork`} loading="lazy"/>
              <strong>{theme.label}</strong>
              <small>PLAY EDITION</small>
            </div>
          </div>
          <div className="dp-brands"><span>Play as</span>
            {Object.entries(BRAND_THEMES).map(([id, item]) =>
              <Link key={id} to="/play" search={{ brand: id as BrandTheme }}
                className={`dp-brand-pill ${brand === id ? "is-active" : ""}`} aria-current={brand === id ? "page" : undefined}>
                <img className="dp-pill-art" src={gameBrandArtwork[id as BrandTheme]} alt="" loading="lazy" /> {item.label}
              </Link>,
            )}
          </div>
          <p className="dp-brands-note">MealDeck Food Pairs uses the selected brand's food collection. Brand Snap always displays the original logos from across the MealDeck family.</p>
          <div className="dp-suits" aria-label="The four official food suits">
            {FOOD_SUITS.map(suit =>
              <div key={suit.id}><img src={suitArtwork[suit.art]} alt="" loading="lazy" /><b>{suit.label}</b><small>{suit.brand}</small></div>
            )}
          </div>
          <div className="dp-section-title"><div><small>SEVEN GAMES · ONE ARCADE</small><h2>Choose your game</h2></div><p>Play alone or against the house chef. No monetary prizes.</p></div>
          <div className="dp-game-select dp2-game-select" role="group" aria-label="Choose a MealDeck game">
            {GAME_CATALOGUE.map(item =>
              <button key={item.id} type="button" onClick={() => setGame(item.id)}
                aria-pressed={game === item.id} className={game === item.id ? "is-active" : ""}>
                <img className="dp-tab-art" src={suitArtwork[gameIcons[item.id]]} alt="" loading="lazy"/>
                <span>{item.name}</span><small>{item.description}</small>
              </button>
            )}
          </div>
          {playPanels[game]}
          <section className="dp-collection">
            <div className="dp-section-title"><div><small>SHOPPING REWARDS ARE SEPARATE</small><h2>Full House Rewards</h2></div><Gift size={27}/></div>
            <p>Customers will collect guaranteed food rewards from verified, eligible purchases once loyalty and redemption controls are activated. Games never give points, food, cash or vouchers.</p>
            <div className="dp-collection-cards">
              {collectionSuits.map((art, index) =>
                <div key={art}><img src={suitArtwork[art]} alt="" loading="lazy"/><LockKeyhole size={15}/><small>{FOOD_SUITS[index]?.label}</small></div>
              )}
            </div>
            <p className="dp-pending"><LockKeyhole size={16}/> Real purchase rewards are not active in this games preview. No simulated points or vouchers are issued.</p>
            <Link to="/order" className="dp-order-link">Coming soon <ArrowRight size={17}/></Link>
          </section>
          <section className="dp-events">
            <div>
              <small>MATCHDAY &amp; FIGHT-NIGHT FOOD</small>
              <h2>More flavour for the big moments.</h2>
              <p>Seasonal football and fight-night bundles can be offered to all eligible customers under published prices and conditions. No game outcome or sports prediction can trigger a valuable prize.</p>
            </div>
            <Link to="/order">Coming soon <ArrowRight size={17}/></Link>
          </section>
          <div className="dp2-legal">
            <ShieldCheck size={22}/>
            <div><strong>Enjoy the games. Keep the rewards separate.</strong>
              <p>All seven games are free entertainment. There is no entry fee, cash-out, wagering, paid advantage, random food prize, purchased turn, or gameplay-linked loyalty reward.</p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
