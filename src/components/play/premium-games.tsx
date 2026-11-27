import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Lightbulb,
  RotateCcw,
  Shuffle,
  Trophy,
} from "lucide-react";
import { suitArtwork } from "@/lib/food-suit-artwork";
import { useArcadeRoundTracker } from "@/components/play/arcade-progress";
import { createArcadeRoundId } from "@/lib/mealdeck-play-progress";
import { marketingBrands, cafe1Brand } from "@/lib/marketing-brands";
import cardBack from "@/assets/mealdeck-card-back.png";
import {
  CHAOS_SUITS,
  CHAOS_COLOURS,
  CHAOS_SUIT_NAMES,
  canPlayChaos,
  chooseChaosMove,
  CHAOS_DIFFICULTIES,
  CHAOS_TURN_LIMIT,
  type ChaosDifficulty,
  type ChaosAdvice,
  drawChaos,
  playChaos,
  startChaos,
  type ChaosCard,
  type ChaosState,
  type FoodSuit,
} from "@/lib/kitchen-chaos";
import {
  askGoDish,
  chooseGoDishRank,
  GO_DISH_DIFFICULTIES,
  type GoDishDifficulty,
  type GoDishRank,
  suggestFullHouseCard,
  toggleFullHouseSelection,
  createStacksSave,
  parseStacksSave,
  STACKS_SAVE_KEY,
  type StacksSave,
  createBrandSnapRounds,
  createSnapSession,
  answerSnap,
  advanceSnap,
  snapStatistics,
  SNAP_LENGTHS,
  type SnapLength,
  type SnapSession,
  drawGoDishIfEmpty,
  isFullHouse,
  makeFullHousePuzzle,
  stackSolitaireCard,
  startGoDish,
  startSolitaire,
  type FullHouseCard,
  type GoDishState,
  type SolitaireState,
} from "@/lib/mealdeck-collection-games";
import "@/styles.mealdeck-card-games.css";

const brands = [...marketingBrands, cafe1Brand];
const brandMap = Object.fromEntries(brands.map((brand) => [brand.id, brand])) as Record<
  string,
  (typeof brands)[number]
>;

/** Only move focus after an action removes or disables the player's control. */
function useNextActionFocus(state: unknown) {
  const regionRef = useRef<HTMLElement>(null);
  const pendingSelector = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingSelector.current) return;
    const region = regionRef.current;
    const next =
      region?.querySelector<HTMLButtonElement>(pendingSelector.current) ??
      region?.querySelector<HTMLButtonElement>("[data-next-action]:not(:disabled)");
    pendingSelector.current = null;
    next?.focus();
  }, [state]);
  return {
    regionRef,
    requestFocus: (selector = "[data-card-action]:not(:disabled)") => {
      pendingSelector.current = selector;
    },
  };
}

function Intro({
  title,
  goal,
  mode,
  rules,
  onReset,
  resetLabel = "New round",
}: {
  title: string;
  goal: string;
  mode: string;
  rules: string[];
  onReset: () => void;
  resetLabel?: string;
}) {
  return (
    <>
      <header className="md-card-game__header">
        <div>
          <p className="md-card-game__eyebrow">{mode}</p>
          <h2>{title}</h2>
          <p className="md-card-game__goal">{goal}</p>
        </div>
        <button
          type="button"
          className="md-card-game__button md-card-game__button--secondary"
          onClick={onReset}
        >
          <RotateCcw size={16} aria-hidden="true" /> {resetLabel}
        </button>
      </header>
      <details className="md-card-game__rules">
        <summary>
          <span>
            <BookOpen size={17} aria-hidden="true" /> How to play
          </span>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <ol>
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </details>
    </>
  );
}

function LocalNote() {
  return (
    <p className="md-card-game__local-note">
      Local play. Your round resets when you leave this game or reload.
    </p>
  );
}

