import {describe,expect,test} from "bun:test";
import {applyVerifiedPaymentEvent,type ShareLedger} from "../src/lib/mealdeck-payment-event-ledger";
import {evaluateGroupKdsRelease,type GroupPayment} from "../src/lib/mealdeck-group-payment-gate";
import {planPaidKdsDispatch} from "../src/lib/mealdeck-kds-outbox";
import {evaluateMasterPass,planCourierBooking} from "../src/lib/mealdeck-fulfilment-planner";
import {projectCustomerTracking,type CourierLedger} from "../src/lib/mealdeck-fulfilment-status";
import {hashHandoffProof,verifyHandoffProof} from "../src/lib/mealdeck-handoff";

/** Pure simulation only. Real inputs must come from verified Dishbee records
 * after signed provider events and database row locks. */
const orderId="order_7";
const stations=[{brandId:"skorch",stationId:"grill"},{brandId:"taconelle",stationId:"assembly"}];
const shares=():ShareLedger[]=>[
  {shareId:"share1",providerReference:"psp1",currency:"GBP",duePence:1200,
    capturedPence:0,refundedPence:0,processedEventIds:[]},
  {shareId:"share2",providerReference:"psp2",currency:"GBP",duePence:1700,
    capturedPence:0,refundedPence:0,processedEventIds:[]},
];
function group(ledgers:readonly ShareLedger[],paid:boolean):GroupPayment {
 return {orderId,currency:"GBP",totalPence:2900,status:paid?"paid":"payment_pending",
  shares:ledgers.map(s=>({
   shareId:s.shareId,participantId:s.shareId,currency:s.currency,duePence:s.duePence,
   capturedPence:s.capturedPence,refundedPence:s.refundedPence,
   paymentStatus:s.capturedPence===s.duePence?"captured":"pending",
  }))};
}
const capture=(ledger:ShareLedger,eventId:string)=>
  applyVerifiedPaymentEvent(ledger,{
    eventId,shareId:ledger.shareId,providerReference:ledger.providerReference,
    currency:"GBP",kind:"capture",amountPence:ledger.duePence,verified:true,
  });

describe("Phase 24: synthetic captured-order to handoff rehearsal",()=>{
 test("unpaid invited guest blocks every kitchen and courier",()=>{
  const initial=shares(),first=capture(initial[0]!,"event_1");
  expect(first.accepted).toBe(true);
  const order=group([first.next,initial[1]!],true);
  expect(evaluateGroupKdsRelease(order).release).toBe(false);
  expect(planPaidKdsDispatch(order,stations,new Set()).tickets).toHaveLength(0);
  expect(planCourierBooking({
    order,expectedStations:stations,actualTickets:[],quotes:[],
    nowIso:"2026-11-03T10:00:00Z",maxDeliveryMinutes:45,
    maxCourierCostPence:700,bookingState:"none",
  }).reason).toBe("payment_unconfirmed");
  expect(projectCustomerTracking({
    orderId,fulfilment:"delivery",paymentConfirmed:false,
    expectedStations:stations,actualTickets:[],courier:null,handoffVerified:false,
  }).phase).toBe("awaiting_payment");
 });
 test("full capture produces two KDS stations, one pass and one courier booking plan",()=>{
  const ledger=shares().map((share,i)=>capture(share,"event_"+(i+1)).next);
  const order=group(ledger,true);
  expect(evaluateGroupKdsRelease(order).release).toBe(true);
  const plan=planPaidKdsDispatch(order,stations,new Set<string>());
  expect(plan.ready).toBe(true);
  expect(plan.tickets).toHaveLength(2);
  expect(planPaidKdsDispatch(order,stations,new Set(plan.tickets.map(x=>x.key)))
    .reason).toBe("already_enqueued");
  const halfway=plan.tickets.map((ticket,i)=>({
    key:ticket.key,status:i===0?"ready" as const:"preparing" as const,
  }));
  expect(evaluateMasterPass(orderId,stations,halfway).ready).toBe(false);
  const ready=plan.tickets.map(ticket=>({key:ticket.key,status:"ready" as const}));
  const quotes=[
    {provider:"uber_direct" as const,quoteId:"q1",currency:"GBP",
      amountPence:580,estimatedMinutes:22,expiresAt:"2026-11-03T10:10:00Z",serviceable:true},
    {provider:"own_fleet" as const,quoteId:"q2",currency:"GBP",
      amountPence:410,estimatedMinutes:35,expiresAt:"2026-11-03T10:08:00Z",serviceable:true},
  ];
  const input={order,expectedStations:stations,actualTickets:ready,quotes,
    nowIso:"2026-11-03T10:00:00Z",maxDeliveryMinutes:45,
    maxCourierCostPence:700,bookingState:"none" as const};
  expect(planCourierBooking({...input,actualTickets:halfway}).reason).toBe("kitchens_incomplete");
  const courier=planCourierBooking(input);
  expect(courier.ready).toBe(true);
  expect(courier.request).toMatchObject({
    orderId,provider:"own_fleet",idempotencyKey:"mealdeck:delivery:order_7",
  });
  expect(planCourierBooking({...input,bookingState:"requesting"}).ready).toBe(false);
  const delivered:CourierLedger={
    orderId,provider:"own_fleet",bookingReference:"ref1",
    status:"delivered",updatedAt:"2026-11-03T10:20:00Z",processedEventIds:[],
  };
  const status={orderId,fulfilment:"delivery" as const,paymentConfirmed:true,
    expectedStations:stations,actualTickets:ready,courier:delivered,handoffVerified:false};
  expect(projectCustomerTracking(status).phase).toBe("delivery_proof_pending");
  const proof={orderId,mode:"delivery" as const,code:"607214"};
  const secret="long_mealdeck_server_only_handoff_key_32_bytes_or_more";
  expect(verifyHandoffProof({
    proof,expectedHash:hashHandoffProof(proof,secret)!,secret,
    nowIso:"2026-11-03T10:20:00Z",expiresAt:"2026-11-03T11:00:00Z",
    failedAttempts:0,
  }).verified).toBe(true);
  expect(projectCustomerTracking({...status,handoffVerified:true}).completed).toBe(true);
 });
 test("refund or spoofed webhook prevents a new kitchen release",()=>{
  const before=shares();
  const spoofed=applyVerifiedPaymentEvent(before[0]!,{
    eventId:"spoof",shareId:"share1",providerReference:"psp1",currency:"GBP",
    kind:"capture",amountPence:1200,verified:false,
  });
  expect(spoofed.accepted).toBe(false);
  expect(planPaidKdsDispatch(group([spoofed.next,before[1]!],false),
    stations,new Set()).ready).toBe(false);
  const both=before.map((share,i)=>capture(share,"capture"+i).next);
  const refund=applyVerifiedPaymentEvent(both[1]!,{
    eventId:"refund1",shareId:"share2",providerReference:"psp2",currency:"GBP",
    kind:"refund",amountPence:1,verified:true,
  });
  expect(refund.accepted).toBe(true);
  expect(planPaidKdsDispatch(group([both[0]!,refund.next],true),
    stations,new Set()).ready).toBe(false);
 });
});
