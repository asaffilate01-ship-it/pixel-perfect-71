import {describe,expect,test} from "bun:test";
import {parseDriverInbox,driverJobActionLabel} from "../src/lib/mealdeck-driver-workspace";
const now="2026-11-08T15:00:00Z";
const base={id:"c9bf448e-1d6b-4acb-9574-fb352dc3c72d",reference:"MD-101",status:"offered",version:1,paid:true,locationName:"MealDeck Luton",offeredAt:"2026-11-08T14:59:00Z",expiresAt:"2026-11-08T15:01:00Z",bagCount:2};
describe("driver workspace inbox contract",()=>{
 test("shows only unexpired offers and sorts them first",()=>{
   const first={...base,id:"d2577ed3-ea2c-454d-b8c1-7ae949d04aaf",expiresAt:"2026-11-08T15:00:30Z"};
   const inbox=parseDriverInbox([base,first],now);
   expect(inbox.offers.map(v=>v.id)).toEqual([first.id,base.id]);
 });
 test("expired offers do not appear",()=>{
   expect(parseDriverInbox([{...base,expiresAt:now}],now).offers).toHaveLength(0);
 });
 test("active assignments and completed history stay separate",()=>{
   const active={...base,status:"assigned",expiresAt:null};
   const completed={...base,id:"d2577ed3-ea2c-454d-b8c1-7ae949d04aaf",status:"delivered",expiresAt:null};
   expect(parseDriverInbox([active,completed],now)).toMatchObject({offers:[],active:[{status:"assigned"}],completed:[{status:"delivered"}]});
 });
 test("rejects unpaid, duplicate and unexpected private address fields",()=>{
   expect(()=>parseDriverInbox([{...base,paid:false}],now)).toThrow();
   expect(()=>parseDriverInbox([base,base],now)).toThrow("duplicate");
   expect(()=>parseDriverInbox([{...base,customerAddress:"secret"}],now)).toThrow();
 });
 test("rejects active assignment still carrying offer expiry",()=>{
   expect(()=>parseDriverInbox([{...base,status:"assigned"}],now)).toThrow("assignment");
 });
 test("workflow labels never suggest an unverified completion",()=>{
   expect(driverJobActionLabel("at_customer")).toBe("Confirm handover");
   expect(driverJobActionLabel("delivered")).toBeNull();
 });
});
