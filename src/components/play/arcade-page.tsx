import { Link, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Gamepad2,
  Grid2X2,
  Lightbulb,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Share2,
  Shuffle,
  Star,
  X,
} from "lucide-react";
import { Feast2048, FourToFeast, OrderEcho, KitchenShuffle } from "@/components/play/arcade-games";
import { GamePanelBoundary } from "@/components/play/game-panel-boundary";
import { ArcadePlaybook, useArcadeProgress } from "@/components/play/arcade-progress";
import { ArcadeShareDialog } from "@/components/play/arcade-share";
import type { ArcadeShareRequest } from "@/lib/mealdeck-arcade-sharing";
import {
  KitchenChaos,
  BrandSnap,
  GoDish,
  FullHouse,
  KitchenStacks,
} from "@/components/play/premium-games";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  BRAND_THEMES,
  INGREDIENTS,
  RECIPE_DECK_SIZES,
  getRecipeDeck,
  toggleRecipeIngredient,
  type RecipeDeckSize,
  isBrandTheme,
  makePairs,
  createPairRound,
  isPairRoundComplete,
  revealPairCard,
  resolvePairTurn,
  parsePairBest,
  choosePairBest,
  PAIR_COUNTS,
  recipeMatches,
  type BrandTheme,
  type PairCount,
} from "@/lib/dishbee-play";
import {
  ARCADE_CATEGORIES,
  ARCADE_COLLECTIONS,
  ARCADE_GAMES,
  NEW_ARCADE_GAMES,
  findArcadeGames,
  findArcadeHelp,
  getArcadeSuggestions,
  parseArcadeFavourites,
  pickArcadeGame,
  type ArcadeCollection,
  type ArcadeFilter,
  type ArcadeGameId,
  type ArcadeSearch,
} from "@/lib/mealdeck-arcade-library";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { resolveArcadeDailyPage } from "@/lib/mealdeck-arcade-pages";
import cardBack from "@/assets/mealdeck-card-back.png";
import "@/styles.mealdeck-arcade-shell.css";
import "@/styles.mealdeck-arcade-pages.css";

const SauceSwitch = lazy(() =>
  import("@/components/play/puzzle-games").then((module) => ({ default: module.SauceSwitch })),
);
const MenuQuest = lazy(() =>
  import("@/components/play/puzzle-games").then((module) => ({ default: module.MenuQuest })),
);
const TrayTactics = lazy(() =>
  import("@/components/play/tray-tactics").then((module) => ({ default: module.TrayTactics })),
);
const BentoSudoku = lazy(() =>
  import("@/components/play/bento-sudoku").then((module) => ({ default: module.BentoSudoku })),
);
const TrayLines = lazy(() =>
  import("@/components/play/tray-lines").then((module) => ({ default: module.TrayLines })),
);
const SnackTrail = lazy(() =>
  import("@/components/play/snack-trail").then((module) => ({ default: module.SnackTrail })),
);
const SkewerSort = lazy(() =>
  import("@/components/play/skewer-sort").then((module) => ({ default: module.SkewerSort })),
);
const PantrySweep = lazy(() =>
  import("@/components/play/pantry-sweep").then((module) => ({ default: module.PantrySweep })),
);
const FAVOURITES_KEY = "mealdeck-play-favourites-v1";

