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
  RECIPES,
  isBrandTheme,
  makePairs,
  recipeMatches,
  type BrandTheme,
  type PairCard,
} from "@/lib/dishbee-play";
import {
  ARCADE_CATEGORIES,
  ARCADE_COLLECTIONS,
  ARCADE_GAMES,
  NEW_ARCADE_GAMES,
  findArcadeGames,
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

function FoodPairs({ brand }: { brand: BrandTheme }) {
  const [cards, setCards] = useState<PairCard[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [round, setRound] = useState(0);
  const [message, setMessage] = useState("Choose a card, then find its matching food.");
  const firstCardRef = useRef<HTMLButtonElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const complete = cards.length > 0 && matched.length === cards.length;

  useEffect(() => {
    if (!complete) return;
    const frame = requestAnimationFrame(() => replayRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [complete]);

  useEffect(() => {
    setCards(makePairs(brand));
  }, [brand]);

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [first, second] = flipped;
    const a = cards.find((card) => card.id === first);
    const b = cards.find((card) => card.id === second);
    if (!a || !b || first === undefined || second === undefined) return;
    const match = a.food === b.food;
    const timer = setTimeout(
      () => {
        if (match) {
          setMatched((previous) => [...previous, first, second]);
          setMessage(a.label + " pair found. Choose your next card.");
        } else {
          setMessage("No match this time. Remember those foods and try again.");
        }
        setFlipped([]);
      },
      match ? 350 : 1000,
    );
    return () => clearTimeout(timer);
  }, [cards, flipped]);

  function restart() {
    setCards(makePairs(brand));
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setRound((value) => value + 1);
    setMessage("A fresh deck. Choose your first card.");
    requestAnimationFrame(() => firstCardRef.current?.focus());
  }

  function flip(card: PairCard) {
    if (complete || flipped.length === 2 || flipped.includes(card.id) || matched.includes(card.id))
      return;
    setFlipped((previous) => [...previous, card.id]);
    if (flipped.length === 1) {
      setMoves((previous) => previous + 1);
      setMessage("Checking your two cards…");
    } else {
      setMessage(card.label + " revealed. Find its matching card.");
    }
  }

  return (
    <section className="md-quick-game" aria-labelledby="pairs-title">
      <div className="md-quick-head">
        <div>
          <p className="md-quick-kicker">MATCH & REMEMBER</p>
          <h2 id="pairs-title">Food Pairs</h2>
          <p>Turn over two cards at a time. Find all six pairs in as few moves as you can.</p>
        </div>
        <button className="md-play-button md-play-button--quiet" type="button" onClick={restart}>
          <RotateCcw size={17} aria-hidden="true" /> New game
        </button>
      </div>
      <div className="md-quick-stats">
        <div>
          <span>Pairs found</span>
          <strong>
            {matched.length / 2}
            <small> / 6</small>
          </strong>
        </div>
        <div>
          <span>Moves</span>
          <strong>{moves}</strong>
        </div>
        <div>
          <span>Your deck</span>
          <strong className="md-quick-deck-name">{BRAND_THEMES[brand].label}</strong>
        </div>
      </div>
      <progress
        className="md-quick-progress"
        max={6}
        value={matched.length / 2}
        aria-label="Pairs found"
      />
      <p className="md-quick-message" role="status" aria-atomic="true">
        {complete ? "All six pairs found in " + moves + " moves. Nicely played!" : message}
      </p>
      {cards.length === 0 ? (
        <p className="md-quick-loading" role="status">
          Shuffling your deck…
        </p>
      ) : (
        <div
          className="md-pairs-board"
          role="group"
          aria-label="Twelve food cards"
          aria-busy={flipped.length === 2}
        >
          {cards.map((card, index) => {
            const isMatched = matched.includes(card.id);
            const shown = isMatched || flipped.includes(card.id);
            return (
              <button
                type="button"
                key={round + "-" + card.id}
                ref={index === 0 ? firstCardRef : undefined}
                className={
                  "md-pair-card" + (shown ? " is-revealed" : "") + (isMatched ? " is-matched" : "")
                }
                onClick={() => flip(card)}
                aria-disabled={shown || flipped.length === 2 || complete}
                tabIndex={isMatched ? -1 : 0}
                aria-label={
                  (isMatched
                    ? "Matched " + card.label
                    : shown
                      ? card.label + " revealed"
                      : "Reveal card " + (index + 1)) + (shown ? ", card " + (index + 1) : "")
                }
                aria-pressed={shown}
              >
                <span className="md-pair-flip" aria-hidden="true">
                  <span className="md-pair-back">
                    <img src={cardBack} alt="" />
                    <small>{index + 1}</small>
                  </span>
                  <span className="md-pair-front">
                    <img src={gameFoodArtwork[card.art]} alt="" />
                    <strong>{card.label}</strong>
                    {isMatched && (
                      <span className="md-pair-check">
                        <Check size={16} />
                      </span>
                    )}
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
            <p>You cleared the deck in {moves} moves. Ready to try for fewer?</p>
          </div>
          <button ref={replayRef} type="button" className="md-play-button" onClick={restart}>
            Play again <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
      )}
      <p className="md-quick-tip">
        Tip: work across the deck in a pattern to remember where each food is hiding.
      </p>
    </section>
  );
}

function RecipeRush() {
  const [recipe, setRecipe] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [stage, setStage] = useState<"choosing" | "correct" | "complete">("choosing");
  const targetRef = useRef<HTMLHeadingElement>(null);
  const nextActionRef = useRef<HTMLButtonElement>(null);
  const current = RECIPES[recipe] ?? RECIPES[0];
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
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  }

  function check() {
    if (selected.length !== 3 || stage !== "choosing") return;
    if (!recipeMatches(selected, current.ingredients)) {
      setFeedback("Not quite. Swap an ingredient, or open the recipe hint for a hand.");
      return;
    }
    setFeedback("That's the recipe! All three ingredients are correct.");
    setStage(recipe === RECIPES.length - 1 ? "complete" : "correct");
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

  function restart() {
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
        <button className="md-play-button md-play-button--quiet" type="button" onClick={restart}>
          <RotateCcw size={17} aria-hidden="true" /> New game
        </button>
      </div>
      <div className="md-quick-stats md-quick-stats--two">
        <div>
          <span>Recipes completed</span>
          <strong>
            {completed}
            <small> / {RECIPES.length}</small>
          </strong>
        </div>
        <div>
          <span>Ingredients selected</span>
          <strong>
            {selected.length}
            <small> / 3</small>
          </strong>
        </div>
      </div>
      <progress
        className="md-quick-progress"
        max={RECIPES.length}
        value={completed}
        aria-label="Recipes completed"
      />
      <div className="md-recipe-target">
        <img src={gameFoodArtwork[current.art]} alt="" />
        <div>
          <span>
            RECIPE {recipe + 1} OF {RECIPES.length}
          </span>
          <h3 ref={targetRef} tabIndex={-1}>
            {current.label}
          </h3>
          <p>
            {stage === "choosing"
              ? "Select an ingredient again to remove it."
              : "All the right ingredients. Great work."}
          </p>
        </div>
      </div>
      <details className="md-recipe-hint" key={recipe}>
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
          <button
            type="button"
            className="md-play-button"
            disabled={selected.length !== 3}
            onClick={check}
          >
            Check my recipe <ArrowRight size={18} aria-hidden="true" />
          </button>
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
            <h3>Three dishes. One happy chef.</h3>
            <p>You completed every recipe in the deck.</p>
          </div>
          <button ref={nextActionRef} type="button" className="md-play-button" onClick={restart}>
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
    gamePanelRef.current?.scrollIntoView({
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
    "tray-lines": <TrayLines />,
    "sauce-switch": <SauceSwitch dailyDate={daily} initialSize={size === 4 ? 4 : 3} />,
    "menu-quest": <MenuQuest dailyDate={daily} />,
    "tray-tactics": <TrayTactics />,
    "feast-2048": <Feast2048 />,
    "four-to-feast": <FourToFeast />,
    "order-echo": <OrderEcho suspended={gameInterrupted} />,
    "kitchen-shuffle": <KitchenShuffle />,
    pairs: <FoodPairs key={brand} brand={brand} />,
    recipe: <RecipeRush />,
    "kitchen-chaos": <KitchenChaos />,
    snap: <BrandSnap />,
    "go-dish": <GoDish />,
    "full-house": <FullHouse />,
    solitaire: <KitchenStacks />,
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
          <div className="md-play-playbook">
            <ArcadePlaybook onDailyGame={selectDailyGame} onShare={openShare} />
          </div>
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
                    <Grid2X2 size={17} aria-hidden="true" /> Games
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
