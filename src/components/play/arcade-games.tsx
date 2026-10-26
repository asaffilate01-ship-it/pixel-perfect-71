import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChefHat, Lightbulb, RotateCcw, Trophy, Undo2 } from "lucide-react";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import {
  chooseFourMove, dailySeed, dropFour, fourResult, mergeOver, moveMerge,
  puzzleMoves, puzzleSolved, seededRandom, sequencePrefix, slidePuzzle, startMerge, startPuzzle,
  type Direction, type FourBoard, type MergeState,
} from "@/lib/arcade-games";

const FOODS = [
  { art: "burger", name: "Burger" }, { art: "chicken", name: "Chicken" },
  { art: "french-taco", name: "French taco" }, { art: "cake", name: "Cake" },
] as const;
function Frame({ title, tag, rules, restart, children }: { title: string; tag: string; rules: string; restart: () => void; children: ReactNode }) {
  return <section className="dp-game-panel dp2-game-panel arcade-panel" aria-label={title}>
    <header className="dp-game-head"><div><p className="arcade-kicker"><ChefHat size={15} /> {tag}</p><h2>{title}</h2></div>
      <button type="button" className="dp-small-button" onClick={restart}><RotateCcw size={16} /> New game</button></header>
    <p className="arcade-rules">{rules}</p>{children}
    <p className="dp-fineprint">Free, account-free entertainment. Scores stay on this device and never earn money, food, discounts or loyalty points.</p>
  </section>;
}
function Status({ children }: { children: ReactNode }) {
  return <p role="status" className="arcade-status">{children}</p>;
}
function Food({ index }: { index: number }) {
  const food = FOODS[index % FOODS.length]!;
  return <img src={gameFoodArtwork[food.art]} alt="" draggable={false} />;
}
function useBest(key: string, score: number) {
  const [best, setBest] = useState(0);
  useEffect(() => {
    let saved = 0;
    try { const value = Number(localStorage.getItem(`mealdeck-play-${key}`)); saved = Number.isFinite(value) && value >= 0 ? value : 0; } catch { /* Device storage is optional. */ }
    const next = Math.max(saved, score); setBest(current => Math.max(current, next));
    try { localStorage.setItem(`mealdeck-play-${key}`, String(next)); } catch { /* The game remains playable. */ }
  }, [key, score]);
  return best;
}