function Stats({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="md-card-game__stats">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Progress({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="md-card-game__progress">
      <div>
        <span>{label}</span>
        <strong>
          {value} / {max}
        </strong>
      </div>
      <progress aria-label={label} value={value} max={max} />
    </div>
  );
}

function Result({
  title,
  message,
  success = false,
  complete = false,
}: {
  title: string;
  message: string;
  success?: boolean;
  complete?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`md-card-game__result ${success ? "is-success" : ""} ${complete ? "is-complete" : ""}`}
    >
      {success &&
        (complete ? (
          <Trophy size={22} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={20} aria-hidden="true" />
        ))}
      <div>
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
    </div>
  );
}

function FoodIcon({
  food,
  className = "md-card-game__food-icon",
}: {
  food: FoodSuit;
  className?: string;
}) {
  return <img src={suitArtwork[food]} className={className} alt="" draggable={false} />;
}

function FoodCard({
  card,
  disabled,
  selected,
  ready,
  hinted,
  status,
  onClick,
}: {
  card: FullHouseCard;
  disabled?: boolean;
  selected?: boolean;
  ready?: boolean;
  hinted?: boolean;
  status?: string;
  onClick?: () => void;
}) {
  const name = `${CHAOS_SUIT_NAMES[card.suit]} ${card.rank}`;
  const className = `md-card-game__food-card ${selected ? "is-selected" : ""} ${ready ? "is-ready" : ""} ${hinted ? "is-hinted" : ""}`;
  const style = { "--food-color": CHAOS_COLOURS[card.suit] } as CSSProperties;
  const face = (
    <>
      <span className="md-card-game__card-rank">{card.rank}</span>
      <FoodIcon food={card.suit} className="md-card-game__card-art" />
      <span className="md-card-game__card-caption">{CHAOS_SUIT_NAMES[card.suit]}</span>
      {status && (
        <span className="md-card-game__card-state">
          {selected && <Check size={12} aria-hidden="true" />}
          {hinted && <Lightbulb size={12} aria-hidden="true" />}
          {status}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={className}
      style={style}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${name}${status ? `. ${status}` : ""}`}
      data-card-action=""
      data-card-id={card.id}
      data-card-ready={ready || undefined}
      onClick={onClick}
    >
      {face}
    </button>
  ) : (
    <div className={className} style={style} role="img" aria-label={name}>
      {face}
    </div>
  );
}

function chaosCardDescription(card: ChaosCard) {
  return card.action === "rush"
    ? "Rush +2"
    : card.action === "pause"
      ? "Prep Delay"
      : card.action === "chef-choice"
        ? "Chef's Choice"
        : `Number ${card.value}`;
}

function ChaosPlayingCard({
  card,
  playable = false,
  hinted = false,
  suspended = false,
  finished = false,
  onClick,
}: {
  card: ChaosCard;
  playable?: boolean;
  hinted?: boolean;
  suspended?: boolean;
  finished?: boolean;
  onClick?: () => void;
}) {
  const description = chaosCardDescription(card);
  const suit = card.suit === "wild" ? "Any food" : CHAOS_SUIT_NAMES[card.suit];
  const className = `md-card-game__food-card md-card-game__chaos-card ${playable ? "is-ready" : ""} ${hinted ? "is-hinted" : ""}`;
  const style = {
    "--food-color": card.suit === "wild" ? "#26221f" : CHAOS_COLOURS[card.suit],
  } as CSSProperties;
  const status = finished ? "Round over" : hinted ? "Suggested card" : playable ? "Play this card" : "No match";
  const face = (
    <>
      <span className="md-card-game__card-rank">
        {card.action === "number"
          ? card.value
          : card.action === "chef-choice"
            ? "★"
            : card.action === "rush"
              ? "+2"
              : "Ⅱ"}
      </span>
      {card.suit === "wild" ? (
        <ChefHat className="md-card-game__card-art" aria-hidden="true" />
      ) : (
        <FoodIcon food={card.suit} className="md-card-game__card-art" />
      )}
      <span className="md-card-game__card-caption">{suit}</span>
      {card.action !== "number" && <span className="md-card-game__card-action">{description}</span>}
      {onClick && <span className="md-card-game__card-state">{status}</span>}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={className}
      style={style}
      disabled={!playable || suspended}
      data-card-action=""
      data-card-id={card.id}
      onClick={onClick}
      aria-label={`${suit}, ${description}. ${status}.`}
    >
      {face}
    </button>
  ) : (
    <div
      className={className}
      style={style}
      role="img"
      aria-label={`Top card: ${suit}, ${description}`}
    >
      {face}
    </div>
  );
}

export function KitchenChaos({ suspended = false }: { suspended?: boolean }) {
  const [state, setState] = useState<ChaosState | null>(null);
  const [choice, setChoice] = useState<FoodSuit>("burger");
  const [difficulty, setDifficulty] = useState<ChaosDifficulty>("classic");
  const [playableOnly, setPlayableOnly] = useState(false);
  const [advice, setAdvice] = useState<ChaosAdvice | null>(null);
  const difficultyId = useId();
  const choiceId = useId();
  const { regionRef, requestFocus } = useNextActionFocus(state);
  const { beginRound } = useArcadeRoundTracker(state?.winner ? { game: "kitchen-chaos", result: state.winner === "player" ? "win" : state.winner === "chef" ? "loss" : "draw", moves: state.turns, variant: state.difficulty ?? "classic" } : null, true);
  useEffect(() => {
    setState(startChaos());
  }, []);
  const restart = () => {
    if (suspended) return;
    beginRound();
    setState(startChaos(Math.random, difficulty));
    setChoice("burger");
    setPlayableOnly(false);
    setAdvice(null);
  };
  const top = state?.played[state.played.length - 1];
  const playableCount = state?.player.filter((card) => canPlayChaos(card, state)).length ?? 0;
  const visibleHand = state ? state.player.filter(card => !playableOnly || state.winner !== null || canPlayChaos(card, state)) : [];
  function showAdvice() {
    if (!state || suspended || state.winner) return;
    const next = chooseChaosMove(state.player, top, state.activeSuit, "expert", state.chef.length);
    setAdvice(next);
    if (next && state.player.some(card => card.id === next.cardId && card.suit === "wild")) setChoice(next.declaredSuit);
  }
  return (
    <section className="md-card-game" aria-label="Kitchen Chaos" ref={regionRef}>
      <Intro
        title="Kitchen Chaos"
        goal="Empty your hand before the house chef. Match the active food or the top card's number or action."
        mode="You vs a local house chef"
        onReset={restart}
        rules={[
          "Choose a highlighted card that matches the active food, or the number or action on the top card. Chef's Choice can always be played.",
          "For Chef's Choice, pick a food in the selector before playing the card.",
          "Your Rush +2 gives the chef two cards and another move to you. Your Prep Delay also lets you play again.",
          "Otherwise the chef responds automatically. The chef's Rush +2 adds two cards to your hand; their Prep Delay adds one.",
          "Drawing adds a card to your hand and ends your move. Used cards refill an empty draw pile. The first empty hand wins.",
          "Choose the house chef’s strategy. A hint suggests a legal card without playing it. If neither hand clears within 120 player moves, the round is a draw.",
        ]}
      />
      <div className="md-card-game__settings"><label htmlFor={difficultyId}>House chef difficulty</label><select id={difficultyId} value={difficulty} disabled={suspended} onChange={event => {
        const value = event.target.value as ChaosDifficulty;
        if (!CHAOS_DIFFICULTIES.includes(value)) return;
        beginRound(); setDifficulty(value); setState(startChaos(Math.random, value)); setChoice("burger"); setAdvice(null); setPlayableOnly(false);
      }}><option value="relaxed">Relaxed · first legal match</option><option value="classic">Classic · balanced strategy</option><option value="expert">Expert · tactical chef</option></select><p>Changing difficulty deals a new hand. The chef uses its own cards and public game information.</p></div>
      {!state || !top ? (
        <p className="md-card-game__loading" role="status">
          Preparing your cards…
        </p>
      ) : (
        <>
          <Stats
            items={[
              { label: "Your cards", value: state.player.length },
              { label: "Chef's cards", value: state.chef.length },
              { label: "Moves played", value: state.turns },
              { label: "Playable cards", value: playableCount },
            ]}
          />
          <Result
            title={
              state.winner === "player"
                ? "You cleared your hand!"
                : state.winner === "chef"
                  ? "The house chef finished first"
                  : state.winner === "draw" ? "Round drawn" : "Your move"
            }
            message={
              state.winner
                ? `${state.message} ${state.turns} moves played.`
                : `${state.message} ${playableCount ? `${playableCount} playable ${playableCount === 1 ? "card" : "cards"} in your hand.` : "No matching cards — draw to continue."}`
            }
            success={state.winner === "player"}
            complete={state.winner !== null}
          />
          {state.winner && (
            <div className="md-card-game__actions">
              <button
                type="button"
                className="md-card-game__button"
                data-next-action=""
                onClick={() => {
                  requestFocus();
                  restart();
                }}
              >
                Play again <RotateCcw size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="md-card-game__chaos-board">
            <div className="md-card-game__opponent">
              <ChefHat size={24} aria-hidden="true" />
              <strong>House chef</strong>
              <span>{state.chef.length} cards left</span>
              <div className="md-card-game__card-backs" aria-hidden="true">
                {Array.from({ length: Math.min(3, state.chef.length) }, (_, index) => (
                  <img key={index} src={cardBack} alt="" draggable={false} />
                ))}
              </div>
            </div>
            <div className="md-card-game__top-card">
              <span className="md-card-game__small-label">Top card</span>
              <ChaosPlayingCard card={top} />
            </div>
            <div className="md-card-game__draw-area">
              <div className="md-card-game__active-suit">
                <FoodIcon food={state.activeSuit} />
                <div>
                  <span>Active food</span>
                  <strong>{CHAOS_SUIT_NAMES[state.activeSuit]}</strong>
                </div>
              </div>
              <p>{state.stock.length} in the draw pile</p>
              <button
                type="button"
                className="md-card-game__button md-card-game__button--secondary"
                data-next-action=""
                disabled={state.winner !== null || suspended}
                onClick={() => {
                  if (suspended) return;
                  setAdvice(null);
                  requestFocus();
                  setState((current) => (current ? drawChaos(current) : current));
                }}
              >
                Draw &amp; end move <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          {state.player.some((card) => card.suit === "wild") && !state.winner && (
            <div className="md-card-game__choice">
              <div>
                <label htmlFor={choiceId}>Chef's Choice food</label>
                <p>Choose the food your wild card will set.</p>
              </div>
              <select
                id={choiceId}
                value={choice}
                disabled={suspended}
                onChange={(event) => { setAdvice(null); setChoice(event.target.value as FoodSuit); }}
              >
                {CHAOS_SUITS.map((suit) => (
                  <option value={suit} key={suit}>
                    {CHAOS_SUIT_NAMES[suit]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="md-card-game__section-heading">
            <h3>Your hand</h3>
            {!state.winner && <span>{playableCount} of {state.player.length} cards are playable</span>}
          </div>
          {!state.winner && <div className="md-card-game__hand-tools"><button type="button" className="md-card-game__button md-card-game__button--secondary" aria-pressed={playableOnly} disabled={suspended} onClick={() => setPlayableOnly(value => !value)}>{playableOnly ? "Show all cards" : "Show playable only"}</button><button type="button" className="md-card-game__button md-card-game__button--secondary" onClick={showAdvice} disabled={suspended || !playableCount}><Lightbulb size={16} aria-hidden="true" /> Suggest a card</button><span>{state.turns} / {CHAOS_TURN_LIMIT} moves</span></div>}
          {advice && !state.winner && <p className="md-card-game__advice" role="status">{advice.reason} {state.player.some(card => card.id === advice.cardId && card.suit === "wild") ? "Suggested food: " + CHAOS_SUIT_NAMES[advice.declaredSuit] + "." : ""} Choose the suggested card to play it.</p>}
          {visibleHand.length ? (
            <ul className="md-card-game__card-grid" aria-label="Your cards">
              {visibleHand.map((card) => (
                <li key={card.id}>
                  <ChaosPlayingCard
                    card={card}
                    playable={canPlayChaos(card, state)}
                    hinted={advice?.cardId === card.id}
                    suspended={suspended}
                    finished={state.winner !== null}
                    onClick={() => {
                      if (suspended) return;
                      setAdvice(null);
                      requestFocus();
                      setState((current) =>
                        current ? playChaos(current, card.id, choice) : current,
                      );
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="md-card-game__empty">{state.player.length ? "No playable cards. Draw to continue, or show your full hand." : "Your hand is empty. Round won."}</p>
          )}
        </>
      )}
      <LocalNote />
    </section>
  );
}

export function BrandSnap({ suspended = false }: { suspended?: boolean }) {
  const [length, setLength] = useState<SnapLength>(12);
  const [session, setSession] = useState<SnapSession>(() => createSnapSession([]));
  const { regionRef, requestFocus } = useNextActionFocus(session);
  const { rounds, index: round, answers } = session;
  const stats = snapStatistics(session);
  const { beginRound } = useArcadeRoundTracker(rounds.length > 0 && round >= rounds.length ? { game: "snap", result: "completed", score: stats.correct, variant: `${rounds.length}-pairs` } : null, true);
  const restart = (nextLength: SnapLength = length) => {
    if (suspended) return;
    beginRound();
    setLength(nextLength);
    setSession(createSnapSession(createBrandSnapRounds(brands.map(brand => brand.id), nextLength)));
  };
  useEffect(() => {
    setSession(createSnapSession(createBrandSnapRounds(brands.map(brand => brand.id))));
  }, []);
  const current = rounds[round];
  const finished = rounds.length > 0 && round >= rounds.length;
  const left = current ? brandMap[current.left] : undefined;
  const right = current ? brandMap[current.right] : undefined;
  const last = answers[round];
  const mistakes = answers.filter(answer => !answer.correct);
  function submit(snap: boolean) {
    if (!current || last || !left || !right || suspended) return;
    requestFocus();
    setSession(value => answerSnap(value, round, snap));
  }
  return (
    <section className="md-card-game md-card-game--snap" aria-label="MealDeck Brand Snap" ref={regionRef}>
      <Intro
        title="MealDeck Brand Snap"
        goal="Same brand or different brands? Read the two cards and make your call."
        mode={`${length} pairs · No time limit`}
        onReset={() => restart()}
        rules={[
          "Choose Same brand when both cards show the same brand. Choose Different brands when they do not.",
          "Each correct answer adds one to your score. Check the answer before advancing.",
          "Choose a 6, 12 or 24-pair challenge. Every round has equally many matching and different pairs, and no timer.",
          "Review the pairs you missed at the end. Scores are for fun, not rewards.",
        ]}
      />
      <fieldset className="md-card-game__modes">
        <legend>Choose a challenge</legend>
        <div>{SNAP_LENGTHS.map(count => (
          <button type="button" key={count} className="md-card-game__button md-card-game__button--secondary" aria-pressed={length === count} disabled={suspended} onClick={() => { if (length !== count) restart(count); }}>
            <strong>{count === 6 ? "Quick" : count === 12 ? "Classic" : "Marathon"}</strong><small>{count} pairs</small>
          </button>
        ))}</div>
        <p>Changing the challenge starts a new quiz.</p>
      </fieldset>
      {rounds.length > 0 && <>
        <Stats items={[
          { label: finished ? "Pairs completed" : "Current pair", value: `${Math.min(round + 1, rounds.length)} / ${rounds.length}` },
          { label: "Correct answers", value: stats.correct },
          { label: "Accuracy", value: stats.answered ? stats.accuracy + "%" : "—" },
          { label: "Current streak", value: stats.streak },
        ]} />
        <Progress label="Pairs answered" value={stats.answered} max={rounds.length} />
      </>}
      {finished ? <>
        <Result title={stats.correct === rounds.length ? "A perfect round!" : "Round complete"}
          message={`You recognised ${stats.correct} of ${rounds.length} pairs correctly — ${stats.accuracy}% accuracy. Longest streak: ${stats.bestStreak}.`}
          success={stats.correct === rounds.length} complete />
        {mistakes.length > 0 && <details className="md-card-game__rules md-snap-review">
          <summary><span><BookOpen size={17} aria-hidden="true" /> Review {mistakes.length} missed {mistakes.length === 1 ? "pair" : "pairs"}</span><ChevronDown size={17} aria-hidden="true" /></summary>
          <ol>{mistakes.map(answer => {
            const pair = rounds[answer.index]!;
            return <li key={answer.index}><strong>Pair {answer.index + 1}: {brandMap[pair.left]?.name} / {brandMap[pair.right]?.name}</strong><span>Your answer: {answer.calledSnap ? "Same brand" : "Different brands"}. Correct answer: {pair.match ? "Same brand" : "Different brands"}.</span></li>;
          })}</ol>
        </details>}
        <div className="md-card-game__actions">
          <button type="button" className="md-card-game__button" data-next-action="" disabled={suspended} onClick={() => { requestFocus(); restart(); }}>Play again <RotateCcw size={16} aria-hidden="true" /></button>
        </div>
      </> : current && left && right ? <>
        <div className="md-card-game__snap-board" aria-label={`Pair ${round + 1}`}>
          {[left, right].map((brand, index) => <div className="md-card-game__brand-card" key={index}>
            <span className="md-card-game__small-label">{index === 0 ? "First card" : "Second card"}</span>
            <img src={brand.logo} alt="" draggable={false} /><strong>{brand.name}</strong>
          </div>)}
        </div>
        <div className="md-card-game__actions md-card-game__actions--equal">
          <button type="button" className="md-card-game__button" data-card-action="" disabled={!!last || suspended} onClick={() => submit(true)}>Snap! Same brand</button>
          <button type="button" className="md-card-game__button md-card-game__button--secondary" data-card-action="" disabled={!!last || suspended} onClick={() => submit(false)}>Different brands</button>
        </div>
        {last ? <>
          <Result title={last.correct ? "Correct!" : "Not this time"} message={current.match ? `Both cards show ${left.name}. That's a matching pair.` : `${left.name} and ${right.name} are different brands.`} success={last.correct} />
          <div className="md-card-game__actions">
            <button type="button" className="md-card-game__button" data-next-action="" disabled={suspended} onClick={() => { requestFocus(); setSession(value => advanceSnap(value, round)); }}>
              {round === rounds.length - 1 ? "See your result" : "Next pair"} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </> : <p className="md-card-game__hint">Take your time. Choose one answer to reveal the result.</p>}
      </> : <p className="md-card-game__loading" role="status">Preparing your brand cards…</p>}
      <LocalNote />
    </section>
  );
}

export function FullHouse({ suspended = false }: { suspended?: boolean }) {
  const [cards, setCards] = useState<FullHouseCard[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState(
    "Select five cards. The food suits matter; the numbers do not.",
  );
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState<ReturnType<typeof suggestFullHouseCard>>(null);
  const [checks, setChecks] = useState(0);
  const [hints, setHints] = useState(0);
  const { beginRound } = useArcadeRoundTracker(solved ? { game: "full-house", result: "completed", checks, hints } : null, true);
  const { regionRef, requestFocus } = useNextActionFocus(`${solved}-${selected.length}`);
  useEffect(() => setCards(makeFullHousePuzzle()), []);
  const restart = () => {
    if (suspended) return;
    beginRound();
    setHint(null); setChecks(0); setHints(0);
    setCards(makeFullHousePuzzle());
    setSelected([]);
    setSolved(false);
    setMessage("Select five cards. The food suits matter; the numbers do not.");
  };
  const chosen = cards.filter((card) => selected.includes(card.id));
  function selectCard(card: FullHouseCard) {
    if (solved || suspended) return;
    const next = toggleFullHouseSelection(cards, selected, card.id);
    if (next === selected) return;
    setHint(null);
    setSelected(current => toggleFullHouseSelection(cards, current, card.id));
    setMessage("Choose three cards of one food and two of another. Check your hand when five are selected.");
  }
  function showHint() {
    if (solved || suspended) return;
    const next = suggestFullHouseCard(cards, selected);
    setHint(next);
    if (!next) {
      setMessage(isFullHouse(chosen) ? "Your selection already makes a full house. Check your hand." : "No hint is available.");
      return;
    }
    setHints(value => value + 1);
    const card = cards.find(item => item.id === next.cardId)!;
    setMessage(`Hint: ${next.action === "add" ? "select" : "remove"} ${CHAOS_SUIT_NAMES[card.suit]} ${card.rank}. Keep as many of your current cards as possible.`);
  }
  function check() {
    if (suspended || solved || selected.length !== 5) return;
    setChecks(value => value + 1);
    setHint(null);
    if (isFullHouse(chosen)) {
      requestFocus();
      setSolved(true);
      const groups = CHAOS_SUITS.map((suit) => ({
        suit,
        count: chosen.filter((card) => card.suit === suit).length,
      }))
        .filter((group) => group.count > 0)
        .sort((first, second) => second.count - first.count);
      setMessage(
        `You made ${groups.map((group) => `${group.count} ${CHAOS_SUIT_NAMES[group.suit]} cards`).join(" and ")}. That's a full house.`,
      );
    } else
      setMessage(
        "This hand does not make 3 + 2 yet. Remove a selected card to change it, then check again.",
      );
  }
  return (
    <section className="md-card-game" aria-label="Full House" ref={regionRef}>
      <Intro
        title="Full House"
        goal="Pick three cards of one food and two of another to make a five-card feast."
        mode="Solo puzzle · Every deal has a solution"
        onReset={restart}
        resetLabel="New puzzle"
        rules={[
          "Select five cards: three must share one food suit and two must share a different food suit.",
          "The numbers do not matter. For example, three Burger cards and two Cake cards make a full house.",
          "Tap a selected card to remove it. Once you have five, choose Check hand. Every puzzle has a solution.",
          "A hint suggests one selection change towards a valid hand, preserving as many selected cards as possible.",
        ]}
      />
      <Stats
        items={[
          { label: "Cards selected", value: `${selected.length} / 5` },
          { label: "Target grouping", value: "3 + 2" },
          { label: "Checks", value: checks },
          { label: "Hints", value: hints },
        ]}
      />
      <Result
        title={
          solved
            ? "Full house complete!"
            : selected.length === 5
              ? "Ready to check"
              : "Build your hand"
        }
        message={message}
        success={solved}
        complete={solved}
      />
      <ul className="md-card-game__suit-counts" aria-label="Selected cards by food">
        {CHAOS_SUITS.map((suit) => (
          <li key={suit}>
            <FoodIcon food={suit} />
            <span>{CHAOS_SUIT_NAMES[suit]}</span>
            <strong>{chosen.filter((card) => card.suit === suit).length}</strong>
          </li>
        ))}
      </ul>
      {cards.length ? (
        <ul
          className="md-card-game__card-grid md-card-game__card-grid--puzzle"
          aria-label="Choose five food cards"
        >
          {cards.map((card) => {
            const isSelected = selected.includes(card.id);
            return (
              <li key={card.id}>
                <FoodCard
                  card={card}
                  selected={isSelected}
                  hinted={hint?.cardId === card.id}
                  disabled={suspended || solved || (selected.length === 5 && !isSelected)}
                  status={
                    hint?.cardId === card.id ? (hint.action === "remove" ? "Remove this card" : "Select this card") : isSelected ? "Selected" : selected.length === 5 ? "Hand full" : "Select card"
                  }
                  onClick={() => selectCard(card)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="md-card-game__loading" role="status">
          Preparing your puzzle…
        </p>
      )}
      <div className="md-card-game__actions">
        {solved ? (
          <button
            type="button"
            className="md-card-game__button"
            data-next-action=""
            onClick={() => {
              requestFocus();
              restart();
            }}
          >
            New puzzle <Shuffle size={16} aria-hidden="true" />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="md-card-game__button"
              disabled={suspended || selected.length !== 5}
              onClick={check}
            >
              Check hand <CheckCircle2 size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="md-card-game__button md-card-game__button--secondary"
              disabled={suspended || selected.length === 0}
              onClick={() => {
                requestFocus();
                setSelected([]);
                setHint(null);
                setMessage("Selection cleared. Choose your five cards.");
              }}
            >
              Clear selection
            </button>
            <button type="button" className="md-card-game__button md-card-game__button--secondary" disabled={suspended || !cards.length} onClick={showHint}><Lightbulb size={16} aria-hidden="true" /> Suggest a card</button>
          </>
        )}
      </div>
      <LocalNote />
    </section>
  );
}

export function GoDish({ suspended = false }: { suspended?: boolean }) {
  const [state, setState] = useState<GoDishState | null>(null);
  const [difficulty, setDifficulty] = useState<GoDishDifficulty>("classic");
  const [suggested, setSuggested] = useState<GoDishRank | null>(null);
  const difficultyId = useId();
  const { regionRef, requestFocus } = useNextActionFocus(state);
  const { beginRound } = useArcadeRoundTracker(state?.winner ? { game: "go-dish", result: state.winner === "player" ? "win" : state.winner === "chef" ? "loss" : "draw", moves: state.turns, variant: state.difficulty ?? "classic" } : null, true);
  useEffect(() => {
    setState(startGoDish());
  }, []);
  const restart = () => {
    if (suspended) return;
    beginRound();
    setSuggested(null); setState(startGoDish(Math.random, difficulty));
  };
  const rankOptions = state
    ? [...new Set(state.player.map((card) => card.rank))].sort((first, second) => first - second)
    : [];
  return (
    <section className="md-card-game" aria-label="Go Dish!" ref={regionRef}>
      <Intro
        title="Go Dish!"
        goal="Collect four cards with the same number to make a set. Finish with more sets than the chef."
        mode="You vs a local house chef"
        onReset={restart}
        rules={[
          "Ask for a number already in your hand. If the chef has any, you receive all of their cards with that number. Otherwise, you draw a card if any remain.",
          "The chef takes a turn automatically after your request. Four cards with the same number form a completed set and leave your hand.",
          "There are three sets to collect. The round ends when all are collected, no further play is possible, or after 60 turns. The most completed sets wins.",
          "Expert remembers your public request when choosing its reply; it does not inspect your hidden hand. A suggestion uses your own cards and the chef’s previous request.",
        ]}
      />
      <div className="md-card-game__settings">
        <label htmlFor={difficultyId}>House chef difficulty</label>
        <select id={difficultyId} value={difficulty} disabled={suspended} onChange={event => {
          const next = event.target.value as GoDishDifficulty;
          if (!GO_DISH_DIFFICULTIES.includes(next)) return;
          beginRound(); setDifficulty(next); setSuggested(null); setState(startGoDish(Math.random,next));
        }}><option value="relaxed">Relaxed · first rank</option><option value="classic">Classic · biggest group</option><option value="expert">Expert · public request strategy</option></select>
        <p>Changing difficulty starts a new round.</p>
      </div>
      {!state ? (
        <p className="md-card-game__loading" role="status">
          Dealing cards…
        </p>
      ) : (
        <>
          <Stats
            items={[
              { label: "Your sets", value: state.playerSets.length },
              { label: "Chef's sets", value: state.chefSets.length },
              { label: "Turns played", value: `${state.turns} / 60` },
            ]}
          />
          <Result
            title={
              state.winner === "player"
                ? "You collected the most sets!"
                : state.winner === "chef"
                  ? "The house chef wins this round"
                  : state.winner === "draw"
                    ? "The round is a draw"
                    : "Your turn — ask for a number"
            }
            message={
              state.winner
                ? `You completed ${state.playerSets.length} ${state.playerSets.length === 1 ? "set" : "sets"}; the chef completed ${state.chefSets.length}. ${state.turns} turns played.`
                : state.lastMessage
            }
            success={state.winner === "player"}
            complete={state.winner !== null}
          />
          {state.winner && (
            <div className="md-card-game__actions">
              <button
                type="button"
                className="md-card-game__button"
                data-next-action=""
                onClick={() => {
                  requestFocus();
                  restart();
                }}
              >
                Play again <RotateCcw size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <Progress label="Sets collected" value={state.playerSets.length + state.chefSets.length} max={3} />
          <div className="md-card-game__sets" aria-label="Completed sets">
            {([1, 2, 3] as const).map((rank) => (
              <div
                className={
                  state.playerSets.includes(rank)
                    ? "is-yours"
                    : state.chefSets.includes(rank)
                      ? "is-chefs"
                      : ""
                }
                key={rank}
              >
                <strong>{rank}s</strong>
                <span>
                  {state.playerSets.includes(rank)
                    ? "Your set"
                    : state.chefSets.includes(rank)
                      ? "Chef's set"
                      : "Not collected"}
                </span>
              </div>
            ))}
          </div>
          <div className="md-card-game__opponent-row">
            <ChefHat size={24} aria-hidden="true" />
            <div>
              <strong>House chef</strong>
              <span>{state.chef.length} cards in hand</span>
            </div>
            <span>{state.stock.length} in the draw pile</span>
          </div>
          <div className="md-card-game__section-heading">
            <h3>Your hand</h3>
            <span>{state.player.length} cards</span>
          </div>
          {state.player.length ? (
            <ul className="md-card-game__card-grid" aria-label="Your food cards">
              {[...state.player]
                .sort((first, second) => first.rank - second.rank)
                .map((card) => (
                  <li key={card.id}>
                    <FoodCard card={card} />
                  </li>
                ))}
            </ul>
          ) : (
            <p className="md-card-game__empty">
              {state.winner
                ? "No cards left in your hand."
                : state.stock.length > 0
                  ? "Your hand is empty. Draw a card to continue."
                  : "The draw pile is empty. Finish the round to see your result."}
            </p>
          )}
          {!state.winner && (
            <>
              <div className="md-card-game__section-heading">
                <h3>Ask the chef</h3>
                <span>Choose a number in your hand</span>
              </div>
              {state.lastChefRequest != null && <p className="md-card-game__hint">Last public request: chef asked for {state.lastChefRequest}s.</p>}
              {rankOptions.length > 0 && <div className="md-card-game__hand-tools"><button type="button" className="md-card-game__button md-card-game__button--secondary" disabled={suspended} onClick={() => setSuggested(chooseGoDishRank(state.player, "expert", state.lastChefRequest ?? null))}><Lightbulb size={16} aria-hidden="true" /> Suggest a rank</button></div>}
              {suggested !== null && <p className="md-card-game__advice" role="status">Try asking for {suggested}s. This suggestion uses your hand and public requests, not the chef’s hidden cards.</p>}
              <div className="md-card-game__rank-options">
                {rankOptions.map((rank) => (
                  <button
                    className={`md-card-game__rank-button ${suggested === rank ? "is-hinted" : ""}`}
                    key={rank}
                    type="button"
                    data-card-action=""
                    disabled={suspended}
                    onClick={() => {
                      setSuggested(null); requestFocus();
                      setState((current) => (current && current.turns === state.turns ? askGoDish(current, rank) : current));
                    }}
                  >
                    <strong>Ask for {rank}s</strong>
                    <span>
                      {state.player.filter((card) => card.rank === rank).length} in your hand
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                ))}
                {rankOptions.length === 0 && (
                  <button
                    type="button"
                    className="md-card-game__button"
                    data-next-action=""
                    disabled={suspended}
                    onClick={() => {
                      setSuggested(null); requestFocus();
                      setState((current) => (current ? drawGoDishIfEmpty(current) : current));
                    }}
                  >
                    {state.stock.length > 0 ? "Draw a card" : "Finish round"}{" "}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
      <LocalNote />
    </section>
  );
}

export function KitchenStacks({ suspended = false }: { suspended?: boolean }) {
  const [state, setState] = useState<SolitaireState | null>(null);
  const [hintId, setHintId] = useState<string | null>(null);
  const [showReady, setShowReady] = useState(true);
  const [saved, setSaved] = useState<StacksSave | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const { regionRef, requestFocus } = useNextActionFocus(state);
  useEffect(() => {
    setState(startSolitaire());
    function refresh() {
      try {
        const raw = localStorage.getItem(STACKS_SAVE_KEY);
        const next = parseStacksSave(raw);
        setSaved(next);
        if (raw && !next) setSaveMessage("The saved stack puzzle could not be read.");
      } catch { setSaveMessage("Browser storage is unavailable. You can still play."); }
    }
    refresh();
    function sync(event: StorageEvent) { if (event.key === STACKS_SAVE_KEY || event.key === null) refresh(); }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const restart = () => {
    if (suspended) return;
    beginRound();
    setState(startSolitaire());
    setHintId(null);
  };
  const complete = !!state && state.cards.length === 0;
  const { roundId, beginRound } = useArcadeRoundTracker(complete && state ? { game: "solitaire", result: "completed", moves: state.moves, hints: state.hints ?? 0 } : null, true);
  function showHint() {
    if (!state || complete || suspended) return;
    const next = state.cards.find((card) => card.rank === state.progress[card.suit] + 1);
    if (!next) return;
    setHintId(next.id);
    requestFocus(`[data-card-id="${next.id}"]`);
    setState(current => current ? {
      ...current,
      hints: (current.hints ?? 0) + 1,
      message: `Try ${CHAOS_SUIT_NAMES[next.suit]} ${next.rank}. It is the next card for that food stack.`,
    } : current);
  }
  function placeCard(card: FullHouseCard) {
    if (!state || suspended || complete) return;
    if (card.rank === state.progress[card.suit] + 1) requestFocus(showReady ? '[data-card-ready="true"]:not(:disabled)' : '[data-card-action]:not(:disabled)');
    setHintId(null);
    setState(current => {
      if (!current) return current;
      return stackSolitaireCard(current, card.id);
    });
  }
  function saveRound() {
    if (!state || complete || suspended) return;
    const snapshot = createStacksSave(state, showReady, roundId ?? undefined);
    if (!snapshot) { setSaveMessage("This puzzle could not be saved."); return; }
    try {
      localStorage.setItem(STACKS_SAVE_KEY, JSON.stringify(snapshot));
      setSaved(snapshot);
      setSaveMessage("Puzzle saved in this browser. Save again to update the snapshot.");
    } catch { setSaveMessage("Could not save. Your current puzzle is still here."); }
  }
  function loadRound() {
    if (!saved || suspended) return;
    try {
      const current = parseStacksSave(localStorage.getItem(STACKS_SAVE_KEY));
      if (!current || JSON.stringify(current) !== JSON.stringify(saved)) {
        setSaved(current); setSaveMessage("The saved puzzle changed. Check it before loading."); return;
      }
      const restoredId = current.roundId ?? createArcadeRoundId();
      if (!current.roundId) {
        const updated = { ...current, roundId: restoredId };
        localStorage.setItem(STACKS_SAVE_KEY, JSON.stringify(updated));
        setSaved(updated);
      }
      beginRound(restoredId);
      setState({ cards: current.cards, progress: current.progress, moves: current.moves, mistakes: current.mistakes,
        hints: current.hints, message: "Saved puzzle loaded. Choose the next card." });
      setShowReady(current.showReady);
      setHintId(null);
      setSaveMessage("Saved puzzle loaded. The snapshot stays until replaced or cleared.");
    } catch { setSaveMessage("Could not load the saved puzzle."); }
  }
  function clearSave() {
    if (suspended) return;
    try { localStorage.removeItem(STACKS_SAVE_KEY); setSaved(null); setSaveMessage("Saved puzzle cleared."); }
    catch { setSaveMessage("Could not clear the saved puzzle."); }
  }
  return (
    <section className="md-card-game" aria-label="Kitchen Stacks" ref={regionRef}>
      <Intro
        title="Kitchen Stacks"
        goal="Build each food stack in order: 1, 2, 3, then 4. Clear all 16 cards to finish."
        mode="Solo puzzle · No time limit"
        onReset={restart}
        resetLabel="New puzzle"
        rules={[
          "Each food has its own stack. Start with its number 1, then add 2, 3 and 4 in order.",
          "Ready to stack marks the next cards you can place. Trying a later number counts as a mistake and leaves the card in your hand.",
          "Show a move highlights and focuses a card you can use. Every puzzle can be completed; there is no timer.",
          "Hide ready markers for more challenge. Save a snapshot to this browser and load it later; loading replaces the current board.",
        ]}
      />
      {!state ? (
        <p className="md-card-game__loading" role="status">
          Preparing your stacks…
        </p>
      ) : (
        <>
          <Stats
            items={[
              { label: "Cards placed", value: `${16 - state.cards.length} / 16` },
              { label: "Attempts", value: state.moves },
              { label: "Mistakes", value: state.mistakes },
              { label: "Hints", value: state.hints ?? 0 },
            ]}
          />
          <Progress label="Cards stacked" value={16 - state.cards.length} max={16} />
          <Result
            title={complete ? "All four stacks complete!" : "Choose the next number"}
            message={
              complete
                ? `You placed all 16 cards in ${state.moves} attempts with ${state.mistakes} ${state.mistakes === 1 ? "mistake" : "mistakes"}.`
                : state.message
            }
            success={complete}
            complete={complete}
          />
          <div className="md-card-game__hand-tools">
            <button type="button" className="md-card-game__button md-card-game__button--secondary" aria-pressed={showReady} disabled={suspended} onClick={() => { setShowReady(value => !value); setHintId(null); }}>{showReady ? "Hide ready markers" : "Show ready markers"}</button>
            <button type="button" className="md-card-game__button md-card-game__button--secondary" disabled={complete || suspended} onClick={saveRound}>{saved ? "Update saved puzzle" : "Save puzzle"}</button>
          </div>
          {saved && <div className="md-card-game__saved"><div><strong>Saved puzzle</strong><p>{16-saved.cards.length} / 16 cards placed · {saved.moves} attempts</p></div><button type="button" className="md-card-game__button" disabled={suspended} onClick={loadRound}>Load saved puzzle</button><button type="button" className="md-card-game__button md-card-game__button--secondary" disabled={suspended} onClick={clearSave}>Clear save</button><small>Loading replaces the current board. The snapshot stays on this browser until cleared or replaced.</small></div>}
          {saveMessage && <p className="md-card-game__hint" role="status">{saveMessage}</p>}
          <div className="md-card-game__stacks" aria-label="Food stack progress">
            {CHAOS_SUITS.map((suit) => (
              <div className={state.progress[suit] === 4 ? "is-complete" : ""} key={suit}>
                <FoodIcon food={suit} />
                <strong>{CHAOS_SUIT_NAMES[suit]}</strong>
                <span>{state.progress[suit]} / 4 stacked</span>
                <b>
                  {state.progress[suit] === 4 ? "Complete" : `Next: ${state.progress[suit] + 1}`}
                </b>
              </div>
            ))}
          </div>
          {complete ? (
            <div className="md-card-game__actions">
              <button
                type="button"
                className="md-card-game__button"
                data-next-action=""
                onClick={() => {
                  requestFocus('[data-card-ready="true"]:not(:disabled)');
                  restart();
                }}
              >
                New puzzle <Shuffle size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <div className="md-card-game__section-heading">
                <h3>Cards to stack</h3>
                <button
                  type="button"
                  className="md-card-game__button md-card-game__button--secondary"
                  disabled={suspended}
                  onClick={showHint}
                >
                  <Lightbulb size={16} aria-hidden="true" /> Show a move
                </button>
              </div>
              <ul
                className="md-card-game__card-grid md-card-game__card-grid--stacks"
                aria-label="Cards to stack"
              >
                {state.cards.map((card) => {
                  const ready = card.rank === state.progress[card.suit] + 1;
                  return (
                    <li key={card.id}>
                      <FoodCard
                        card={card}
                        ready={showReady && ready}
                        disabled={suspended}
                        hinted={hintId === card.id}
                        status={
                          hintId === card.id
                            ? "Try this card"
                            : !showReady ? "Choose card" : ready
                              ? "Ready to stack"
                              : `Needs ${state.progress[card.suit] + 1} first`
                        }
                        onClick={() => placeCard(card)}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
      <p className="md-card-game__local-note">Your unfinished board resets on leaving unless you save a snapshot. Saved puzzles are local to this browser.</p>
    </section>
  );
}
