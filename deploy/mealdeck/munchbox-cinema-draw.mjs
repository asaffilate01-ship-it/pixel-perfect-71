/** Owner-only offline reconciliation and random draw. Never imported by public UI. */
import { createHash, randomInt } from "node:crypto";
export const CAMPAIGN = "munchbox-cinema-20261203";
export const ENTRY_START = Date.parse("2026-12-03T00:00:00Z");
export const ENTRY_END = Date.parse("2026-12-07T00:00:00Z");
export const SCREENING = Date.parse("2026-12-16T19:20:00Z");
export const RESPONSE_WINDOW = 24 * 60 * 60 * 1000;
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validTime = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction) => "." + (fraction ?? "").padEnd(3, "0") + "Z");
  return new Date(parsed).toISOString() === canonical;
};
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Accept only the reviewed owner export. This is validation, not database authentication. */
export function validateCinemaSnapshot(input, now = Date.now()) {
  if (!input || input.version !== 1 || input.campaign !== CAMPAIGN || input.ready !== true ||
      !uuid(input.installationId) || !uuid(input.locationId) ||
      !validTime(input.snapshotAt) || Date.parse(input.snapshotAt)<ENTRY_END || Date.parse(input.snapshotAt)>now ||
      !Array.isArray(input.eligibleSkus) || input.eligibleSkus.length<1 || input.eligibleSkus.length>100 ||
      input.eligibleSkus.some(s=>typeof s!=="string"||!s.trim()||s.length>160) ||
      new Set(input.eligibleSkus).size!==input.eligibleSkus.length ||
      !Array.isArray(input.entrants) || input.entrants.length>100000) throw Error("Invalid or unready reviewed snapshot");
  const members=new Set(), orders=new Set();
  const entrants=input.entrants.map(entry=>{
    if (!entry || !uuid(entry.memberId) || members.has(entry.memberId.toLowerCase()) ||
        !Array.isArray(entry.orderIds) || !entry.orderIds.length || entry.orderIds.length>10000)
      throw Error("Invalid or duplicate member");
    const memberId=entry.memberId.toLowerCase();members.add(memberId);
    const orderIds=entry.orderIds.map(id=>{
      if (!uuid(id) || orders.has(id.toLowerCase())) throw Error("Invalid or duplicate qualifying order");
      const normal=id.toLowerCase();orders.add(normal);return normal;
    }).sort();
    return {memberId,orderIds};
  }).sort((a,b)=>a.memberId.localeCompare(b.memberId));
  return {version:1,campaign:CAMPAIGN,ready:true,snapshotAt:input.snapshotAt,
    installationId:input.installationId.toLowerCase(),locationId:input.locationId.toLowerCase(),
    eligibleSkus:[...input.eligibleSkus].sort(),entrants};
}
/** Uniform Fisher–Yates ranking; one member per place. Keep the original ranking for replacements. */
export function createCinemaDraw(input, now=Date.now(), randomIndex=randomInt) {
  if (!Number.isFinite(now) || now<ENTRY_END || now>=SCREENING) throw Error("Draw is outside the review window");
  const snapshot=validateCinemaSnapshot(input,now);
  if (!snapshot.entrants.length) throw Error("No eligible members");
  const ranking=snapshot.entrants.map(entry=>entry.memberId);
  for(let i=ranking.length-1;i>0;i--){
    const j=randomIndex(i+1);
    if(!Number.isInteger(j)||j<0||j>i) throw Error("Invalid random index");
    [ranking[i],ranking[j]]=[ranking[j],ranking[i]];
  }
  return {version:1,campaign:CAMPAIGN,snapshotHash:hash(snapshot),drawnAt:new Date(now).toISOString(),
    entrantCount:ranking.length,ranking,candidateIndex:0,events:[]};
}
/** Current candidate is private. The operator rechecks live eligibility before contacting or awarding. */
export function cinemaCandidate(draw) {
  if(draw.events.some(event=>event.type==="claimed")) return null;
  return draw.ranking[draw.candidateIndex]??null;
}
function addEvent(draw,event) {return {...draw,events:[...draw.events,event]};}
function currentEvents(draw) {return draw.events.filter(event=>event.candidateIndex===draw.candidateIndex);}
function eventTime(draw, now) {
  const latest=draw.events.at(-1)?.at??draw.drawnAt;
  if(!Number.isFinite(now)||now<Date.parse(latest)||now>=SCREENING) throw Error("Invalid event time");
  return new Date(now).toISOString();
}
export function recordCinemaContact(draw,now=Date.now()) {
  if(!cinemaCandidate(draw))throw Error("No active candidate");
  const at=eventTime(draw,now);
  const previous = currentEvents(draw).filter(event=>event.type==="contact");
  const first = previous[0];
  if (!first && now + RESPONSE_WINDOW > SCREENING) throw Error("Insufficient time for the full response window");
  if(first && now>=Date.parse(first.at)+RESPONSE_WINDOW)throw Error("Response window elapsed");
  if(previous.some(event=>Date.parse(event.at)===now)) throw Error("Duplicate contact timestamp");
  return addEvent(draw,{type:"contact",candidateIndex:draw.candidateIndex,at});
}
export function recordCinemaClaim(draw,now=Date.now()) {
  if(!cinemaCandidate(draw))throw Error("No active candidate");
  const at=eventTime(draw,now),first=currentEvents(draw).find(event=>event.type==="contact");
  if(!first||now>=Date.parse(first.at)+RESPONSE_WINDOW)throw Error("No active response window");
  return addEvent(draw,{type:"claimed",candidateIndex:draw.candidateIndex,at});
}
export function advanceCinemaCandidate(draw,reason,now=Date.now()) {
  if(!cinemaCandidate(draw))throw Error("No active candidate");
  const at=eventTime(draw,now),events=currentEvents(draw),first=events.find(event=>event.type==="contact");
  if(!["no-response","declined","ineligible"].includes(reason))throw Error("Invalid replacement reason");
  if(reason==="no-response"&&(!first||now<Date.parse(first.at)+RESPONSE_WINDOW||events.filter(event=>event.type==="contact").length<2))
    throw Error("24 hours and two recorded contact attempts required");
  return {...addEvent(draw,{type:"replacement",candidateIndex:draw.candidateIndex,reason,at}),candidateIndex:draw.candidateIndex+1};
}


