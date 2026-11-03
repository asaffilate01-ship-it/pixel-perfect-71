import { describe, expect, test } from "bun:test";
import {
  issueMealDeckQuote, verifyMealDeckQuote, matchesCurrentDishbeeAmounts,
  type QuoteBinding, type QuoteAmounts,
} from "../src/server/mealdeck-quote";
const secret="separate_server_only_mealdeck_signing_secret_at_least_32_bytes";
const nowMs=Date.parse("2026-11-03T14:00:00.000Z");
const item="11111111-1111-4111-8111-111111111111";
const option="22222222-2222-4222-8222-222222222222";
const binding:QuoteBinding={
  tenantId:"33333333-3333-4333-8333-333333333333",
  locationId:"44444444-4444-4444-8444-444444444444",
  location:"luton",fulfilment:"delivery",postcode:"LU1 2AB",
  lines:[{itemId:item,quantity:2,modifierIds:[option]}],
};
const amounts:QuoteAmounts={currency:"GBP",goodsPence:2580,deliveryPence:299,totalPence:2879};
const make=(b=binding,a=amounts,key=secret,issued=nowMs)=>
 issueMealDeckQuote({binding:b,amounts:a,secret:key,nowMs:issued});
const verified=(token:string,b=binding,ts=nowMs,key=secret)=>
 verifyMealDeckQuote({token,binding:b,nowMs:ts,secret:key});

describe("Phase 28: signed, short-lived Dishbee checkout price bound to basket",()=>{
  test("a correctly signed quote validates against the exact kitchen and basket",()=>{
    const issued=make();
    expect(issued.ready).toBe(true);
    if(!issued.ready)return;
    const result=verified(issued.token);
    expect(result).toMatchObject({valid:true,amounts});
    expect(issued.token).not.toContain("LU1");
    expect(issued.token).not.toContain("2AB");
    expect(issued.expiresAt).toBe("2026-11-03T14:02:00.000Z");
  });
  test("basket line order and whitespace in postcode are not economic changes",()=>{
    const item2="55555555-5555-4555-8555-555555555555";
    const more:QuoteBinding={...binding,
      lines:[...binding.lines,{itemId:item2,quantity:1,modifierIds:[]}]};
    const a=make(more);
    expect(a.ready).toBe(true);
    if(!a.ready)return;
    const changed={...more,postcode:"lu12ab",lines:[...more.lines].reverse()};
    expect(verified(a.token,changed).valid).toBe(true);
  });
  test("different kitchen, tenant, postcode, fulfilment and modifiers all invalidate",()=>{
    const issued=make();
    if(!issued.ready)throw new Error("quote_creation_failed");
    const otherUuid="66666666-6666-4666-8666-666666666666";
    for(const b of [
      {...binding,tenantId:otherUuid}, {...binding,locationId:otherUuid},
      {...binding,postcode:"LU2 3XY"}, {...binding,fulfilment:"pickup" as const},
      {...binding,lines:[{itemId:item,quantity:1,modifierIds:[option]}]},
      {...binding,lines:[{itemId:item,quantity:2,modifierIds:[]}]},
    ]) expect(verified(issued.token,b).valid).toBe(false);
  });
  test("expires in two minutes, rejects future or forged signatures and a weak key",()=>{
    const issued=make();
    if(!issued.ready)throw new Error("quote_creation_failed");
    expect(verified(issued.token,binding,nowMs+119_999).valid).toBe(true);
    expect(verified(issued.token,binding,nowMs+120_000))
      .toEqual({valid:false,reason:"expired"});
    const [body,sig]=issued.token.split(".");
    const tampered=body+"."+(sig?.startsWith("A")?"B":"A")+sig!.slice(1);
    expect(verified(tampered).valid).toBe(false);
    expect(verified("abc").valid).toBe(false);
    expect(make(binding,amounts,"weak").ready).toBe(false);
    expect(verified(issued.token,binding,nowMs,"other-key-32chars-minimum-long-value").valid)
      .toBe(false);
    const future=make(binding,amounts,secret,nowMs+60_000);
    if(!future.ready)throw new Error("future_creation_failed");
    expect(verified(future.token,binding,nowMs).valid).toBe(false);
  });
  test("rejects malformed amounts and invalid postcode or selected items",()=>{
    expect(make(binding,{...amounts,totalPence:1}).ready).toBe(false);
    expect(make(binding,{...amounts,goodsPence:0}).ready).toBe(false);
    expect(make(binding,{...amounts,deliveryPence:-1}).ready).toBe(false);
    expect(make({...binding,postcode:"???"}).ready).toBe(false);
    expect(make({...binding,lines:[{itemId:"x",quantity:1,modifierIds:[]}]}).ready).toBe(false);
    expect(make({...binding,lines:[{itemId:item,quantity:1,modifierIds:[option,option]}]}).ready)
      .toBe(false);
  });
  test("collection is zero fee and St Albans cannot issue a collection quote",()=>{
    const pickup={...binding,fulfilment:"pickup" as const};
    expect(make(pickup,{...amounts,deliveryPence:0,totalPence:2580}).ready).toBe(true);
    expect(make(pickup,amounts).ready).toBe(false);
    expect(make({...pickup,location:"stalbans"}).ready).toBe(false);
  });
  test("rechecks the live Dishbee bill before creating pending order",()=>{
    expect(matchesCurrentDishbeeAmounts(amounts,amounts)).toBe(true);
    expect(matchesCurrentDishbeeAmounts(amounts,{...amounts,deliveryPence:399,totalPence:2979}))
      .toBe(false);
    expect(matchesCurrentDishbeeAmounts(amounts,{...amounts,goodsPence:2480,totalPence:2779}))
      .toBe(false);
  });
});
