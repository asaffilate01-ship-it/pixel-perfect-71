import { describe, test, expect } from "bun:test";
import { CAMPAIGN, ENTRY_END, RESPONSE_WINDOW, createCinemaDraw, validateCinemaSnapshot, cinemaCandidate, recordCinemaContact, recordCinemaClaim, advanceCinemaCandidate } from "../deploy/mealdeck/munchbox-cinema-draw.mjs";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const snapshot={version:1,campaign:CAMPAIGN,ready:true,snapshotAt:"2026-12-07T09:00:00Z",installationId:id(1),locationId:id(2),eligibleSkus:["verified-sku-test-only"],entrants:[{memberId:id(3),orderIds:[id(10),id(11)]},{memberId:id(4),orderIds:[id(12)]},{memberId:id(5),orderIds:[id(13)]}]};
const now=Date.parse(snapshot.snapshotAt);
describe("Private cinema draw preparation",()=>{
  test("rejects premature/unready/duplicate evidence and never includes contact details",()=>{
    expect(()=>createCinemaDraw(snapshot,ENTRY_END-1)).toThrow();
    expect(()=>validateCinemaSnapshot({...snapshot,ready:false},now)).toThrow();
    expect(()=>validateCinemaSnapshot({...snapshot,eligibleSkus:[]},now)).toThrow();
    expect(()=>validateCinemaSnapshot({...snapshot,entrants:[snapshot.entrants[0],snapshot.entrants[0]]},now)).toThrow();
    expect(()=>validateCinemaSnapshot({...snapshot,entrants:[snapshot.entrants[0],{memberId:id(8),orderIds:[id(10)]}]},now)).toThrow();
    const clean=validateCinemaSnapshot({...snapshot,entrants:snapshot.entrants.map(e=>({...e,phone:"private"}))},now);
    expect(JSON.stringify(clean)).not.toContain("phone");
  });
  test("uniform ranking uses exactly one member per place and hashes the snapshot",()=>{
    const draw=createCinemaDraw(snapshot,now,()=>0);
    expect(draw.entrantCount).toBe(3);
    expect(new Set(draw.ranking).size).toBe(3);
    expect(draw.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cinemaCandidate(draw)).toBe(draw.ranking[0]);
    expect(()=>createCinemaDraw(snapshot,now,()=>999)).toThrow();
  });
  test("replacement requires 24 hours plus reasonable contact attempts and cannot follow a claim",()=>{
    let draw=createCinemaDraw(snapshot,now,()=>0);
    expect(()=>advanceCinemaCandidate(draw,"no-response",now+RESPONSE_WINDOW)).toThrow();
    draw=recordCinemaContact(draw,now);
    expect(()=>advanceCinemaCandidate(draw,"no-response",now+RESPONSE_WINDOW)).toThrow();
    draw=recordCinemaContact(draw,now+3600000);
    expect(()=>advanceCinemaCandidate(draw,"no-response",now+RESPONSE_WINDOW-1)).toThrow();
    draw=advanceCinemaCandidate(draw,"no-response",now+RESPONSE_WINDOW);
    expect(cinemaCandidate(draw)).toBe(draw.ranking[1]);
    expect(()=>recordCinemaClaim(draw,now+RESPONSE_WINDOW)).toThrow();
    draw=recordCinemaContact(draw,now+RESPONSE_WINDOW);
    draw=recordCinemaClaim(draw,now+RESPONSE_WINDOW+1000);
    expect(cinemaCandidate(draw)).toBeNull();
    expect(()=>advanceCinemaCandidate(draw,"declined",now+RESPONSE_WINDOW+2000)).toThrow();
  });
});
