import {describe,expect,test} from "bun:test";
import {createServiceabilityGeneration} from "../src/lib/mealdeck-serviceability-generation";

describe("postcode serviceability response ordering",()=>{
  test("only most recent network request can update the location",()=>{
    const tracker=createServiceabilityGeneration();
    const first=tracker.start(),second=tracker.start();
    expect(tracker.current(first)).toBe(false);
    expect(tracker.current(second)).toBe(true);
  });
  test("editing postcode invalidates an in-flight response",()=>{
    const tracker=createServiceabilityGeneration();
    const pending=tracker.start();
    tracker.invalidate();
    expect(tracker.current(pending)).toBe(false);
  });
  test("switching fulfilment invalidates old serviceability result",()=>{
    const tracker=createServiceabilityGeneration();
    const delivery=tracker.start();
    tracker.invalidate();
    const pickup=tracker.start();
    expect(tracker.current(delivery)).toBe(false);
    expect(tracker.current(pickup)).toBe(true);
  });
  test("location switch invalidates the previous result",()=>{
    const tracker=createServiceabilityGeneration();
    const initial=tracker.start();
    tracker.invalidate();
    expect(tracker.current(initial)).toBe(false);
  });
  test("rejects zero, negative, missing and noninteger generation IDs",()=>{
    const tracker=createServiceabilityGeneration();
    tracker.start();
    for(const value of [0,-1,1.1,Number.NaN,Number.POSITIVE_INFINITY]){
      expect(tracker.current(value)).toBe(false);
    }
  });
});
