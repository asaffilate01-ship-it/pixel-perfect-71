import {describe,expect,test} from "bun:test";
import {applyVerifiedPaymentEvent,type ShareLedger,type PaymentEvent} from "../src/lib/mealdeck-payment-event-ledger";
const share=():ShareLedger=>({shareId:"s1",providerReference:"adyen-1",currency:"GBP",duePence:1200,capturedPence:0,refundedPence:0,processedEventIds:[]});
const event=(changes:Partial<PaymentEvent>={}):PaymentEvent=>({eventId:"e1",shareId:"s1",providerReference:"adyen-1",currency:"GBP",kind:"capture",amountPence:1200,verified:true,...changes});
describe("verified payment event ledger",()=>{
 test("applies captured funds",()=>expect(applyVerifiedPaymentEvent(share(),event()).next.capturedPence).toBe(1200));
 test("rejects unverified webhooks",()=>expect(applyVerifiedPaymentEvent(share(),event({verified:false})).reason).toBe("unverified"));
 test("deduplicates webhook retry",()=>{const first=applyVerifiedPaymentEvent(share(),event());expect(applyVerifiedPaymentEvent(first.next,event()).reason).toBe("duplicate")});
 test("requires matching payment identity",()=>expect(applyVerifiedPaymentEvent(share(),event({currency:"EUR"})).reason).toBe("mismatch"));
 test("blocks overcapture",()=>expect(applyVerifiedPaymentEvent(share(),event({amountPence:1201})).reason).toBe("overcapture"));
 test("blocks refund larger than collected amount",()=>expect(applyVerifiedPaymentEvent(share(),event({kind:"refund"})).reason).toBe("overrefund"));
 test("applies valid refunds after capture",()=>{const captured=applyVerifiedPaymentEvent(share(),event()).next;const refund=applyVerifiedPaymentEvent(captured,event({eventId:"e2",kind:"refund",amountPence:200}));expect(refund.next.refundedPence).toBe(200)});
 test("authorisation alone never counts as capture",()=>expect(applyVerifiedPaymentEvent(share(),event({kind:"authorisation"})).reason).toBe("no_settlement"));
});
