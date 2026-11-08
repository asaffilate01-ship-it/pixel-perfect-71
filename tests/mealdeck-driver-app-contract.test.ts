import { describe, expect, test } from "bun:test";
import { checkDriverAction, canShareDriverLocation, type DriverJob, type DriverCommand } from "../src/lib/mealdeck-driver-app-contract";
const job:DriverJob={id:"order-job",driverId:"driver-one",status:"at_kitchen",version:2,paid:true,ready:true,sealed:true,pickupVerified:true,deliveryVerified:false};
const cmd:DriverCommand={jobId:"order-job",driverId:"driver-one",version:2,action:"pickup",idempotencyKey:"dispatch_attempt_123"};
describe("driver contract safety",()=>{
  test("verified pickup only",()=>{
    expect(checkDriverAction(job,cmd).allowed).toBe(true);
    for(const patch of [{paid:false},{ready:false},{sealed:false},{pickupVerified:false}])
      expect(checkDriverAction({...job,...patch},cmd).allowed).toBe(false);
  });
  test("reject cross-driver and stale/replayed commands",()=>{
    expect(checkDriverAction(job,{...cmd,driverId:"other"}).allowed).toBe(false);
    expect(checkDriverAction(job,{...cmd,version:1}).allowed).toBe(false);
    expect(checkDriverAction(job,{...cmd,idempotencyKey:"x"}).allowed).toBe(false);
  });
  test("delivery requires verified dropoff",()=>{
    const delivery={...job,status:"at_customer" as const};
    expect(checkDriverAction(delivery,{...cmd,action:"deliver"}).allowed).toBe(false);
    expect(checkDriverAction({...delivery,deliveryVerified:true},{...cmd,action:"deliver"}).allowed).toBe(true);
  });
  test("offer cannot override assignment",()=>{
    const offer={...job,status:"offered" as const};
    expect(checkDriverAction(offer,{...cmd,action:"accept"}).allowed).toBe(false);
    expect(checkDriverAction({...offer,driverId:null},{...cmd,action:"accept"}).allowed).toBe(true);
  });
  test("GPS only with consent and active assignment",()=>{
    const gps={consent:true,onShift:true,activeAssignment:true,accuracyMetres:12,ageSeconds:2};
    expect(canShareDriverLocation(gps)).toBe(true);
    for(const patch of [{consent:false},{onShift:false},{activeAssignment:false},{accuracyMetres:101},{ageSeconds:31}])
      expect(canShareDriverLocation({...gps,...patch})).toBe(false);
  });
});