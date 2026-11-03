import { describe, expect, test } from "bun:test";
import {
  checkoutSnapshotFingerprint, getOrCreateCheckoutAttempt,
  type CheckoutSnapshot,
} from "../src/lib/mealdeck-checkout-attempt";

const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const basket: CheckoutSnapshot = {
  location: "luton", fulfilment: "delivery",
  lines: [{
    id: "11111111-1111-4111-8111-111111111111",
    brandId: "skorch-burgers", lineId: "local-1", category: "Burgers",
    name: "Double Smash", quantity: 2, pricePence: 1099,
    selectedModifiers: [],
  }],
  customer: {
    name: "Example", phone: "+447700900000", email: "",
    carMake: "", vehicleRegistration: "",
    address1: "Testing Street", city: "Luton", postcode: "LU1 1AB", notes: "",
  },
};
const fingerprint = () => checkoutSnapshotFingerprint(basket);

describe("MealDeck checkout attempts — browser-side intent only", () => {
  test("reuses the same high-entropy ID when a request is retried unchanged", () => {
    const fp=fingerprint();
    const created=getOrCreateCheckoutAttempt(null,fp,()=>first);
    expect(created).toEqual({fingerprint:fp,id:first});
    expect(getOrCreateCheckoutAttempt(created,fp,()=>{throw Error("should not call");}))
      .toEqual(created);
  });
  test("any relevant basket or customer change rotates the attempt ID", () => {
    const saved=getOrCreateCheckoutAttempt(null,fingerprint(),()=>first);
    expect(saved).not.toBeNull();
    for(const changed of [
      {...basket, lines:[{...basket.lines[0]!,quantity:3}]},
      {...basket, customer:{...basket.customer,phone:"+447700900001"}},
      {...basket, customer:{...basket.customer,notes:"No onions"}},
      {...basket, fulfilment:"pickup" as const},
      {...basket, customer:{...basket.customer,address1:"New address"}},
    ]) {
      const next=getOrCreateCheckoutAttempt(saved,checkoutSnapshotFingerprint(changed),()=>second);
      expect(next?.id).toBe(second);
    }
  });
  test("changing a modifier always changes the request fingerprint", () => {
    const next={...basket,lines:[{...basket.lines[0]!,selectedModifiers:[{
      id:"22222222-2222-4222-8222-222222222222",groupId:"33333333-3333-4333-8333-333333333333",
      groupName:"Sauces",name:"Spicy",priceDeltaPence:20,
    }]}]};
    expect(checkoutSnapshotFingerprint(next)).not.toEqual(fingerprint());
  });
  test("does not accept predictable, missing or non-v4 identifiers", () => {
    const fp=fingerprint();
    for(const id of ["", "123", "00000000-0000-0000-0000-000000000000",
      "aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa", "aaaaaaaa-aaaa-4aaa-0aaa-aaaaaaaaaaaa"]) {
      expect(getOrCreateCheckoutAttempt(null,fp,()=>id)).toBeNull();
    }
    expect(getOrCreateCheckoutAttempt(null,fp,()=>{throw new Error("no crypto");})).toBeNull();
    expect(getOrCreateCheckoutAttempt(null,null,()=>first)).toBeNull();
  });
  test("rejects impossible or over-size basket requests before generating attempts", () => {
    expect(checkoutSnapshotFingerprint({...basket,lines:[]})).toBeNull();
    expect(checkoutSnapshotFingerprint({...basket,location:"stalbans",fulfilment:"pickup"}))
      .toBeNull();
    expect(checkoutSnapshotFingerprint({
      ...basket,lines:[{...basket.lines[0]!,quantity:51}],
    })).toBeNull();
    expect(checkoutSnapshotFingerprint({
      ...basket,customer:{...basket.customer,name:"A".repeat(121)},
    })).toBeNull();
  });
  test("quote refresh does not affect the identity of the same customer-reviewed basket", () => {
    const fp=fingerprint();
    const original=getOrCreateCheckoutAttempt(null,fp,()=>first);
    // Signed quote token intentionally never enters the request fingerprint.
    expect(fp).not.toContain("quoteToken");
    expect(getOrCreateCheckoutAttempt(original,fp,()=>second)?.id).toBe(first);
  });
});