export function Feast2048() {
  const [state, setState] = useState<MergeState | null>(null);
  const [previous, setPrevious] = useState<MergeState | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const best = useBest("2048", state?.score ?? 0);
  useEffect(() => { setState(startMerge()); }, []);
  const restart = () => { setState(startMerge()); setPrevious(null); };
  const over = state ? mergeOver(state.board) : false;
  const won = state ? state.board.some(tile => tile >= 2048) : false;
  function move(direction: Direction) {
    if (!state || over) return;
    const next = moveMerge(state, direction);
    if (next !== state) { setPrevious(state); setState(next); }
  }
  const arrows = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const;
  return <Frame title="Feast 2048" tag="MERGE · STRATEGY" restart={restart} rules="Slide the entire board. Equal numbers merge once per move. Build a 2048 feast — then keep going. Swipe the board, use the arrow buttons, or focus the board and use your keyboard.">
    <div className="dp2-stat"><span>SCORE <strong>{state?.score ?? 0}</strong></span><span>DEVICE BEST <strong>{best}</strong></span><span>MOVES <strong>{state?.moves ?? 0}</strong></span></div>
    <div className="arcade-merge" tabIndex={0} role="group" aria-label="2048 board. Swipe or use arrow keys to slide tiles"
      onPointerDown={event => { pointerStart.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerCancel={() => { pointerStart.current = null; }}
      onPointerUp={event => { const start = pointerStart.current; pointerStart.current = null; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return; move(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up"); }} onKeyDown={event => {
      if (event.key in arrows) { event.preventDefault(); move(arrows[event.key as keyof typeof arrows]); }
    }}>
      {(state?.board ?? Array<number>(16).fill(0)).map((value, index) => <div key={index} className={`arcade-tile ${value ? "is-filled" : ""}`} style={{ "--tile-level": value ? Math.min(Math.log2(value), 11) : 0 } as CSSProperties}>
        {value > 0 && <><Food index={Math.log2(value) - 1} /><strong>{value}</strong></>}
      </div>)}
    </div>
    <div className="arcade-controls" role="group" aria-label="Slide direction">
      {([ ["left", ArrowLeft], ["up", ArrowUp], ["down", ArrowDown], ["right", ArrowRight] ] as const).map(([direction, Icon]) =>
        <button key={direction} type="button" aria-label={`Slide ${direction}`} disabled={!state || over} onClick={() => move(direction)}><Icon /></button>)}
      <button type="button" aria-label="Undo last move" disabled={!previous} onClick={() => { if (previous) { setState(previous); setPrevious(null); } }}><Undo2 /></button>
    </div>
    <Status>{over ? "No moves left. Start a new feast or undo your last move." : won ? "2048 reached! Keep merging to beat your best." : "Plan ahead: leave space for the next tile."}</Status>
  </Frame>;
}

export function FourToFeast() {
  const [board, setBoard] = useState<FourBoard>(Array<0>(42).fill(0));
  const [history, setHistory] = useState<FourBoard[]>([]);
  const [mode, setMode] = useState<"chef" | "local">("chef");
  const [depth, setDepth] = useState<1 | 3 | 4>(3);
  const firstCount = board.filter(value => value === 1).length;
  const secondCount = board.filter(value => value === 2).length;
  const player = firstCount === secondCount ? 1 : 2;
  const result = fourResult(board);
  const thinking = mode === "chef" && player === 2 && result === null;
  const restart = () => { setBoard(Array<0>(42).fill(0)); setHistory([]); };
  useEffect(() => {
    if (!thinking) return;
    const timer = setTimeout(() => {
      const column = chooseFourMove(board, depth);
      if (column !== null) { const next = dropFour(board, column, 2); if (next) setBoard(next); }
    }, 350);
    return () => clearTimeout(timer);
  }, [board, depth, thinking]);
  function play(column: number) {
    if (thinking || result !== null) return;
    const next = dropFour(board, column, player);
    if (next) { setHistory([...history, board]); setBoard(next); }
  }
  return <Frame title="Four to Feast" tag="TACTICS · COMPUTER OR TWO PLAYERS" restart={restart} rules="Drop a counter into a column. Connect four burgers or cakes horizontally, vertically or diagonally. Play the house chef, or pass this device between two players.">
    <div className="arcade-options"><label>Opponent <select value={mode} onChange={e => { setMode(e.target.value as "chef" | "local"); restart(); }}><option value="chef">House chef</option><option value="local">Two players</option></select></label>
      {mode === "chef" && <label>Difficulty <select value={depth} onChange={e => { setDepth(Number(e.target.value) as 1 | 3 | 4); restart(); }}><option value={1}>Commis</option><option value={3}>Sous chef</option><option value={4}>Head chef</option></select></label>}
      <button type="button" className="dp-small-button" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (previous) { setBoard(previous); setHistory(history.slice(0, -1)); } }}><Undo2 size={16} /> Undo turn</button>
    </div>
    <Status>{result === "draw" ? "A full-board draw! Try another round." : result === 1 ? "Burgers win — four in a row!" : result === 2 ? `${mode === "chef" ? "House chef" : "Cakes"} wins — four in a row!` : thinking ? "House chef is planning a move…" : `${player === 1 ? "Burgers" : "Cakes"}: choose a column.`}</Status>
    <div className="arcade-four-drops" role="group" aria-label="Choose a column">{Array.from({ length: 7 }, (_, column) =>
      <button key={column} type="button" aria-label={`Drop into column ${column + 1}`} disabled={thinking || result !== null || board[column] !== 0} onClick={() => play(column)}><ArrowDown size={18} /><span>{column + 1}</span></button>)}</div>
    <div className="arcade-four-board" role="img" aria-label={board.map((value, i) => `Row ${Math.floor(i / 7) + 1} column ${i % 7 + 1}: ${value === 1 ? "burger" : value === 2 ? "cake" : "empty"}`).join("; ")}>
      {board.map((value, index) => <div key={index} className={`arcade-counter player-${value}`}>{value !== 0 && <Food index={value === 1 ? 0 : 3} />}</div>)}
    </div>
    <p className="dp-fineprint">Burger goes first. The computer searches legal moves locally; no external AI service is needed.</p>
  </Frame>;
}

export function OrderEcho() {
  const [target, setTarget] = useState(6);
  const [sequence, setSequence] = useState<number[]>([]);
  const [entered, setEntered] = useState<number[]>([]);
  const [phase, setPhase] = useState<"ready" | "show" | "input" | "over" | "won">("ready");
  const [tick, setTick] = useState(-1);
  const [cleared, setCleared] = useState(0);
  const best = useBest("echo", cleared);
  const restart = () => { setSequence([]); setEntered([]); setTick(-1); setCleared(0); setPhase("ready"); };
  function start() { setCleared(0); setSequence([Math.floor(Math.random() * 4)]); setEntered([]); setTick(-1); setPhase("show"); }
  useEffect(() => {
    if (phase !== "show") return;
    const timer = setTimeout(() => {
      if (tick >= sequence.length * 2 - 1) { setTick(-1); setPhase("input"); }
      else setTick(tick + 1);
    }, tick % 2 === 0 ? 650 : 250);
    return () => clearTimeout(timer);
  }, [phase, sequence.length, tick]);
  const active = phase === "show" && tick >= 0 && tick % 2 === 0 ? sequence[Math.floor(tick / 2)] : undefined;
  function answer(index: number) {
    if (phase !== "input") return;
    const next = [...entered, index]; setEntered(next);
    if (!sequencePrefix(sequence, next)) { setPhase("over"); return; }
    if (next.length === sequence.length) {
      setCleared(sequence.length);
      if (sequence.length === target) setPhase("won");
      else { setSequence([...sequence, Math.floor(Math.random() * 4)]); setEntered([]); setTick(-1); setPhase("show"); }
    }
  }
  return <Frame title="Order Echo" tag="MEMORY · BUILD YOUR STREAK" restart={restart} rules="Watch the kitchen's order sequence, then repeat it in the same order. Each successful round adds one dish. Follow the highlighted food and the spoken-by-screen-reader step labels; no sound is required.">
    <div className="arcade-options"><label>Challenge <select value={target} onChange={e => { setTarget(Number(e.target.value)); restart(); }}><option value={6}>6 dishes · Taster</option><option value={10}>10 dishes · Chef</option><option value={14}>14 dishes · Master</option></select></label></div>
    <div className="dp2-stat"><span>CLEARED <strong>{cleared} / {target}</strong></span><span>DEVICE BEST <strong>{best}</strong></span><span>YOUR INPUT <strong>{entered.length} / {sequence.length}</strong></span></div>
    <Status>{phase === "ready" ? "Ready? Watch first, then repeat." : phase === "show" ? active === undefined ? "Watch the sequence…" : `Step ${Math.floor(tick / 2) + 1}: ${FOODS[active]!.name}` : phase === "input" ? "Your turn. Repeat the order." : phase === "won" ? "Perfect service! You completed the whole sequence." : "Order mixed up! Start again to beat your streak."}</Status>
    <div className="arcade-echo">{FOODS.map((food, index) => <button key={food.art} type="button" className={active === index ? "is-lit" : ""} disabled={phase !== "input"} onClick={() => answer(index)}><Food index={index} /><strong>{food.name}</strong>{active === index && <span>WATCH</span>}</button>)}</div>
    <div className="arcade-options">{["ready", "over", "won"].includes(phase) && <button type="button" className="dp-main-button" onClick={start}>{phase === "ready" ? "Start challenge" : "Try again"} <ArrowRight size={16} /></button>}
      {phase === "input" && <button type="button" className="dp-small-button" onClick={() => { setEntered([]); setTick(-1); setPhase("show"); }}>Replay sequence</button>}
      {phase === "over" && <p>The order was: {sequence.map(i => FOODS[i]!.name).join(" → ")}</p>}</div>
  </Frame>;
}

export function KitchenShuffle() {
  const [size, setSize] = useState<3 | 4>(3);
  const [board, setBoard] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [history, setHistory] = useState<number[][]>([]);
  const [hint, setHint] = useState(false);
  const [daily, setDaily] = useState(false);
  const [date, setDate] = useState(0);
  useEffect(() => { setBoard(startPuzzle(3)); setDate(dailySeed()); }, []);
  function restart(nextSize: 3 | 4 = size, dailyMode = daily) {
    const seed = dailySeed(); setDate(seed);
    setBoard(startPuzzle(nextSize, dailyMode ? seededRandom(seed + nextSize) : Math.random)); setMoves(0); setHistory([]); setHint(false);
  }
  const won = board.length > 0 && puzzleSolved(board);
  const legal = board.length ? puzzleMoves(board, size) : [];
  function move(index: number) {
    if (won || !legal.includes(index)) return;
    setHistory([...history, board]); setBoard(slidePuzzle(board, index, size)); setMoves(moves + 1); setHint(false);
  }
  return <Frame title="Kitchen Shuffle" tag="PUZZLE · DAILY CHALLENGE" restart={() => restart()} rules="Slide a tile next to the empty space. Arrange numbers from left to right, top to bottom, with the empty space last. Every puzzle starts from legal moves, so it can always be solved.">
    <div className="arcade-options"><label>Board <select value={size} onChange={e => { const next = Number(e.target.value) as 3 | 4; setSize(next); restart(next); }}><option value={3}>3 × 3 · Classic</option><option value={4}>4 × 4 · Expert</option></select></label>
      <label>Challenge <select value={daily ? "daily" : "random"} onChange={e => { const next = e.target.value === "daily"; setDaily(next); restart(size, next); }}><option value="random">Fresh puzzle</option><option value="daily">Daily puzzle (UTC)</option></select></label>
    </div>
    <div className="dp2-stat"><span>MOVES <strong>{moves}</strong></span><span>MODE <strong>{daily ? `Daily #${date}` : "Free play"}</strong></span></div>
    <div className="arcade-shuffle" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }} tabIndex={0} role="group" aria-label="Sliding kitchen puzzle. Arrow keys move the empty space" onKeyDown={event => {
      const blank = board.indexOf(0);
      const index = event.key === "ArrowLeft" ? blank - 1 : event.key === "ArrowRight" ? blank + 1 : event.key === "ArrowUp" ? blank - size : event.key === "ArrowDown" ? blank + size : -1;
      if (event.key.startsWith("Arrow")) { event.preventDefault(); move(index); }
    }}>
      {board.map((value, index) => <button key={index} type="button" className={`${value ? "" : "is-blank"} ${hint && legal.includes(index) ? "is-hint" : ""}`} disabled={!value || won} aria-label={value ? `Tile ${value}, ${legal.includes(index) ? "can slide" : "not next to the space"}` : "Empty space"} onClick={() => move(index)}>{value > 0 && <><Food index={value - 1} /><strong>{value}</strong></>}</button>)}
    </div>
    <div className="arcade-options"><button type="button" className="dp-small-button" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (previous) { setBoard(previous); setHistory(history.slice(0, -1)); setMoves(Math.max(0, moves - 1)); setHint(false); } }}><Undo2 size={16} /> Undo</button>
      <button type="button" className="dp-small-button" disabled={won || !board.length} onClick={() => setHint(!hint)}><Lightbulb size={16} /> Show movable tiles</button></div>
    <Status>{won ? <><Trophy size={20} /> Kitchen sorted in {moves} moves! Try another puzzle.</> : hint ? "Outlined tiles can slide into the empty space. The goal is numerical order." : "Think several moves ahead. Undo is available if you get stuck."}</Status>
  </Frame>;
}
