import {describe,expect,test} from "bun:test";
import {sampleBasketBarModel} from "../src/lib/mealdeck-sample-basket-bar";

describe("MealDeck mobile sample basket shortcut",()=>{
  test("is absent for an empty sample basket",()=>{
    expect(sampleBasketBarModel({valid:true,dishes:0,brands:0,subtotalPence:0}).visible).toBe(false);
  });
  test("shows pluralised dishes and brands with illustrative subtotal",()=>{
    expect(sampleBasketBarModel({valid:true,dishes:3,brands:2,subtotalPence:2345})).toEqual({
      visible:true,dishLabel:"3 dishes",brandLabel:"2 brands",subtotalPence:2345,
    });
  });
  test("shows singular dishes and brands",()=>{
    const result=sampleBasketBarModel({valid:true,dishes:1,brands:1,subtotalPence:500});
    expect(result.dishLabel).toBe("1 dish");
    expect(result.brandLabel).toBe("1 brand");
  });
  test("does not render an invalid basket as valid or paid",()=>{
    const result=sampleBasketBarModel({valid:false,dishes:10,brands:4,subtotalPence:2500});
    expect(result).toEqual({visible:false,dishLabel:"",brandLabel:"",subtotalPence:null});
    expect("paid" in result).toBe(false);
  });
  test("rejects fractional and negative totals",()=>{
    expect(sampleBasketBarModel({valid:true,dishes:1,brands:1,subtotalPence:1.5}).visible).toBe(false);
    expect(sampleBasketBarModel({valid:true,dishes:-1,brands:1,subtotalPence:100}).visible).toBe(false);
  });
});
