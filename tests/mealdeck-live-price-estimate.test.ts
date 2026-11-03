import {describe,expect,test} from "bun:test";
import {estimateGoodsFromDishbee,verifyDishbeeFeeResult} from "../src/lib/mealdeck-live-price-estimate";
const dish="11111111-1111-4111-8111-111111111111";
const mod="22222222-2222-4222-8222-222222222222";
const group="33333333-3333-4333-8333-333333333333";
const row=(change:Record<string,unknown>={})=>({
 item_id:dish,price_pence:1299,channel_open:true,
 modifier_groups:[{id:group,minSelect:0,maxSelect:1,options:[
  {id:mod,priceDeltaPence:150}]}],
 ...change,
});
const line=(change:Record<string,unknown>={})=>({
 itemId:dish,quantity:2,modifierIds:[mod],...change,
});
describe("Phase 27: server-priced Dishbee basket estimate",()=>{
 test("combines live item prices and canonical modifier deltas",()=>{
  expect(estimateGoodsFromDishbee([row()],[line()]))
   .toEqual({valid:true,goodsPence:2898,itemCount:2});
 });
 test("ignores browser-provided prices altogether",()=>{
  const client={...line(),pricePence:0,priceDeltaPence:-1000};
  expect(estimateGoodsFromDishbee([row()],[client]))
   .toMatchObject({valid:true,goodsPence:2898});
 });
 test("rejects missing, unavailable, duplicate or altered item IDs",()=>{
  expect(estimateGoodsFromDishbee([], [line()]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row({channel_open:false})],[line()]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row(),row()],[line()]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row()],[line({itemId:"wrong"})]).valid).toBe(false);
 });
 test("enforces group selection bounds and registered options",()=>{
  expect(estimateGoodsFromDishbee([row({modifier_groups:[{
   id:group,minSelect:1,maxSelect:1,options:[{id:mod,priceDeltaPence:100}],
  }]})],[line({modifierIds:[]})]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row()],[line({modifierIds:[mod,mod]})]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row()],[line({modifierIds:[group]})]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row({modifier_groups:"oops"})],[line()]).valid).toBe(false);
 });
 test("rejects fractional prices, negative totals and abusive quantities",()=>{
  expect(estimateGoodsFromDishbee([row({price_pence:1299.1})],[line()]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row()],[line({quantity:1000})]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row({price_pence:10_000_000})],[line()]).valid).toBe(false);
  expect(estimateGoodsFromDishbee([row({price_pence:0,modifier_groups:[]})],[line({modifierIds:[]})]).valid).toBe(false);
 });
 test("accepts only safe non-negative Dishbee fee values",()=>{
  expect(verifyDishbeeFeeResult(0)).toBe(0);
  expect(verifyDishbeeFeeResult(299)).toBe(299);
  for(const value of [null,undefined,"0",2.99,-1,Infinity,NaN,10_000_001])
    expect(verifyDishbeeFeeResult(value)).toBeNull();
 });
});
