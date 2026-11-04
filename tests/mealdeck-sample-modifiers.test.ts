import {describe,expect,test} from "bun:test";
import {toggleSampleModifier,setSampleDishModifiers} from "../src/lib/mealdeck-sample-modifiers";
import {sampleLineUnitPrice,summariseSampleBasket,type SampleBasketLine} from "../src/lib/mealdeck-preview-basket";
import type {MenuItem} from "../src/lib/mealdeck";

const item:MenuItem={
  id:"skorch-1",brandId:"skorch-burgers",category:"Burgers",name:"Double Smash",pricePence:999,
  modifierGroups:[{id:"extras",name:"Extras",minSelect:0,maxSelect:2,options:[
    {id:"cheese",name:"Cheese",priceDeltaPence:100},
    {id:"sauce",name:"Sauce",priceDeltaPence:50},
    {id:"spicy",name:"Spicy",priceDeltaPence:0},
  ]}],
};
const base:SampleBasketLine[]=[{item,quantity:2}];
describe("MealDeck sample modifiers",()=>{
  test("adds selected extras with penny-exact pricing across quantities",()=>{
    const result=toggleSampleModifier(base,item.id,"extras","cheese");
    expect(result.changed).toBe(true);
    expect(sampleLineUnitPrice(result.lines[0]!)).toBe(1099);
    expect(summariseSampleBasket(result.lines).subtotalPence).toBe(2198);
    expect(base[0]?.selected).toBeUndefined();
  });
  test("unselecting a chosen modifier restores the base sample price",()=>{
    const added=toggleSampleModifier(base,item.id,"extras","cheese");
    const removed=toggleSampleModifier(added.lines,item.id,"extras","cheese");
    expect(removed.changed).toBe(true);
    expect(summariseSampleBasket(removed.lines).subtotalPence).toBe(1998);
  });
  test("does not accept unknown options or duplicate selections",()=>{
    expect(toggleSampleModifier(base,item.id,"extras","unknown").changed).toBe(false);
    expect(setSampleDishModifiers(base,item.id,[
      {groupId:"extras",optionId:"cheese"},{groupId:"extras",optionId:"cheese"},
    ]).changed).toBe(false);
  });
  test("honours maximum group choice count",()=>{
    const two=setSampleDishModifiers(base,item.id,[
      {groupId:"extras",optionId:"cheese"},{groupId:"extras",optionId:"sauce"},
    ]);
    expect(two.changed).toBe(true);
    expect(toggleSampleModifier(two.lines,item.id,"extras","spicy").changed).toBe(false);
  });
  test("fails closed if an item requires a mandatory selection",()=>{
    const required={...item,modifierGroups:[{...item.modifierGroups![0]!,minSelect:1}]};
    expect(summariseSampleBasket([{item:required,quantity:1}]).valid).toBe(false);
  });
  test("ignores injected prices and impossible modifier prices",()=>{
    expect(setSampleDishModifiers(base,item.id,[{groupId:"extras",optionId:"hacked"}]).reason).toBe("invalid");
    const bad={...item,modifierGroups:[{...item.modifierGroups![0]!,options:[{id:"cheese",name:"Cheese",priceDeltaPence:-1}]}]};
    expect(sampleLineUnitPrice({item:bad,quantity:1,selected:[{groupId:"extras",optionId:"cheese"}]})).toBeNull();
  });
  test("no payment or delivery is inferred from modifiers",()=>{
    const result=setSampleDishModifiers(base,item.id,[{groupId:"extras",optionId:"sauce"}]);
    expect(result.lines).toHaveLength(1);
    expect("paymentStatus" in result).toBe(false);
    expect("deliveryFee" in result).toBe(false);
  });
});
