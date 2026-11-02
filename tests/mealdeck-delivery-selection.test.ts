import {describe,expect,test} from "bun:test";
import {chooseDelivery,type DeliveryQuote} from "../src/lib/mealdeck-delivery-selection";
const q=(change:Partial<DeliveryQuote>={}):DeliveryQuote=>({provider:"uber_direct",quoteId:"q1",amountPence:499,currency:"GBP",estimatedMinutes:35,serviceable:true,expiresAt:"2026-11-03T22:00:00Z",...change});
const now="2026-11-02T22:00:00Z";
describe("delivery provider selection",()=>{
 test("picks the cheapest valid quote",()=>expect(chooseDelivery([q(),q({provider:"own_fleet",quoteId:"q2",amountPence:350})],"GBP",now,60).selected?.provider).toBe("own_fleet"));
 test("excludes expired quotes",()=>expect(chooseDelivery([q({expiresAt:now})],"GBP",now,60).selected).toBeNull());
 test("excludes serviceability failures",()=>expect(chooseDelivery([q({serviceable:false})],"GBP",now,60).selected).toBeNull());
 test("excludes currency mismatch",()=>expect(chooseDelivery([q({currency:"EUR"})],"GBP",now,60).selected).toBeNull());
 test("excludes late ETA",()=>expect(chooseDelivery([q({estimatedMinutes:90})],"GBP",now,60).selected).toBeNull());
 test("excludes negative or fractional prices",()=>expect(chooseDelivery([q({amountPence:-1}),q({quoteId:"q2",amountPence:1.5})],"GBP",now,60).selected).toBeNull());
 test("prefers faster quote when prices match",()=>expect(chooseDelivery([q(),q({provider:"stuart",quoteId:"q2",estimatedMinutes:20})],"GBP",now,60).selected?.provider).toBe("stuart"));
 test("rejects unknown provider at runtime even when quote looks cheap",()=>expect(chooseDelivery([q({provider:"unknown_provider" as DeliveryQuote["provider"],amountPence:1})],"GBP",now,60).selected).toBeNull());
});