/** Rebuild the complete event history from the frozen evidence and original ranking.
 * This detects corrupt state and inconsistent transitions, not deliberate changes
 * by a filesystem administrator. Retain an independently witnessed initial digest.
 */
export function validateCinemaDraw(snapshotInput, input, now=Date.now()) {
  if (!Number.isFinite(now) || !input || input.version !== 1 || input.campaign !== CAMPAIGN ||
      !validTime(input.drawnAt) || Date.parse(input.drawnAt) > now ||
      Date.parse(input.drawnAt) < ENTRY_END || Date.parse(input.drawnAt) >= SCREENING ||
      !Array.isArray(input.ranking) || !Array.isArray(input.events) || input.events.length > 100_000)
    throw Error("Invalid draw record");
  const drawnAt=Date.parse(input.drawnAt);
  const snapshot=validateCinemaSnapshot(snapshotInput,drawnAt);
  const members=new Set(snapshot.entrants.map(entry=>entry.memberId));
  if (!members.size || input.snapshotHash !== hash(snapshot) || input.entrantCount !== members.size ||
      input.ranking.length !== members.size) throw Error("Draw evidence mismatch");
  for (const member of input.ranking) {
    if (!members.delete(member)) throw Error("Invalid draw ranking");
  }
  let draw={version:1,campaign:CAMPAIGN,snapshotHash:hash(snapshot),drawnAt:input.drawnAt,
    entrantCount:input.entrantCount,ranking:[...input.ranking],candidateIndex:0,events:[]};
  for (const event of input.events) {
    if (!event || !validTime(event.at) || Date.parse(event.at)>now || event.candidateIndex!==draw.candidateIndex)
      throw Error("Invalid draw event");
    const at=Date.parse(event.at);
    if (event.type==="contact") draw=recordCinemaContact(draw,at);
    else if (event.type==="claimed") draw=recordCinemaClaim(draw,at);
    else if (event.type==="replacement") draw=advanceCinemaCandidate(draw,event.reason,at);
    else throw Error("Invalid draw event type");
  }
  if (draw.candidateIndex !== input.candidateIndex) throw Error("Draw candidate index mismatch");
  return {snapshot,draw};
}

export function cinemaDrawSummary(draw) {
  const candidate=cinemaCandidate(draw);
  const contact=currentEvents(draw).find(event=>event.type==="contact");
  return {
    campaign:CAMPAIGN, snapshotHash:draw.snapshotHash, drawnAt:draw.drawnAt,
    entrantCount:draw.entrantCount, candidateNumber:candidate ? draw.candidateIndex+1 : null,
    state:draw.events.some(event=>event.type==="claimed") ? "claimed" : candidate ? "awaiting-claim" : "exhausted",
    responseDeadline:contact && candidate ? new Date(Date.parse(contact.at)+RESPONSE_WINDOW).toISOString() : null,
    eventCount:draw.events.length,
  };
}
