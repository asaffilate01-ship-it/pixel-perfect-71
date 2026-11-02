import {describe,expect,test} from "bun:test";
import {planPaidKdsDispatch} from "../src/lib/mealdeck-kds-outbox";
import type {GroupPayment} from "../src/lib/mealdeck-group-payment-gate";
const order=():GroupPayment=>({
 orderId:"order1",currency:"GBP",totalPence:1500,status:"paid",
 shares:[{shareId:"s1",participantId:"p1",duePence:1500,capturedPence:1500,refundedPence:0,currency:"GBP",paymentStatus:"captured"}],
});
const stations=[{brandId:"skorch",stationId:"grill"},{brandId:"taconelle",stationId:"assembly"}];
describe("paid-only KDS outbox planning",()=>{
 test("plans one ticket per brand station",()=>{
  const r=planPaidKdsDispatch(order(),stations,new Set());
  expect(r.ready).toBe(true);expect(r.tickets).toHaveLength(2);
  expect(r.tickets[0].key).toBe("kds:order1:skorch:grill");
 });
 test("blocks unpaid orders",()=>{
  const r=planPaidKdsDispatch({...order(),status:"payment_pending"},stations,new Set());
  expect(r.ready).toBe(false);expect(r.tickets).toHaveLength(0);
 });
 test("blocks refunded payment share",()=>{
  const o=order();o.shares=[{...o.shares[0],refundedPence:500}];
  expect(planPaidKdsDispatch(o,stations,new Set()).tickets).toHaveLength(0);
 });
 test("deduplicates repeated station routes",()=>{
  expect(planPaidKdsDispatch(order(),[stations[0],stations[0]],new Set()).tickets).toHaveLength(1);
 });
 test("skips already queued tickets",()=>{
  const r=planPaidKdsDispatch(order(),stations,new Set(["kds:order1:skorch:grill"]));
  expect(r.tickets).toHaveLength(1);expect(r.tickets[0].brandId).toBe("taconelle");
 });
 test("rejects malformed station identifiers",()=>{
  const r=planPaidKdsDispatch(order(),[{brandId:"skorch",stationId:"../unsafe"}],new Set());
  expect(r.ready).toBe(false);
 });
 test("requires at least one station",()=>expect(planPaidKdsDispatch(order(),[],new Set()).ready).toBe(false));
});
