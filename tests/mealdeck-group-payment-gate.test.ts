import {describe,expect,test} from "bun:test";
import {evaluateGroupKdsRelease,type GroupPayment} from "../src/lib/mealdeck-group-payment-gate";
const ready=():GroupPayment=>({orderId:"o1",currency:"GBP",totalPence:2500,status:"paid",shares:[
 {shareId:"s1",participantId:"p1",duePence:1000,capturedPence:1000,refundedPence:0,currency:"GBP",paymentStatus:"captured"},
 {shareId:"s2",participantId:"p2",duePence:1500,capturedPence:1500,refundedPence:0,currency:"GBP",paymentStatus:"captured"},
]});
describe("group payment KDS release gate",()=>{
 test("releases a fully captured multi-person basket",()=>expect(evaluateGroupKdsRelease(ready()).release).toBe(true));
 test("never releases pending order even with captured shares",()=>{
  expect(evaluateGroupKdsRelease({...ready(),status:"payment_pending"}).reason).toBe("unpaid");
 });
 test("requires each invited participant captured, not merely authorised",()=>{
  const o=ready();o.shares=[o.shares[0],{...o.shares[1],paymentStatus:"authorised",capturedPence:0}];
  expect(evaluateGroupKdsRelease(o)).toEqual({release:false,reason:"payments_incomplete",outstandingPence:1500});
 });
 test("rejects inaccurate allocation",()=>{
  const o=ready();o.shares=[o.shares[0],{...o.shares[1],duePence:1400}];
  expect(evaluateGroupKdsRelease(o).reason).toBe("allocation_mismatch");
 });
 test("rejects refunded shares and cross-currency shares",()=>{
  const o=ready();o.shares=[{...o.shares[0],refundedPence:200},o.shares[1]];
  expect(evaluateGroupKdsRelease(o).release).toBe(false);
  o.shares=[{...o.shares[0],currency:"EUR"},o.shares[1]];
  expect(evaluateGroupKdsRelease(o).reason).toBe("invalid_shares");
 });
 test("rejects duplicate share identifiers and unsafe amounts",()=>{
  const o=ready();o.shares=[o.shares[0],{...o.shares[1],shareId:"s1"}];
  expect(evaluateGroupKdsRelease(o).reason).toBe("invalid_shares");
  expect(evaluateGroupKdsRelease({...ready(),totalPence:1.5}).reason).toBe("invalid_order");
 });
 test("never releases cancelled orders",()=>expect(evaluateGroupKdsRelease({...ready(),status:"cancelled"}).release).toBe(false));
});
