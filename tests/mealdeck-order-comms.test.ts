import { describe,expect,test } from "bun:test";
import { parseCustomerCommsAction,parseOrderCommsSnapshot } from "../src/lib/mealdeck-order-comms";
const id="d4ae56fa-668b-4125-9328-78767e9063cd";
const snapshot={state:"arrived",arrivedAt:"2026-11-09T13:35:00Z",parkingNote:"Blue car in bay 2",
  pin:{latitude:51.88,longitude:-0.41,expiresAt:"2026-11-09T13:50:00Z"},
  messages:[{id,sender:"customer",body:"I'm parked near the entrance",createdAt:"2026-11-09T13:35:00Z"}],
  serverNow:"2026-11-09T13:40:00Z"};
describe("private order communications",()=>{
  test("accepts authenticated order-only snapshot with ephemeral pin",()=>{
    const parsed=parseOrderCommsSnapshot(snapshot);
    expect(parsed).not.toBeNull();
    expect(parsed?.state).toBe("arrived");
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.pin?.latitude).toBe(51.88);
  });
  test("hides expired pin even if server returned a stale row",()=>{
    expect(parseOrderCommsSnapshot({...snapshot,pin:{...snapshot.pin,expiresAt:"2026-11-09T13:38:00Z"}})?.pin).toBeNull();
  });
  test("rejects malformed state, injection, message, identifiers and oversized payloads",()=>{
    expect(parseOrderCommsSnapshot({...snapshot,messages:[{...snapshot.messages[0],id:"not-id"}]})).toBeNull();
    expect(parseOrderCommsSnapshot({...snapshot,state:"paid"})).toBeNull();
    expect(parseCustomerCommsAction({action:"handoff_comms",orderId:id,kind:"message",body:"Hi"})).not.toBeNull();
    expect(parseCustomerCommsAction({action:"handoff_comms",orderId:id,kind:"read"})).not.toBeNull();
    expect(parseCustomerCommsAction({action:"handoff_comms",orderId:id,kind:"arrived",parkingNote:"Bay 1"})).not.toBeNull();
    expect(parseCustomerCommsAction({action:"handoff_comms",orderId:id,kind:"pin",latitude:51.88,longitude:-0.42})).not.toBeNull();
    for(const value of [
      {action:"handoff_comms",orderId:"fake",kind:"read"},
      {action:"handoff_comms",orderId:id,kind:"message",body:""},
      {action:"handoff_comms",orderId:id,kind:"message",body:"hi",latitude:51.88,longitude:-0.4},
      {action:"handoff_comms",orderId:id,kind:"arrived",latitude:51.88},
      {action:"handoff_comms",orderId:id,kind:"pin",latitude:60,longitude:100},
      {action:"handoff_comms",orderId:id,kind:"read",admin:true},
      {action:"handoff_comms",orderId:id,kind:"message",body:"a".repeat(501)},
    ])expect(parseCustomerCommsAction(value)).toBeNull();
  });
});
