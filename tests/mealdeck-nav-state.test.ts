import {describe,expect,test} from "bun:test";
import {isMealDeckNavCurrent} from "../src/lib/mealdeck-nav-state";
describe("MealDeck primary navigation",()=>{
  test("marks the homepage active until a section is selected",()=>{
    expect(isMealDeckNavCurrent("/","",{to:"/"})).toBe(true);
    expect(isMealDeckNavCurrent("/","#offers",{to:"/"})).toBe(false);
  });
  test("marks precisely the active homepage section, accepting both hash forms",()=>{
    expect(isMealDeckNavCurrent("/","#offers",{to:"/",hash:"offers"})).toBe(true);
    expect(isMealDeckNavCurrent("/","offers",{to:"/",hash:"offers"})).toBe(true);
    expect(isMealDeckNavCurrent("/","#brands",{to:"/",hash:"offers"})).toBe(false);
  });
  test("marks the matching distinct page without accidentally highlighting Home",()=>{
    expect(isMealDeckNavCurrent("/franchise","",{to:"/franchise"})).toBe(true);
    expect(isMealDeckNavCurrent("/franchise","",{to:"/"})).toBe(false);
    expect(isMealDeckNavCurrent("/order","",{to:"/franchise"})).toBe(false);
  });
  test("does not highlight a section from another route",()=>{
    expect(isMealDeckNavCurrent("/play","#offers",{to:"/",hash:"offers"})).toBe(false);
  });
});