function FoodPairs({ brand, suspended = false }: { brand: BrandTheme; suspended?: boolean }) {
  const [count, setCount] = useState<PairCount>(6);
  const [round, setRound] = useState(() => createPairRound());
  const [generation, setGeneration] = useState(0);
  const [bests, setBests] = useState<Record<string, number | null>>({});
  const boardRef = useRef<HTMLDivElement>(null);
  const firstCardRef = useRef<HTMLButtonElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const complete = isPairRoundComplete(round);
  const bestKey = `mealdeck-play-pairs-best-v1-${brand}-${count}`;
  const best = bests[bestKey] ?? null;

  useEffect(() => {
    setRound(createPairRound(makePairs(brand)));
  }, [brand]);

  useEffect(() => {
    let saved: number | null = null;
    try {
      saved = parsePairBest(localStorage.getItem(bestKey), count);
    } catch {
      // Storage is optional; play and this visit's best remain available.
    }
    if (complete) {
      const next = choosePairBest(saved, round.moves, count);
      if (next !== null) {
        saved = next;
        try {
          localStorage.setItem(bestKey, String(next));
        } catch {
          // No persistent storage in this browser.
        }
      }
    }
    setBests((previous) => {
      const old = previous[bestKey] ?? null;
      const next = saved === null ? old : choosePairBest(old, saved, count);
      return next === old && bestKey in previous ? previous : { ...previous, [bestKey]: next };
    });
  }, [bestKey, count, complete, round.moves]);

  useEffect(() => {
    if (!complete || suspended || !boardRef.current?.contains(document.activeElement)) return;
    const frame = requestAnimationFrame(() => replayRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [complete, suspended]);

  useEffect(() => {
    if (round.flipped.length !== 2 || suspended) return;
    const [first, second] = round.flipped;
    const a = round.cards.find((card) => card.id === first);
    const b = round.cards.find((card) => card.id === second);
    const timer = setTimeout(
      () => setRound((current) => current === round ? resolvePairTurn(current) : current),
      a?.food === b?.food ? 350 : 1000,
    );
    return () => clearTimeout(timer);
  }, [round, suspended]);

  function restart(nextCount: PairCount = count) {
    setCount(nextCount);
    setRound(createPairRound(makePairs(brand, nextCount)));
    setGeneration((value) => value + 1);
    requestAnimationFrame(() => firstCardRef.current?.focus({ preventScroll: true }));
  }

  return (
    <section className="md-quick-game" aria-labelledby="pairs-title">
      <div className="md-quick-head">
        <div>
          <p className="md-quick-kicker">MATCH & REMEMBER</p>
          <h2 id="pairs-title">Food Pairs</h2>
          <p>Find all {count} matching pairs in as few moves as you can.</p>
        </div>
        <button className="md-play-button md-play-button--quiet" type="button" onClick={() => restart()}>
          <RotateCcw size={17} aria-hidden="true" /> New game
        </button>
      </div>
      <fieldset className="md-pairs-modes">
        <legend>Board difficulty</legend>
        <div>
          {PAIR_COUNTS.map((size) => (
            <button
              key={size}
              type="button"
              className="md-play-button md-play-button--quiet"
              aria-pressed={count === size}
              onClick={() => { if (size !== count) restart(size); }}
            >
              <strong>{size === 4 ? "Easy" : size === 6 ? "Classic" : "Challenge"}</strong>
              <small>{size} pairs</small>
            </button>
          ))}
        </div>
        <p>Changing difficulty deals a fresh board. Each size has its own personal best.</p>
      </fieldset>
      <div className="md-quick-stats md-pairs-stats">
        <div><span>Pairs found</span><strong>{round.matched.length / 2}<small> / {count}</small></strong></div>
        <div><span>Moves</span><strong>{round.moves}</strong></div>
        <div><span>Fewest moves</span><strong>{best ?? "—"}</strong></div>
        <div><span>Your deck</span><strong className="md-quick-deck-name">{BRAND_THEMES[brand].label}</strong></div>
      </div>
      <progress className="md-quick-progress" max={count} value={round.matched.length / 2} aria-label="Pairs found" />
      <p className="md-quick-message" role="status" aria-atomic="true">
        {complete ? `All ${count} pairs found in ${round.moves} moves. Nicely played!` : round.message}
      </p>
      {round.cards.length === 0 ? (
        <p className="md-quick-loading" role="status">Shuffling your deck…</p>
      ) : (
        <div
          className="md-pairs-board"
          data-pair-count={count}
          ref={boardRef}
          role="group"
          aria-label={`${count * 2} food cards`}
          aria-busy={round.flipped.length === 2}
        >
          {round.cards.map((card, index) => {
            const isMatched = round.matched.includes(card.id);
            const shown = isMatched || round.flipped.includes(card.id);
            return (
              <button
                type="button"
                key={generation + "-" + card.id}
                ref={index === 0 ? firstCardRef : undefined}
                className={"md-pair-card" + (shown ? " is-revealed" : "") + (isMatched ? " is-matched" : "")}
                onClick={() => { if (!suspended) setRound((current) => revealPairCard(current, card.id)); }}
                aria-disabled={suspended || shown || round.flipped.length === 2 || complete}
                tabIndex={isMatched ? -1 : 0}
                aria-label={(isMatched ? "Matched " + card.label : shown ? card.label + " revealed" : "Reveal card " + (index + 1)) + (shown ? ", card " + (index + 1) : "")}
                aria-pressed={shown}
              >
                <span className="md-pair-flip" aria-hidden="true">
                  <span className="md-pair-back"><img src={cardBack} alt="" draggable={false} /><small>{index + 1}</small></span>
                  <span className="md-pair-front">
                    <img src={gameFoodArtwork[card.art]} alt="" draggable={false} />
                    <strong>{card.label}</strong>
                    {isMatched && <span className="md-pair-check"><Check size={16} /></span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {complete && (
        <div className="md-quick-result">
          <CheckCircle2 size={26} aria-hidden="true" />
          <div>
            <h3>Every pair, perfectly plated.</h3>
            <p>You cleared the deck in {round.moves} moves. {best === round.moves ? "You matched your personal best!" : "Ready to try for fewer?"}</p>
          </div>
          <button ref={replayRef} type="button" className="md-play-button" onClick={() => restart()}>
            Play again <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
      )}
      <p className="md-quick-tip">
        Tip: work across the deck in a pattern to remember where each food is hiding. Personal bests stay in this browser when storage is available.
      </p>
    </section>
  );
}

function RecipeRush() {
  const [size, setSize] = useState<RecipeDeckSize>(3);
  const deck = getRecipeDeck(size);
  const [recipe, setRecipe] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState<number[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [stage, setStage] = useState<"choosing" | "correct" | "complete">("choosing");
  const targetRef = useRef<HTMLHeadingElement>(null);
  const nextActionRef = useRef<HTMLButtonElement>(null);
  const current = deck[recipe] ?? deck[0]!;
  const completed = recipe + (stage === "choosing" ? 0 : 1);

  useEffect(() => {
    if (stage === "choosing") return;
    const frame = requestAnimationFrame(() => nextActionRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  function selectIngredient(id: string) {
    if (stage !== "choosing") return;
    if (selected.length === 3 && !selected.includes(id)) {
      setFeedback("Three ingredients selected. Deselect one if you want to swap it.");
      return;
    }
    setFeedback("");
    setSelected((previous) => toggleRecipeIngredient(previous, id));
  }

  function check() {
    if (selected.length !== 3 || stage !== "choosing") return;
    setAttempts(value => value + 1);
    if (!recipeMatches(selected, current.ingredients)) {
      setFeedback("Not quite. Swap an ingredient, or open the recipe hint for a hand.");
      return;
    }
    setFeedback("That's the recipe! All three ingredients are correct.");
    setStage(recipe === deck.length - 1 ? "complete" : "correct");
  }

  function focusRecipe() {
    requestAnimationFrame(() => {
      targetRef.current?.focus({ preventScroll: true });
      targetRef.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  }

  function nextRecipe() {
    setRecipe((value) => value + 1);
    setSelected([]);
    setFeedback("");
    setStage("choosing");
    focusRecipe();
  }

  function restart(nextSize: RecipeDeckSize = size) {
    setSize(nextSize);
    setAttempts(0);
    setHints([]);
    setRecipe(0);
    setSelected([]);
    setFeedback("");
    setStage("choosing");
    focusRecipe();
  }

  return (
    <section className="md-quick-game" aria-labelledby="recipe-title">
      <div className="md-quick-head">
        <div>
          <p className="md-quick-kicker">PICK. MIX. PLATE.</p>
          <h2 id="recipe-title">Recipe Rush</h2>
          <p>Pick three ingredients for each game recipe. Need a hand? Open the hint.</p>
        </div>
        <button className="md-play-button md-play-button--quiet" type="button" onClick={() => restart()}>
          <RotateCcw size={17} aria-hidden="true" /> New game
        </button>
      </div>
      <fieldset className="md-pairs-modes md-recipe-modes">
        <legend>Choose your challenge</legend>
        <div>{RECIPE_DECK_SIZES.map(count => <button type="button" key={count} className="md-play-button md-play-button--quiet" aria-pressed={size === count} onClick={() => { if (size !== count) restart(count); }}><strong>{count === 3 ? "Taster" : count === 6 ? "Chef" : "Master"}</strong><small>{count} recipes</small></button>)}</div>
        <p>Changing the challenge starts a fresh quiz.</p>
      </fieldset>
      <div className="md-quick-stats md-recipe-stats">
        <div>
          <span>Recipes completed</span>
          <strong>
            {completed}
            <small> / {deck.length}</small>
          </strong>
        </div>
        <div>
          <span>Ingredients selected</span>
          <strong>
            {selected.length}
            <small> / 3</small>
          </strong>
        </div>
        <div><span>Answer checks</span><strong>{attempts}</strong></div>
        <div><span>Hints opened</span><strong>{hints.length}</strong></div>
      </div>
      <progress
        className="md-quick-progress"
        max={deck.length}
        value={completed}
        aria-label="Recipes completed"
      />
      <div className="md-recipe-target">
        <img src={gameFoodArtwork[current.art]} alt="" />
        <div>
          <span>
            RECIPE {recipe + 1} OF {deck.length}
          </span>
          <h3 ref={targetRef} tabIndex={-1}>
            {current.label}
          </h3>
          <p>
            {stage === "choosing"
              ? current.clue
              : "All the right ingredients. Great work."}
          </p>
        </div>
      </div>
      <details className="md-recipe-hint" key={`${size}-${recipe}`} onToggle={(event) => {
        if (event.currentTarget.open && stage === "choosing") setHints(previous => previous.includes(recipe) ? previous : [...previous, recipe]);
      }}>
        <summary>
          <Lightbulb size={17} aria-hidden="true" /> Recipe hint
        </summary>
        <p>
          This game recipe uses{" "}
          {current.ingredients
            .map((id) => INGREDIENTS.find((item) => item.id === id)?.label.toLowerCase())
            .join(", ")}
          .
        </p>
      </details>
      <div className="md-recipe-ingredients" role="group" aria-label="Choose three ingredients">
        {INGREDIENTS.map((item) => {
          const isSelected = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isSelected}
              aria-disabled={stage !== "choosing" || (!isSelected && selected.length === 3)}
              onClick={() => selectIngredient(item.id)}
              className={"md-recipe-ingredient" + (isSelected ? " is-selected" : "")}
            >
              <img src={gameFoodArtwork[item.art]} alt="" />
              <strong>{item.label}</strong>
              {isSelected && (
                <span className="md-recipe-selected">
                  <Check size={15} aria-hidden="true" />
                  <span className="sr-only">Selected</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="md-quick-message" role="status" aria-atomic="true">
        {feedback ||
          (selected.length === 3
            ? "Your three ingredients are ready to check."
            : "Choose " +
              (3 - selected.length) +
              " more ingredient" +
              (selected.length === 2 ? "." : "s."))}
      </p>
      <div className="md-recipe-actions">
        {stage === "choosing" && (
          <>
            <button type="button" className="md-play-button md-play-button--quiet" disabled={!selected.length} onClick={() => {
              setSelected([]);
              setFeedback("Selection cleared. Choose three ingredients.");
            }}>
              <RotateCcw size={17} aria-hidden="true" /> Clear selection
            </button>
            <button type="button" className="md-play-button" disabled={selected.length !== 3} onClick={check}>
              Check my recipe <ArrowRight size={18} aria-hidden="true" />
            </button>
          </>
        )}
        {stage === "correct" && (
          <button ref={nextActionRef} type="button" className="md-play-button" onClick={nextRecipe}>
            Next recipe <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {stage === "complete" && (
        <div className="md-quick-result">
          <CheckCircle2 size={26} aria-hidden="true" />
          <div>
            <h3>{deck.length} dishes. One happy chef.</h3>
            <p>You completed every recipe in {attempts} answer checks, with hints opened on {hints.length} questions.</p>
          </div>
          <button ref={nextActionRef} type="button" className="md-play-button" onClick={() => restart()}>
            Play again <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
      )}
      <p className="md-quick-tip">
        These are recipes for a game. See the menus for actual dishes and allergen information.
      </p>
    </section>
  );
}

function ArcadeHelp({ game }: { game?: ArcadeGameId | undefined }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const [expanded, setExpanded] = useState(false);
  const entries = findArcadeHelp(query, game);
  const visible = query.trim() || expanded ? entries : entries.slice(0, 6);
  return (
    <section id="arcade-game-help" className="md-play-help" aria-labelledby={inputId + "-title"}>
      <div className="md-play-recommendations-heading">
        <div><h2 id={inputId + "-title"}>Game help &amp; questions</h2><p>Find game rules, controls, saved rounds and quick answers.</p></div>
        <Lightbulb size={23} aria-hidden="true" />
      </div>
      <label htmlFor={inputId}>Search questions and answers</label>
      <div className="md-play-search">
        <Search size={17} aria-hidden="true" />
        <input id={inputId} type="search" maxLength={160} value={query} onChange={event => { setQuery(event.target.value); setExpanded(false); }} placeholder="Try hints, friends or save" />
        {query && <button type="button" aria-label="Clear help search" onClick={() => { setQuery(""); setExpanded(false); document.getElementById(inputId)?.focus(); }}><X size={17} aria-hidden="true" /></button>}
      </div>
      <div className="md-play-help-topics" role="group" aria-label="Popular help topics">
        {[["All topics", ""], ["Saved games", "save"], ["Friends", "friend"], ["Hints", "hint"], ["Controls", "keyboard"]].map(([label, term]) => (
          <button key={label} type="button" className="md-play-button md-play-button--quiet"
            aria-pressed={query === term} onClick={() => { setQuery(term ?? ""); setExpanded(false); }}>{label}</button>
        ))}
      </div>
      <p className="md-play-help-count" role="status">{visible.length < entries.length ? `${visible.length} of ${entries.length}` : entries.length} {entries.length === 1 ? "answer" : "answers"}</p>
      {entries.length ? <div className="md-play-help-grid">{visible.map(entry => (
        <details key={entry.id}>
          <summary>{entry.question}</summary><p>{entry.answer}</p>
          {entry.game && entry.game !== game && <Link to="/play/$gameId" params={{ gameId: entry.game }} search={{}}>Open game <ArrowRight size={15} aria-hidden="true" /></Link>}
        </details>
      ))}</div> : <p>No matching answers. Try another search or clear the search.</p>}
      {!query.trim() && entries.length > 6 && <button type="button" className="md-play-button md-play-button--quiet" aria-expanded={expanded} style={{ marginTop: 12 }} onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer answers" : `Show all ${entries.length} answers`}</button>}
    </section>
  );
}

type LibraryProps = {
  game: ArcadeGameId;
  query: string;
  filter: ArcadeFilter;
  collection: ArcadeCollection;
  favourites: readonly ArcadeGameId[];
  setQuery: (query: string) => void;
  setFilter: (filter: ArcadeFilter) => void;
  setCollection: (collection: ArcadeCollection) => void;
  onSelect: (game: ArcadeGameId) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
};

function GameLibrary({
  game,
  query,
  filter,
  collection,
  favourites,
  setQuery,
  setFilter,
  setCollection,
  onSelect,
  searchInputRef,
}: LibraryProps) {
  const searchId = useId();
  const games = findArcadeGames(query, filter, collection, favourites);
  function clear() {
    setQuery("");
    setFilter("All games");
    setCollection("all");
  }
  return (
    <div className="md-play-library-content">
      <label className="md-play-search-label" htmlFor={searchId}>
        Find a game
      </label>
      <div className="md-play-search">
        <Search size={18} aria-hidden="true" />
        <input
          id={searchId}
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, type or opponent"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear game search"
            onClick={() => {
              setQuery("");
              searchInputRef?.current?.focus();
            }}
          >
            <X size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      <label className="md-play-collection" htmlFor={`${searchId}-collection`}>
        <span>Browse collection</span>
        <select
          id={`${searchId}-collection`}
          value={collection}
          onChange={(event) => {
            const next = ARCADE_COLLECTIONS.find((item) => item.id === event.target.value);
            if (next) setCollection(next.id);
          }}
        >
          {ARCADE_COLLECTIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="md-play-filters" role="group" aria-label="Game categories">
        {ARCADE_CATEGORIES.map((category) => (
          <button
            type="button"
            key={category}
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="md-play-results-heading">
        <p className="md-play-count" role="status">
          {games.length} {games.length === 1 ? "game" : "games"}
          {filter !== "All games" ? " · " + filter : ""}
        </p>
        {games.length > 0 && (
          <button
            type="button"
            className="md-play-suggest"
            aria-label="Pick a game from these results"
            onClick={() => {
              const next = pickArcadeGame(games, game);
              if (next) onSelect(next);
            }}
          >
            <Shuffle size={15} aria-hidden="true" /> Pick for me
          </button>
        )}
      </div>
      {games.length ? (
        <ul className="md-play-game-list">
          {games.map((item) => (
            <li key={item.id}>
              <Link
                to="/play/$gameId"
                params={{ gameId: item.id }}
                search={{}}
                className={"md-play-game-card" + (game === item.id ? " is-current" : "")}
                aria-label={(game === item.id ? "Return to " : "Play ") + item.name}
                aria-current={game === item.id ? "page" : undefined}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onSelect(item.id);
                }}
              >
                <span className="md-play-game-art">
                  <img src={gameFoodArtwork[item.art]} alt="" loading="lazy" />
                </span>
                <span className="md-play-game-copy">
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                  <small>
                    {item.category} · {item.players}
                  </small>
                  {(NEW_ARCADE_GAMES.includes(item.id) || favourites.includes(item.id)) && (
                    <span className="md-play-game-badges">
                      {NEW_ARCADE_GAMES.includes(item.id) && <b>New</b>}
                      {favourites.includes(item.id) && (
                        <span>
                          <Star size={12} aria-hidden="true" /> Saved
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span className="md-play-game-action" aria-hidden="true">
                  {game === item.id ? <CheckCircle2 size={20} /> : <ArrowRight size={18} />}
                </span>
                {game === item.id && <span className="md-play-playing">At your table</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="md-play-empty">
          <Search size={26} aria-hidden="true" />
          <h3>
            {collection === "favourites" && favourites.length === 0
              ? "Make it your game shelf"
              : "No games found"}
          </h3>
          <p>
            {collection === "favourites" && favourites.length === 0
              ? "Open a game and tap Save favourite above the board. Your choices stay on this device."
              : "Try another name, collection or category."}
          </p>
          <button type="button" className="md-play-button md-play-button--quiet" onClick={clear}>
            Show all games
          </button>
        </div>
      )}
      <p className="md-play-library-note">
        Browse without losing your current round. Switching to another game starts a fresh one.
      </p>
    </div>
  );
}

export type ArcadePageProps = {
  search: ArcadeSearch;
  page?: "library" | "game" | "daily" | undefined;
};

/** The root keeps ArcadeProgressProvider mounted across all public /play routes. */
export function ArcadePage({ search, page = "library" }: ArcadePageProps) {
  const { brand = "mealdeck", game = "feast-2048", daily, size } = search;
  const { progress, today } = useArcadeProgress();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArcadeFilter>("All games");
  const [collection, setCollection] = useState<ArcadeCollection>("all");
  const [favourites, setFavourites] = useState<ArcadeGameId[]>([]);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [toolbarMessage, setToolbarMessage] = useState("");
  const [shareRequest, setShareRequest] = useState<ArcadeShareRequest | null>(null);
  const shareTriggerRef = useRef<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerViewport, setPickerViewport] = useState<CSSProperties>({});
  const [focusMode, setFocusMode] = useState(false);
  const [dailyLaunchSequence, setDailyLaunchSequence] = useState(0);
  const gamePanelRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLElement>(null);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const pickerTitleRef = useRef<HTMLHeadingElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocus = useRef(page !== "library");
  const selectedInPicker = useRef(false);
  const activeGame = ARCADE_GAMES.find((item) => item.id === game) ?? ARCADE_GAMES[0]!;
  const favourite = favourites.includes(game);
  const latestRound = progress.rounds.find((round) => round.game === game);
  const gameInterrupted = pickerOpen || shareRequest !== null;
  const suggestions = getArcadeSuggestions(
    page === "library" ? null : game,
    progress.rounds.map((round) => round.game),
    favourites,
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!pickerOpen || !viewport) {
      setPickerViewport({});
      return;
    }
    const update = () => {
      // Mobile keyboards can shrink the visual viewport without changing 100dvh.
      setPickerViewport({
        "--md-picker-viewport-height": `${Math.min(viewport.height, window.innerHeight)}px`,
        "--md-picker-bottom": `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      } as CSSProperties);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pickerOpen]);

  useEffect(() => {
    try {
      setFavourites(parseArcadeFavourites(localStorage.getItem(FAVOURITES_KEY)));
    } catch {
      // Optional storage must not prevent play or saving for the current visit.
    }
    setPreferenceReady(true);
    function sync(event: StorageEvent) {
      if (event.key === FAVOURITES_KEY) setFavourites(parseArcadeFavourites(event.newValue));
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    setToolbarMessage("");
    setShareRequest(null);
  }, [game, brand, daily, size]);

  function toggleFavourite() {
    const next = favourite ? favourites.filter((id) => id !== game) : [...favourites, game];
    setFavourites(next);
    try {
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next));
      setToolbarMessage(
        favourite
          ? `${activeGame.name} removed from favourites.`
          : `${activeGame.name} saved to favourites on this device.`,
      );
    } catch {
      setToolbarMessage(
        favourite
          ? "Favourite removed for this visit."
          : "Favourite saved for this visit. Device storage is unavailable.",
      );
    }
  }

  function openShare(request: ArcadeShareRequest, trigger: HTMLButtonElement) {
    shareTriggerRef.current = trigger;
    setShareRequest(request);
  }

  const focusGame = useCallback(() => {
    gamePanelRef.current?.focus({ preventScroll: true });
    const target = gamePanelRef.current?.closest(".md-play-player") ?? gamePanelRef.current;
    target?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, []);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const frame = requestAnimationFrame(() => {
      focusGame();
      pendingFocus.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [game, brand, daily, size, dailyLaunchSequence, focusGame]);

  function selectGame(id: ArcadeGameId) {
    selectedInPicker.current = pickerOpen;
    setPickerOpen(false);
    if (id === game) {
      requestAnimationFrame(focusGame);
      return;
    }
    pendingFocus.current = true;
    void navigate({
      to: "/play/$gameId",
      params: { gameId: id },
      search: { brand },
      resetScroll: false,
    });
  }

  function showLibrary() {
    if (window.matchMedia("(max-width: 900px)").matches) {
      if (document.activeElement instanceof HTMLButtonElement)
        pickerTriggerRef.current = document.activeElement;
      setPickerOpen(true);
      return;
    }
    setFocusMode(false);
    requestAnimationFrame(() => {
      desktopSearchRef.current?.focus({ preventScroll: true });
      libraryRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  }

  function selectDailyGame(id: "sauce-switch" | "menu-quest" | "bento-sudoku") {
    const today = new Date().toISOString().slice(0, 10);
    pendingFocus.current = true;
    if (id === game && daily === today) {
      // The playbook's explicit Play again action must set up another attempt,
      // while selecting the current game in the library still preserves its board.
      setDailyLaunchSequence((sequence) => sequence + 1);
      return;
    }
    void navigate({
      to: "/play/$gameId",
      params: { gameId: id },
      search: { brand, daily: today },
      resetScroll: false,
    });
  }

  const panels: Record<ArcadeGameId, ReactNode> = {
    "snack-trail": <SnackTrail suspended={gameInterrupted} />,
    "skewer-sort": <SkewerSort />,
    "pantry-sweep": <PantrySweep />,
    "bento-sudoku": <BentoSudoku dailyDate={daily} initialSize={size === 6 ? 6 : 4} />,
    "tray-lines": <TrayLines suspended={gameInterrupted} />,
    "sauce-switch": <SauceSwitch dailyDate={daily} initialSize={size === 4 ? 4 : 3} />,
    "menu-quest": <MenuQuest dailyDate={daily} />,
    "tray-tactics": <TrayTactics suspended={gameInterrupted} />,
    "feast-2048": <Feast2048 suspended={gameInterrupted} />,
    "four-to-feast": <FourToFeast suspended={gameInterrupted} />,
    "order-echo": <OrderEcho suspended={gameInterrupted} />,
    "kitchen-shuffle": <KitchenShuffle suspended={gameInterrupted} />,
    pairs: <FoodPairs key={brand} brand={brand} suspended={gameInterrupted} />,
    recipe: <RecipeRush />,
    "kitchen-chaos": <KitchenChaos suspended={gameInterrupted} />,
    snap: <BrandSnap suspended={gameInterrupted} />,
    "go-dish": <GoDish suspended={gameInterrupted} />,
    "full-house": <FullHouse suspended={gameInterrupted} />,
    solitaire: <KitchenStacks suspended={gameInterrupted} />,
  };
  const libraryProps = {
    game,
    query,
    filter,
    collection,
    favourites,
    setQuery,
    setFilter,
    setCollection,
    onSelect: selectGame,
  };

  return (
    <div
      className="md-marketing-shell dp-shell md-arcade-shell"
      data-focus={focusMode ? "on" : "off"}
      data-page={page}
    >
      <SiteHeader />
      <main className="dp-main md-play-main">
        <div className="md-play-layout">
          <header className="md-play-intro">
            <div>
              <p className="md-play-eyebrow">
                <Gamepad2 size={20} aria-hidden="true" /> MEALDECK PLAY
              </p>
              <h1>
                {page === "library" ? (
                  <>
                    Your next game,
                    <br />
                    <em>served up.</em>
                  </>
                ) : page === "daily" ? (
                  "Your daily food puzzle"
                ) : (
                  activeGame.name
                )}
              </h1>
              <p>
                {page === "library" ? (
                  <>
                    {ARCADE_GAMES.length} food-themed games. Play solo, challenge the chef or share
                    a round with a friend.
                  </>
                ) : page === "daily" ? (
                  <>
                    {activeGame.name} for <time dateTime={daily}>{daily}</time> UTC. This puzzle
                    keeps its date while you play.
                  </>
                ) : (
                  activeGame.description
                )}
              </p>
              <div className="md-play-hero-actions">
                <button type="button" className="md-play-button" onClick={showLibrary}>
                  <Grid2X2 size={18} aria-hidden="true" /> Choose a game
                </button>
                <button
                  type="button"
                  className="md-play-button md-play-button--quiet"
                  onClick={() => {
                    setCollection("new");
                    setFilter("All games");
                    setQuery("");
                    showLibrary();
                  }}
                >
                  Try {NEW_ARCADE_GAMES.length} new games{" "}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
                {page === "daily" ? (
                  <button
                    type="button"
                    className="md-play-button md-play-button--quiet"
                    disabled={!today}
                    onClick={() => selectDailyGame(resolveArcadeDailyPage().game)}
                  >
                    <CalendarDays size={17} aria-hidden="true" />{" "}
                    {daily === today ? "New daily attempt" : "Play today's challenge"}
                  </button>
                ) : (
                  <Link
                    to="/play/daily"
                    preload={false}
                    className="md-play-button md-play-button--quiet"
                  >
                    <CalendarDays size={17} aria-hidden="true" /> Daily challenge
                  </Link>
                )}
                <span>Always free. No sign-in needed.</span>
              </div>
            </div>
            <div className="md-play-hero-art" aria-hidden="true">
              <img className="md-play-hero-back" src={cardBack} alt="" />
              <div className="md-play-hero-front">
                <span>{ARCADE_GAMES.length}</span>
                <img src={gameFoodArtwork.burger} alt="" />
                <strong>ONE MORE ROUND</strong>
              </div>
            </div>
          </header>
          {page === "library" && (
            <section className="md-play-recommendations md-play-recommendations--library" aria-label="Quick game picks">
              <div className="md-play-recommendations-heading">
                <div>
                  <h2>{progress.rounds.length || favourites.length ? "Your next round" : "Pick your first game"}</h2>
                  <p>{progress.rounds.length || favourites.length ? "Revisit a favourite or try a fresh challenge." : "Three different ways to play, no account needed."}</p>
                </div>
                <button type="button" className="md-play-button md-play-button--quiet" onClick={() => {
                  setQuery("");
                  setFilter("All games");
                  setCollection("all");
                  showLibrary();
                }}>
                  <Grid2X2 size={17} aria-hidden="true" /> All games
                </button>
              </div>
              <div className="md-play-recommendations-grid">
                {suggestions.map((item) => (
                  <button key={item.id} type="button" className="md-play-recommendation" onClick={() => selectGame(item.id)}>
                    <img src={gameFoodArtwork[item.art]} width={64} height={64} alt="" />
                    <span><strong>{item.name}</strong><small>{item.category} · {item.players}</small><span>{item.description}</span></span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          )}
          <div
            className="md-play-workspace"
            onKeyDown={(event) => {
              if (event.key === "Escape" && focusMode) {
                setFocusMode(false);
                event.stopPropagation();
              }
            }}
          >
            <aside
              className="md-play-library"
              ref={libraryRef}
              aria-labelledby="arcade-library-title"
            >
              <div className="md-play-library-heading">
                <div>
                  <p>FIND YOUR FAVOURITE</p>
                  <h2 id="arcade-library-title">Game library</h2>
                </div>
                <span>{ARCADE_GAMES.length}</span>
              </div>
              <GameLibrary {...libraryProps} searchInputRef={desktopSearchRef} />
            </aside>
            <div className="md-play-player">
              <div className="md-play-toolbar">
                <p>
                  <Gamepad2 size={18} aria-hidden="true" />
                  <span>
                    {activeGame.category}
                    <small>{activeGame.players}</small>
                  </span>
                </p>
                <div>
                  {page !== "library" && (
                    <Link to="/play" className="md-play-button md-play-button--quiet md-play-all-games">
                      <Grid2X2 size={17} aria-hidden="true" /> All games
                    </Link>
                  )}
                  <button
                    type="button"
                    className="md-play-button md-play-button--quiet md-play-save-button"
                    aria-pressed={favourite}
                    aria-label={favourite ? "Remove favourite" : "Save favourite"}
                    disabled={!preferenceReady}
                    onClick={toggleFavourite}
                  >
                    <Star size={17} fill={favourite ? "currentColor" : "none"} aria-hidden="true" />
                    <span>{favourite ? "Saved" : "Save"}</span>
                  </button>
                  <button
                    type="button"
                    className="md-play-button md-play-button--quiet md-play-share-button"
                    aria-label={`Share ${activeGame.name}`}
                    onClick={(event) =>
                      openShare({ game, brand, dailyDate: daily, size }, event.currentTarget)
                    }
                  >
                    <Share2 size={17} aria-hidden="true" /> <span>Share</span>
                  </button>
                  <button
                    type="button"
                    className="md-play-button md-play-button--quiet md-play-picker-button"
                    onClick={showLibrary}
                  >
                    <Grid2X2 size={17} aria-hidden="true" /> Switch game
                  </button>
                  <button
                    type="button"
                    className="md-play-button md-play-button--quiet"
                    aria-pressed={focusMode}
                    onClick={() => {
                      setFocusMode((value) => !value);
                      requestAnimationFrame(focusGame);
                    }}
                  >
                    {focusMode ? (
                      <Minimize2 size={17} aria-hidden="true" />
                    ) : (
                      <Maximize2 size={17} aria-hidden="true" />
                    )}
                    <span>{focusMode ? "Exit focus view" : "Focus view"}</span>
                  </button>
                </div>
              </div>
              <p className="md-play-toolbar-message" role="status" aria-atomic="true">
                {toolbarMessage}
              </p>
              {game === "pairs" && (
                <div className="md-play-deck">
                  <label htmlFor="pairs-deck">Food Pairs deck</label>
                  <select
                    id="pairs-deck"
                    value={brand}
                    onChange={(event) => {
                      const nextBrand = event.target.value;
                      if (!isBrandTheme(nextBrand)) return;
                      pendingFocus.current = true;
                      void navigate({
                        to: "/play/$gameId",
                        params: { gameId: game },
                        search: { brand: nextBrand },
                        resetScroll: false,
                      });
                    }}
                  >
                    {Object.entries(BRAND_THEMES).map(([id, item]) => (
                      <option key={id} value={id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <span>Changing the deck deals a new round.</span>
                </div>
              )}
              <div
                id="arcade-active-game"
                className="md-play-game-region"
                ref={gamePanelRef}
                tabIndex={-1}
                role="region"
                aria-label={activeGame.name}
              >
                <GamePanelBoundary
                  key={`${game}:${daily ?? "fresh"}:${size ?? "default"}:${dailyLaunchSequence}`}
                  onChooseGame={showLibrary}
                >
                  <Suspense
                    fallback={
                      <p className="md-quick-loading" role="status">
                        Getting your game ready…
                      </p>
                    }
                  >
                    {panels[game]}
                  </Suspense>
                </GamePanelBoundary>
              </div>
              <nav className="md-play-game-links" aria-label="More from MealDeck">
                <Link to="/menus">
                  Explore the menus <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link to="/play/promote">
                  Share &amp; print kit <Share2 size={16} aria-hidden="true" />
                </Link>
                {!focusMode && <a href="#arcade-game-help">Game help &amp; Q&amp;A <Lightbulb size={16} aria-hidden="true" /></a>}
              </nav>
              {latestRound && (
                <aside className="md-play-share-round" aria-label="Share your latest result">
                  <div>
                    <strong>Give a friend their next challenge.</strong>
                    <p>Share your latest finished {activeGame.name} round from your playbook.</p>
                  </div>
                  <button
                    type="button"
                    className="md-play-button md-play-button--quiet"
                    onClick={(event) =>
                      openShare({ game, completion: latestRound }, event.currentTarget)
                    }
                  >
                    <Share2 size={17} aria-hidden="true" /> Share latest result
                  </button>
                </aside>
              )}
              {focusMode && (
                <p className="md-play-focus-note">
                  More room to play. Use “Exit focus view” or press Escape to return to the full
                  arcade.
                </p>
              )}
            </div>
          </div>
          {page !== "library" && (
            <section className="md-play-recommendations md-play-recommendations--related" aria-label="More games like this">
              <div className="md-play-recommendations-heading">
                <div><h2>Another round?</h2><p>Try a related game. Switching starts a new board.</p></div>
                <Link to="/play" className="md-play-button md-play-button--quiet">All games <ArrowRight size={17} aria-hidden="true" /></Link>
              </div>
              <div className="md-play-recommendations-grid">
                {suggestions.map((item) => (
                  <button key={item.id} type="button" className="md-play-recommendation" onClick={() => selectGame(item.id)}>
                    <img src={gameFoodArtwork[item.art]} width={64} height={64} loading="lazy" alt="" />
                    <span><strong>{item.name}</strong><small>{item.category} · {item.players}</small><span>{item.description}</span></span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="md-play-playbook md-play-playbook--after-game">
            <ArcadePlaybook onDailyGame={selectDailyGame} onShare={openShare} />
          </div>
          <ArcadeHelp game={page === "library" ? undefined : game} />
          <section className="md-play-footnote" aria-label="About MealDeck games">
            <Gamepad2 size={24} aria-hidden="true" />
            <div>
              <h2>A good round. Just for fun.</h2>
              <p>
                Games are free and don’t award food, cash, discounts or loyalty points. Any saved
                best scores stay on this device.
              </p>
            </div>
            <Link to="/menus">
              Explore the menus <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </main>
      <SiteFooter />
      <ArcadeShareDialog
        request={shareRequest}
        onClose={() => setShareRequest(null)}
        returnFocusRef={shareTriggerRef}
      />
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent
          className="md-play-picker"
          overlayClassName="md-play-picker-overlay"
          style={pickerViewport}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            // Opening the picker must not summon the phone keyboard and cover its games.
            pickerTitleRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (selectedInPicker.current) {
              selectedInPicker.current = false;
            } else {
              (pickerTriggerRef.current ?? gamePanelRef.current)?.focus({ preventScroll: true });
            }
          }}
        >
          <div className="md-play-picker-heading">
            <DialogTitle ref={pickerTitleRef} tabIndex={-1}>
              Choose your game
            </DialogTitle>
            <DialogDescription>
              Find a new challenge or return to your current round.
            </DialogDescription>
          </div>
          <GameLibrary {...libraryProps} searchInputRef={pickerSearchRef} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
