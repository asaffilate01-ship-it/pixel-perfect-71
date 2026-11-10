import { describe, expect, test } from "bun:test";
import { driverActions, driverDirectionsUrl, parseDriverPortal, type DriverJobCard } from "../src/lib/mealdeck-driver-app-view";
const uid="f1234567-1234-4123-8123-123456789012";
const base:DriverJobCard={
  jobId:uid,status:"offered",version:1,offeredUntil:"2026-11-09T14:00:00+00:00",
  driverStatus:"awaiting_driver",postcode:"LU4 8NU",address:null,
  customerName:null,customerPhone:null,createdAt:"2026-11-09T13:30:00+00:00",
};
describe("MealDeck driver application",()=>{
  test("rejects unverified or excessive job payloads",()=>{
    expect(parseDriverPortal({displayName:"Courier",onShift:true,jobs:[base]}).jobs).toHaveLength(1);
    expect(()=>parseDriverPortal({displayName:"Courier",onShift:true,jobs:[{...base,secret:"leak"}]})).toThrow();
    expect(()=>parseDriverPortal({displayName:"Courier",onShift:true,jobs:[{...base,version:0}]})).toThrow();
    expect(()=>parseDriverPortal({displayName:"Courier",onShift:true,jobs:Array(16).fill(base)})).toThrow();
  });
  test("expired offers cannot be accepted",()=>{
    expect(driverActions(base,Date.parse("2026-11-09T14:01:00Z"))).toEqual([]);
    expect(driverActions(base,Date.parse("2026-11-09T13:45:00Z")).map(x=>x.action)).toEqual(["accept","decline"]);
  });
  test("pickup is gated by real kitchen handover",()=>{
    const kitchen={...base,status:"at_kitchen" as const};
    expect(driverActions(kitchen,0)[0]?.disabledReason).toContain("Kitchen");
    expect(driverActions({...kitchen,driverStatus:"with_driver"},0)[0]?.disabledReason).toBeUndefined();
  });
  test("delivered is only a KDS-authoritative outcome",()=>{
    expect(driverActions({...base,status:"dropoff_reported"},0)).toEqual([]);
    expect(driverActions({...base,status:"at_customer"},0)[0]?.action).toBe("report_dropoff");
    expect(driverActions({...base,driverStatus:"delivered"},0)).toEqual([]);
  });
  test("address/navigation never shown before assignment",()=>{
    const addr={postcode:"LU4 8NU",doorNumber:"12",roadName:"Example Road",addressLine2:""};
    expect(driverDirectionsUrl(base)).toBeNull();
    expect(driverDirectionsUrl({...base,address:addr})).toBeNull();
    const url=driverDirectionsUrl({...base,status:"assigned",address:addr});
    expect(url).toContain("google.com/maps/dir/");
    expect(url).toContain("destination=12%2C%20Example%20Road%2C%20LU4%208NU%2C%20UK");
    expect(url).toContain("travelmode=driving");
    expect(url).toContain("dir_action=navigate");
    expect(url).not.toContain("origin=");
    expect(url).not.toContain("token=");
    expect(driverDirectionsUrl({...base,status:"declined",address:addr})).toBeNull();
  });
});
