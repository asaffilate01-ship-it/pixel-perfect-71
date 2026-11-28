import { describe, test, expect } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialiseCinemaLedger, inspectCinemaLedger, lookupCinemaCandidate, updateCinemaLedger } from "../deploy/mealdeck/munchbox-cinema-ledger.mjs";
import { CAMPAIGN, ENTRY_END, RESPONSE_WINDOW, createCinemaDraw, validateCinemaSnapshot, cinemaCandidate, recordCinemaContact, recordCinemaClaim, advanceCinemaCandidate, validateCinemaDraw, SCREENING } from "../deploy/mealdeck/munchbox-cinema-draw.mjs";
const id=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
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


describe("Frozen draw validation and durable private audit",()=>{
  test("rejects impossible calendar dates and manipulated rankings or claims",()=>{
    expect(()=>validateCinemaSnapshot({...snapshot,snapshotAt:"2026-11-31T09:00:00Z"},now)).toThrow();
    let draw=createCinemaDraw(snapshot,now,()=>0);
    expect(()=>validateCinemaDraw(snapshot,{...draw,ranking:[draw.ranking[0],draw.ranking[0],draw.ranking[2]]},now)).toThrow();
    expect(()=>validateCinemaDraw({...snapshot,eligibleSkus:["different"]},draw,now)).toThrow();
    expect(()=>validateCinemaDraw(snapshot,{...draw,candidateIndex:1},now)).toThrow();
    expect(()=>validateCinemaDraw(snapshot,{...draw,events:[{type:"claimed",candidateIndex:0,at:snapshot.snapshotAt}]},now)).toThrow();
    expect(()=>recordCinemaContact(draw,SCREENING-RESPONSE_WINDOW+1)).toThrow();
    draw=recordCinemaContact(draw,now);
    expect(()=>recordCinemaContact(draw,now)).toThrow();
    draw=recordCinemaContact(draw,now+3600000);
    draw=advanceCinemaCandidate(draw,"no-response",now+RESPONSE_WINDOW);
    expect(validateCinemaDraw(snapshot,draw,now+RESPONSE_WINDOW).draw).toEqual(draw);
    expect(()=>validateCinemaDraw(snapshot,draw,now)).toThrow();
  });

  test("creates a single private ranking and prevents redraws or stale concurrent actions",()=>{
    const dir=mkdtempSync(join(tmpdir(),"mealdeck-cinema-ledger-"));
    try{
      const initial=initialiseCinemaLedger(dir,snapshot,now);
      expect(initial.entrantCount).toBe(3);
      expect(initial.genesisDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(initial.ledgerDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(initial.state).toBe("awaiting-claim");
      expect(JSON.stringify(initial)).not.toContain(snapshot.entrants[0]!.memberId);
      expect(statSync(join(dir,"cinema-draw-ledger.json")).mode & 0o777).toBe(0o600);
      expect(()=>initialiseCinemaLedger(dir,snapshot,now)).toThrow(/already exists/);
      expect(()=>inspectCinemaLedger(dir,"0".repeat(64),now)).toThrow();
      const privateCandidate=lookupCinemaCandidate(dir,initial.genesisDigest,now)!;
      expect(snapshot.entrants.some(entry=>entry.memberId===privateCandidate.memberId)).toBe(true);
      expect(inspectCinemaLedger(dir,initial.genesisDigest,now)).toEqual(initial);
      const contact=updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:initial.ledgerDigest,action:"contact"},now);
      expect(contact.responseDeadline).toBe(new Date(now+RESPONSE_WINDOW).toISOString());
      expect(contact.ledgerDigest).not.toBe(initial.ledgerDigest);
      expect(()=>updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:initial.ledgerDigest,action:"claim"},now+1000)).toThrow(/changed/);
      expect(()=>updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:contact.ledgerDigest,action:"replace",reason:"no-response"},now+RESPONSE_WINDOW)).toThrow();
      const second=updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:contact.ledgerDigest,action:"contact"},now+3600000);
      const replacement=updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:second.ledgerDigest,action:"replace",reason:"no-response"},now+RESPONSE_WINDOW);
      expect(replacement.candidateNumber).toBe(2);
      expect(replacement.genesisDigest).toBe(initial.genesisDigest);
      expect(lookupCinemaCandidate(dir,initial.genesisDigest,now+RESPONSE_WINDOW)?.memberId).not.toBe(privateCandidate.memberId);
      const nextContact=updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:replacement.ledgerDigest,action:"contact"},now+RESPONSE_WINDOW);
      const claim=updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:nextContact.ledgerDigest,action:"claim"},now+RESPONSE_WINDOW+1000);
      expect(claim.state).toBe("claimed");
      expect(lookupCinemaCandidate(dir,initial.genesisDigest,now+RESPONSE_WINDOW+1000)).toBeNull();
      expect(()=>updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:claim.ledgerDigest,action:"replace",reason:"declined"},now+RESPONSE_WINDOW+2000)).toThrow();
    }finally{rmSync(dir,{recursive:true,force:true});}
  });

  test("fails closed on a held lock, insecure permissions, symlinks and corrupted evidence",()=>{
    const dir=mkdtempSync(join(tmpdir(),"mealdeck-cinema-integrity-"));
    try{
      const initial=initialiseCinemaLedger(dir,snapshot,now);
      const path=join(dir,"cinema-draw-ledger.json");
      const original=readFileSync(path,"utf8");
      writeFileSync(join(dir,"cinema-draw.lock"),"held",{mode:0o600});
      expect(()=>updateCinemaLedger(dir,{genesis:initial.genesisDigest,previous:initial.ledgerDigest,action:"contact"},now)).toThrow(/locked/);
      rmSync(join(dir,"cinema-draw.lock"));
      chmodSync(path,0o644);
      expect(()=>inspectCinemaLedger(dir,initial.genesisDigest,now)).toThrow(/private evidence/);
      chmodSync(path,0o600);
      const forged=JSON.parse(original);
      forged.draw.ranking.reverse();
      writeFileSync(path,JSON.stringify(forged));
      expect(()=>inspectCinemaLedger(dir,initial.genesisDigest,now)).toThrow(/digest/);
      writeFileSync(path,original);
      const other=join(dir,"copy.json");
      writeFileSync(other,original,{mode:0o600});
      rmSync(path);
      symlinkSync(other,path);
      expect(()=>inspectCinemaLedger(dir,initial.genesisDigest,now)).toThrow();
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
});
