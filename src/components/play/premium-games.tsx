import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, ChefHat, RotateCcw, Shuffle, Sparkles, Trophy } from "lucide-react";
import { suitArtwork } from "@/lib/food-suit-artwork";
import { marketingBrands, cafe1Brand } from "@/lib/marketing-brands";
import cardBack from "@/assets/mealdeck-card-back.png";
import {
  CHAOS_SUITS, CHAOS_COLOURS, CHAOS_SUIT_NAMES, canPlayChaos, drawChaos,
  playChaos, startChaos, type ChaosCard, type ChaosState, type FoodSuit,
} from "@/lib/kitchen-chaos";
import {
  askGoDish, createBrandSnapRounds, drawGoDishIfEmpty, evaluateSnap, isFullHouse,
  makeFullHousePuzzle, stackSolitaireCard, startGoDish, startSolitaire,
  type BrandSnapRound, type FullHouseCard, type GoDishRank, type GoDishState,
  type SolitaireState,
} from "@/lib/mealdeck-collection-games";

const brands = [...marketingBrands, cafe1Brand];
const brandMap = Object.fromEntries(brands.map(brand => [brand.id, brand])) as Record<string, (typeof brands)[number]>;

function Intro({ title, instructions, onReset }: { title: string; instructions: string; onReset: () => void }) {
  return (
    <header className="dp-game-head dp2-game-head">
      <div><div className="dp2-kicker"><ChefHat size={15} /> MEALDECK ARCADE</div><h2>{title}</h2><p>{instructions}</p></div>
      <button type="button" className="dp-small-button" onClick={onReset}><RotateCcw size={16} /> New round</button>
    </header>
  );
}
function Note({ children }: { children: ReactNode }) {
  return <p className="dp-fineprint dp2-safe"><CheckCircle2 size={14} /> {children}</p>;
}
function Result({ message, success = false }: { message: string; success?: boolean }) {
  return <p aria-live="polite" role="status" className={`dp2-result ${success ? "is-success" : ""}`}>{success ? <Trophy size={19}/> : <Sparkles size={18} />}{message}</p>;
}
function FoodIcon({ food, className }: { food: FoodSuit; className?: string }) {
  return <img src={suitArtwork[food]} className={className || "dp2-icon"} alt="" draggable={false}/>;
}
function FoodCard({ card, label, disabled, onClick }: { card: FullHouseCard; label?: string; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={label?.startsWith("Selected") ? true : undefined} className="dp2-food-card" style={{ "--food-color": CHAOS_COLOURS[card.suit] } as CSSProperties}
    aria-label={label || `${CHAOS_SUIT_NAMES[card.suit]} ${card.rank}`}>
    <span className="dp2-food-rank">{card.rank}<FoodIcon food={card.suit}/></span>
    <FoodIcon food={card.suit} className="dp2-food-big"/>
    <span className="dp2-food-caption">{CHAOS_SUIT_NAMES[card.suit]}</span>
  </button>;
}

function ChaosPlayingCard({ card, playable, onClick }: { card: ChaosCard; playable: boolean; onClick: () => void }) {
  const colour = card.suit === "wild" ? "#242027" : CHAOS_COLOURS[card.suit];
  const description = card.action === "rush" ? "Rush +2" : card.action === "pause" ? "Prep Delay" :
    card.action === "chef-choice" ? "Chef's Choice" : String(card.value);
  return <button type="button" className={`dp2-chaos-card ${playable ? "can-play" : ""}`}
    disabled={!playable} onClick={onClick} aria-label={`Play ${card.suit === "wild" ? "wild" : CHAOS_SUIT_NAMES[card.suit]} ${description}`}
    style={{ "--food-color": colour } as CSSProperties}>
    <span className="dp2-chaos-number">{card.action === "number" ? card.value : card.action === "chef-choice" ? "★" : card.action === "rush" ? "+2" : "↺"}</span>
    {card.suit !== "wild" ? <FoodIcon food={card.suit} className="dp2-chaos-symbol"/> : <ChefHat size={42}/>}
    <small>{description}</small>
    <span className="dp2-chaos-corner">{card.suit === "wild" ? "ANY" : CHAOS_SUIT_NAMES[card.suit]}</span>
  </button>;
}

export function KitchenChaos() {
  const [state, setState] = useState<ChaosState | null>(null);
  const [choice, setChoice] = useState<FoodSuit>("burger");
  useEffect(() => { setState(startChaos()); }, []);
  const restart = () => { setState(startChaos()); setChoice("burger"); };
  const top = state?.played[state.played.length - 1];
  return <section className="dp-game-panel dp2-game-panel">
    <Intro title="Kitchen Chaos" instructions="An original colour-and-food matching game. Empty your hand before the house chef." onReset={restart}/>
    {!state || !top ? <p>Preparing your cards…</p> : <>
      <div className="dp2-stat"><span>YOUR HAND <strong>{state.player.length}</strong></span><span>HOUSE CHEF <strong>{state.chef.length}</strong></span><span>STOCK <strong>{state.stock.length}</strong></span></div>
      <div className="dp2-chaos-stage">
        <div className="dp2-chef-hand"><ChefHat size={22}/><span>House chef</span><div className="dp2-mini-backs">
          {Array.from({length:Math.min(3,state.chef.length)},(_,i)=><img key={i} src={cardBack} alt="" />)}
        </div></div>
        <div className="dp2-chaos-centre">
          <div className="dp2-active" style={{ "--food-color": CHAOS_COLOURS[state.activeSuit] } as CSSProperties}>
            <FoodIcon food={state.activeSuit}/><span>ACTIVE: {CHAOS_SUIT_NAMES[state.activeSuit]}</span>
          </div>
          <ChaosPlayingCard card={top} playable={false} onClick={()=>{}}/>
          <button type="button" className="dp-small-button" disabled={state.winner !== null} onClick={()=>setState(s=>s?drawChaos(s):null)}>Draw a card <ArrowRight size={15}/></button>
        </div>
      </div>
      <div className="dp2-choice"><label htmlFor="dp2-wild-suit">Chef's Choice colour</label>
        <select id="dp2-wild-suit" value={choice} disabled={state.winner!==null} onChange={e=>setChoice(e.target.value as FoodSuit)}>
          {CHAOS_SUITS.map(suit=><option value={suit} key={suit}>{CHAOS_SUIT_NAMES[suit]}</option>)}
        </select><p>Match the colour or number; Rush adds two cards to the house chef, Prep Delay grants another turn.</p>
      </div>
      <h3 className="dp2-subhead">Your cards</h3>
      <div className="dp2-chaos-hand">
        {state.player.map(card=><ChaosPlayingCard key={card.id} card={card} playable={canPlayChaos(card,state)} onClick={()=>setState(s=>s?playChaos(s,card.id,choice):null)}/>)}
      </div>
      <Result message={state.message} success={state.winner==="player"}/>
      {state.winner && <button type="button" className="dp-main-button dp2-replay" onClick={restart}>Play another round <Shuffle size={16}/></button>}
    </>}
    <Note>No bets, purchases, food rewards or loyalty points are connected to gameplay.</Note>
  </section>;
}

export function BrandSnap() {
  const [rounds,setRounds] = useState<BrandSnapRound[]>([]);
  const [round,setRound] = useState(0);
  const [correct,setCorrect] = useState(0);
  const [last,setLast] = useState<{correct:boolean;message:string}|null>(null);
  const restart=()=>{setRounds(createBrandSnapRounds(brands.map(b=>b.id)));setRound(0);setCorrect(0);setLast(null);};
  useEffect(()=>{setRounds(createBrandSnapRounds(brands.map(b=>b.id)));},[]);
  const current=rounds[round];
  const finished=rounds.length>0 && round>=rounds.length;
  const left=current ? brandMap[current.left] : undefined;
  const right=current ? brandMap[current.right] : undefined;
  function submit(snap:boolean){
    if(!current||last)return;
    const result=evaluateSnap(current,snap);
    if(result)setCorrect(s=>s+1);
    setLast({correct:result,message:result?"Correct! You spotted the logos.":"Not quite — look for the same brand on both cards."});
  }
  return <section className="dp-game-panel dp2-game-panel">
    <Intro title="MealDeck Brand Snap" instructions="Spot matching official brand logos. Tap Snap for a pair or Different for two distinct brands." onReset={restart}/>
    <div className="dp2-stat"><span>ROUND <strong>{Math.min(round+1,rounds.length)} / {rounds.length || 12}</strong></span><span>ACCURACY <strong>{correct} correct</strong></span></div>
    {finished ? <>
      <div className="dp2-finish"><Trophy size={42}/><h3>Kitchen sharp!</h3><p>You recognised {correct} of {rounds.length} brand pairs.</p></div>
      <button className="dp-main-button" onClick={restart}>Play again <RotateCcw size={16}/></button>
    </> : left && right ? <>
      <div className="dp2-snap-board">
        {[left,right].map((brand,i)=><div className="dp2-brand-card" key={i}>
          <span className="dp2-brand-card-top">MEALDECK BRAND COLLECTION</span>
          <img src={brand.logo} alt={brand.name} loading="lazy" draggable={false}/>
          <strong>{brand.name}</strong>
        </div>)}
      </div>
      <div className="dp2-snap-actions">
        <button type="button" className="dp-main-button" disabled={!!last} onClick={()=>submit(true)}>SNAP! Same brand</button>
        <button type="button" className="dp-small-button" disabled={!!last} onClick={()=>submit(false)}>Different brands</button>
      </div>
      {last && <><Result message={last.message} success={last.correct}/>
        <button type="button" className="dp-main-button dp2-next" onClick={()=>{setRound(r=>r+1);setLast(null);}}>Next pair <ArrowRight size={16}/></button></>}
    </> : <p>Preparing your brand cards…</p>}
    <Note>Uses the original brand logo files already referenced by the MealDeck storefront; no generated substitute logos.</Note>
  </section>;
}

export function FullHouse() {
  const [cards,setCards]=useState<FullHouseCard[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [message,setMessage]=useState("Select five food cards: three of one food suit and two of another.");
  const [solved,setSolved]=useState(false);
  useEffect(()=>setCards(makeFullHousePuzzle()),[]);
  const restart=()=>{setCards(makeFullHousePuzzle());setSelected([]);setSolved(false);setMessage("Make a full house with three of one food and two of another.");};
  function check(){
    const chosen=cards.filter(c=>selected.includes(c.id));
    if(isFullHouse(chosen)){setSolved(true);setMessage("Full House! Your five-card feast is complete.");}
    else setMessage("Almost! The five cards must form exactly three of one suit and two of another.");
  }
  return <section className="dp-game-panel dp2-game-panel">
    <Intro title="Full House" instructions="A guaranteed-solvable sorting puzzle, not a prize draw. Find the 3+2 food-suit combination." onReset={restart}/>
    <div className="dp2-stat"><span>SELECTED <strong>{selected.length} / 5</strong></span><span>GOAL <strong>3 + 2</strong></span></div>
    <div className="dp2-full-grid">{cards.map(card=>
      <div className={`dp2-full-cell ${selected.includes(card.id)?"is-selected":""}`} key={card.id}>
        <FoodCard card={card} label={`${selected.includes(card.id) ? "Selected: " : ""}${CHAOS_SUIT_NAMES[card.suit]} ${card.rank}`} disabled={solved} onClick={()=>{
          setSelected(s=>s.includes(card.id)?s.filter(id=>id!==card.id):s.length<5?[...s,card.id]:s);
          setMessage("Build a hand with three cards of one food and two of another.");
        }}/>
      </div>)}</div>
    <div className="dp2-snap-actions">
      <button type="button" className="dp-main-button" disabled={selected.length!==5||solved} onClick={check}>Check Full House <CheckCircle2 size={16}/></button>
      <button type="button" className="dp-small-button" onClick={()=>{setSelected([]);setSolved(false);setMessage("Choose your five cards.");}}>Clear selection</button>
    </div>
    <Result message={message} success={solved}/>
    {solved && <button type="button" className="dp-small-button" onClick={restart}>New puzzle <RotateCcw size={15}/></button>}
    <Note>Cards are shuffled for a fun puzzle; completing a hand never awards redeemable points or food.</Note>
  </section>;
}

export function GoDish() {
  const [state,setState]=useState<GoDishState|null>(null);
  useEffect(()=>{setState(startGoDish());},[]);
  const restart=()=>setState(startGoDish());
  const rankOptions=state ? [...new Set(state.player.map(c=>c.rank))].sort() : [];
  return <section className="dp-game-panel dp2-game-panel">
    <Intro title="Go Dish!" instructions="Ask the house chef for a number in your hand and collect four matching ranks from different food suits." onReset={restart}/>
    {!state ? <p>Dealing cards…</p>:<>
      <div className="dp2-stat"><span>YOUR SETS <strong>{state.playerSets.length}</strong></span><span>HOUSE CHEF <strong>{state.chefSets.length}</strong></span><span>DRAW PILE <strong>{state.stock.length}</strong></span></div>
      <div className="dp2-dish-chef"><ChefHat size={32}/><div><strong>House Chef</strong><span>{state.chef.length} cards in hand</span></div><img src={cardBack} alt="Hidden house-chef cards" /></div>
      <h3 className="dp2-subhead">Your food cards</h3>
      <div className="dp2-go-hand">{state.player.map(card=><FoodCard key={card.id} card={card} disabled={true}/>)}</div>
      <p className="dp-fineprint">Your collected ranks: {state.playerSets.join(", ") || "None yet"} · Chef: {state.chefSets.join(", ") || "None yet"} · Turn {state.turns} / 60</p>
      <h3 className="dp2-subhead">Ask for a number</h3>
      <div className="dp2-rank-ask">{rankOptions.map(rank=><button className="dp-main-button" key={rank} type="button" disabled={state.winner!==null}
        onClick={()=>setState(s=>s?askGoDish(s,rank as GoDishRank):null)}>Got any {rank}s?</button>)}
        {rankOptions.length===0&&state.winner===null&&<button className="dp-small-button" onClick={()=>setState(s=>s?drawGoDishIfEmpty(s):null)}>Draw a card</button>}
      </div>
      <Result message={state.winner ? `${state.winner === "draw" ? "Draw" : state.winner === "player" ? "You win!" : "House chef wins."} You made ${state.playerSets.length} set(s), house chef made ${state.chefSets.length}.` : state.lastMessage} success={state.winner==="player"}/>
      {state.winner && <button className="dp-small-button" onClick={restart}>Play another round <RotateCcw size={16}/></button>}
    </>}
    <Note>The chef is a local automated opponent. No money, prizes or loyalty points are at stake.</Note>
  </section>;
}

export function KitchenStacks() {
  const [state,setState]=useState<SolitaireState|null>(null);
  useEffect(()=>{setState(startSolitaire());},[]);
  const restart=()=>setState(startSolitaire());
  const complete=!!state && state.cards.length===0;
  return <section className="dp-game-panel dp2-game-panel">
    <Intro title="Kitchen Stacks" instructions="Build four food-suit stacks from 1 up to 4. All cards are visible. Use Hint if you need the next move." onReset={restart}/>
    {!state ? <p>Preparing your stack…</p>:<>
      <div className="dp2-stat"><span>PLACED <strong>{16-state.cards.length} / 16</strong></span><span>ATTEMPTS <strong>{state.moves}</strong></span><span>MISTAKES <strong>{state.mistakes}</strong></span></div>
      <div className="dp2-stacks">{CHAOS_SUITS.map(suit=><div key={suit}>
        <FoodIcon food={suit}/><small>{CHAOS_SUIT_NAMES[suit]}</small><b>{state.progress[suit]} / 4</b>
      </div>)}</div>
      <button type="button" className="dp-small-button" disabled={complete} onClick={() => setState(s => { if (!s) return s; const next = s.cards.find(c => c.rank === s.progress[c.suit] + 1); return next ? { ...s, message: `Hint: choose ${CHAOS_SUIT_NAMES[next.suit]} ${next.rank}.` } : s; })}>Hint</button>
      <h3 className="dp2-subhead">Cards to stack</h3>
      <div className="dp2-full-grid">{state.cards.map(card=><FoodCard key={card.id} card={card}
        onClick={()=>setState(s=>s?stackSolitaireCard(s,card.id):null)} disabled={complete}/>)}</div>
      <Result message={complete?"All four kitchens are complete. Excellent sorting!":state.message} success={complete}/>
      {complete && <button className="dp-small-button" onClick={restart}>Shuffle again <Shuffle size={16}/></button>}
    </>}
    <Note>A free, always-solvable solitaire puzzle — no money, gambling or valuable prizes.</Note>
  </section>;
}
