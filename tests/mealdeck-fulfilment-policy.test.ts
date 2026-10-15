import { describe, expect, test } from "bun:test";
import {
  mealDeckLaunchFulfilments,
  isMealDeckLaunchFulfilmentAllowed,
} from "../src/lib/mealdeck-fulfilment-policy";

describe("MealDeck launch fulfilment policy", () => {
  test("St Albans MealDeck is delivery-only", () => {
    expect(mealDeckLaunchFulfilments.stalbans).toEqual(["delivery"]);
    expect(isMealDeckLaunchFulfilmentAllowed("stalbans", "delivery")).toBe(true);
    expect(isMealDeckLaunchFulfilmentAllowed("stalbans", "pickup")).toBe(false);
    expect(isMealDeckLaunchFulfilmentAllowed("stalbans", "curbside")).toBe(false);
    expect(isMealDeckLaunchFulfilmentAllowed("stalbans", "dinein")).toBe(false);
  });

  test("Luton permits delivery, collection and kerbside but not dine-in", () => {
    expect(mealDeckLaunchFulfilments.luton).toEqual(["delivery", "pickup", "curbside"]);
    expect(isMealDeckLaunchFulfilmentAllowed("luton", "delivery")).toBe(true);
    expect(isMealDeckLaunchFulfilmentAllowed("luton", "pickup")).toBe(true);
    expect(isMealDeckLaunchFulfilmentAllowed("luton", "curbside")).toBe(true);
    expect(isMealDeckLaunchFulfilmentAllowed("luton", "dinein")).toBe(false);
  });
});
