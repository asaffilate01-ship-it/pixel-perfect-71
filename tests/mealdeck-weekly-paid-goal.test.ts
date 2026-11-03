import {describe,expect,test} from "bun:test";
import {paidOrderGoalRange,summariseWeeklyPaidOrders} from "../src/lib/mealdeck-weekly-paid-goal";
const asOf="2026-11-03";
const range=paidOrderGoalRange(asOf)!;
const source=(daily:{date:string;orders:number;grossPence:number}[]=[])=>({
  periodFrom:range.from,periodTo:range.to,
  paidOrders:daily.reduce((sum,row)=>sum+row.orders,0),daily,
});
describe("MealDeck weekly paid-order north-star metric",()=>{
  test("uses Monday-Sunday buckets and labels current week as partial",()=>{
    expect(range).toEqual({from:"2026-09-14",to:"2026-11-03"});
    const result=summariseWeeklyPaidOrders(source([
      {date:"2026-10-25",orders:4,grossPence:4000},
      {date:"2026-10-26",orders:7,grossPence:8000},
      {date:"2026-11-01",orders:5,grossPence:5000},
      {date:"2026-11-02",orders:3,grossPence:3000},
    ]),asOf)!;
    expect(result.currentWeekToDate).toBe(3);
    expect(result.lastComplete).toBe(12);
    expect(result.precedingComplete).toBe(4);
    expect(result.completeWeekChange).toBe(8);
    expect(result.weeks[0]).toEqual({startsOn:"2026-11-02",endsOn:"2026-11-08",orders:3,period:"week_to_date"});
    expect(result.weeks).toHaveLength(8);
  });
  test("zero activity is an actual zero only with valid complete analytics",()=>{
    const result=summariseWeeklyPaidOrders(source(),asOf);
    expect(result?.weeks.every(row=>row.orders===0)).toBe(true);
  });
  test("never treats malformed or partial data as zero sales",()=>{
    expect(summariseWeeklyPaidOrders({...source(),paidOrders:1},asOf)).toBeNull();
    expect(summariseWeeklyPaidOrders({...source(),periodFrom:"2026-10-01"},asOf)).toBeNull();
    expect(summariseWeeklyPaidOrders({...source(),periodTo:"2026-11-02"},asOf)).toBeNull();
  });
  test("rejects duplicate, future and out-of-window dates",()=>{
    const same={date:"2026-11-02",orders:1,grossPence:100};
    expect(summariseWeeklyPaidOrders(source([same,same]),asOf)).toBeNull();
    expect(summariseWeeklyPaidOrders(source([{...same,date:"2026-11-05"}]),asOf)).toBeNull();
    expect(summariseWeeklyPaidOrders(source([{...same,date:"2026-09-13"}]),asOf)).toBeNull();
  });
  test("rejects negative/fractional counts and impossible dates",()=>{
    expect(summariseWeeklyPaidOrders(source([{date:"2026-11-02",orders:-1,grossPence:0}]),asOf)).toBeNull();
    expect(summariseWeeklyPaidOrders(source([{date:"2026-11-02",orders:1.5,grossPence:0}]),asOf)).toBeNull();
    expect(summariseWeeklyPaidOrders(source([{date:"2026-02-30",orders:1,grossPence:10}]),asOf)).toBeNull();
    expect(paidOrderGoalRange("2026-02-30")).toBeNull();
  });
  test("does not substitute checkout attempts for paid order counts",()=>{
    const result=summariseWeeklyPaidOrders(source([{date:"2026-11-02",orders:1,grossPence:999}]),asOf);
    expect(result?.currentWeekToDate).toBe(1);
    expect(result?.lastComplete).toBe(0);
  });
});
