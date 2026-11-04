import {describe,expect,test} from "bun:test";
import {
  clearSampleBasket,restoreRemovedSampleDish,setSampleDishQuantity,
} from "../src/lib/mealdeck-sample-basket-edit";
import {summariseSampleBasket,type SampleBasketLine} from "../src/lib/mealdeck-preview-basket";
import type {MenuItem} from "../src/lib/mealdeck";

const burger:MenuItem={id:"skorch-1",brandId:"skorch-burgers",category:"Burgers",name:"Double Smash",pricePence:999};
const drink:MenuItem={id:"moktl-1",brandId:"moktl",category:"Drinks",name:"Citrus Cooler",pricePence:425};
const basket:SampleBasketLine[]=[{item:burger,quantity:2},{item:drink,quantity:1}];

describe("sample deck editing",()=>{
  test("sets exact quantities using trusted item price",()=>{
    const result=setSampleDishQuantity(basket,burger.id,3);
    expect(result.changed).toBe(true);
    expect(result.lines[0]?.quantity).toBe(3);
    expect(summariseSampleBasket(result.lines).subtotalPence).toBe(3422);
    expect(basket[0]?.quantity).toBe(2);
  });
  test("zero quantity removes only the selected dish",()=>{
    const result=setSampleDishQuantity(basket,burger.id,0);
    expect(result.lines.map(line=>line.item.id)).toEqual([drink.id]);
    expect(summariseSampleBasket(result.lines)).toEqual({
      valid:true,dishes:1,brands:1,subtotalPence:425,
    });
  });
  test("rejects absent items and invalid quantity without mutating basket",()=>{
    for(const quantity of [-1,21,1.5,Number.NaN,Number.POSITIVE_INFINITY]){
      expect(setSampleDishQuantity(basket,burger.id,quantity).changed).toBe(false);
    }
    expect(setSampleDishQuantity(basket,"foreign",2).reason).toBe("unknown_item");
    expect(basket[0]?.quantity).toBe(2);
  });
  test("blocks quantities that exceed the overall sample basket limit",()=>{
    const sixty:SampleBasketLine[]=[
      {item:burger,quantity:20},{item:drink,quantity:20},
      {item:{...drink,id:"icova-1",brandId:"icova"},quantity:20},
    ];
    expect(setSampleDishQuantity(sixty,burger.id,21).changed).toBe(false);
    expect(setSampleDishQuantity(sixty,burger.id,19).changed).toBe(true);
    expect(setSampleDishQuantity(sixty,burger.id,20).changed).toBe(false);
  });
  test("rejects totals exceeding the maximum illustrative basket value",()=>{
    const pricey={...burger,pricePence:5_100_000};
    const lines:SampleBasketLine[]=[{item:pricey,quantity:1}];
    expect(setSampleDishQuantity(lines,pricey.id,2).reason).toBe("limit_reached");
  });
  test("can clear a valid basket without creating an order",()=>{
    expect(clearSampleBasket(basket).lines).toEqual([]);
    expect(clearSampleBasket([]).changed).toBe(false);
    expect(clearSampleBasket([{item:burger,quantity:-1}]).reason).toBe("invalid_basket");
  });
  test("undo gets current catalogue item rather than trusting removed price",()=>{
    const removed=basket[0]!;
    const remaining=[basket[1]!];
    const updated={...burger,pricePence:1099};
    const result=restoreRemovedSampleDish(remaining,removed,[updated,drink]);
    expect(result.changed).toBe(true);
    expect(result.lines[1]?.item.pricePence).toBe(1099);
    expect(result.lines[1]?.quantity).toBe(2);
  });
  test("undo refuses removed or incompatible catalogue items",()=>{
    expect(restoreRemovedSampleDish([basket[1]!],basket[0]!,[drink]).changed).toBe(false);
    expect(restoreRemovedSampleDish([basket[1]!],basket[0]!,[{...burger,brandId:"other"},drink]).changed).toBe(false);
    expect(restoreRemovedSampleDish(basket,basket[0]!,[burger,drink]).changed).toBe(false);
    expect(restoreRemovedSampleDish([],null,[burger]).changed).toBe(false);
  });
});
