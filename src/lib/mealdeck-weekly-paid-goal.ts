/**
 * MealDeck north-star KPI: orders recorded as paid per Monday-Sunday week.
 * The ONLY input is the authorised Dishbee analytics RPC (paid_at). Never
 * count checkout attempts, baskets, KDS tickets, or estimated sales.
 * All date labels use Dishbee's reporting calendar dates, not browser locale.
 */
export type DailyPaidCount={date:string;orders:number;grossPence:number};
export type PaidAnalyticsSource={
  periodFrom:string;periodTo:string;paidOrders:number;
  daily:readonly DailyPaidCount[];
};
export type PaidWeek={
  startsOn:string;endsOn:string;orders:number;
  period:"complete"|"week_to_date";
};
export type WeeklyPaidGoal={
  weeks:PaidWeek[];
  lastComplete:number;
  precedingComplete:number;
  completeWeekChange:number;
  currentWeekToDate:number;
};
const DAY=86_400_000;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
function dayNumber(value:string):number|null{
  if(!datePattern.test(value))return null;
  const [year,month,day]=value.split("-").map(Number);
  if(year===undefined||month===undefined||day===undefined)return null;
  const ms=Date.UTC(year,month-1,day);
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)return null;
  return Math.floor(ms/DAY);
}
function dayString(value:number):string{return new Date(value*DAY).toISOString().slice(0,10);}
function monday(day:number):number{
  const weekday=(new Date(day*DAY).getUTCDay()+6)%7;
  return day-weekday;
}
/** Eight Monday-starting weeks, including the current partial week. */
export function paidOrderGoalRange(asOf:string):{from:string;to:string}|null{
  const current=dayNumber(asOf);
  if(current===null)return null;
  return {from:dayString(monday(current)-49),to:asOf};
}
/** Fail closed on incomplete, contradictory or malformed provider analytics. */
export function summariseWeeklyPaidOrders(
  source:PaidAnalyticsSource,
  asOf:string,
):WeeklyPaidGoal|null{
  const range=paidOrderGoalRange(asOf);
  const asDay=dayNumber(asOf);
  if(!range||asDay===null||source.periodFrom!==range.from||source.periodTo!==range.to||
    !Number.isSafeInteger(source.paidOrders)||source.paidOrders<0||
    !Array.isArray(source.daily))return null;
  const from=dayNumber(range.from);
  if(from===null)return null;
  const byWeek=new Map<number,number>();
  const seen=new Set<number>();
  let total=0;
  for(const row of source.daily){
    const day=dayNumber(row.date);
    if(day===null||day<from||day>asDay||seen.has(day)||
      !Number.isSafeInteger(row.orders)||row.orders<0||
      !Number.isSafeInteger(row.grossPence)||row.grossPence<0)return null;
    seen.add(day);
    total+=row.orders;
    if(!Number.isSafeInteger(total))return null;
    const start=monday(day);
    byWeek.set(start,(byWeek.get(start)??0)+row.orders);
  }
  if(total!==source.paidOrders)return null;
  const currentMonday=monday(asDay);
  const weeks=Array.from({length:8},(_,index)=>{
    const start=currentMonday-index*7;
    return {
      startsOn:dayString(start),
      endsOn:dayString(start+6),
      orders:byWeek.get(start)??0,
      period:index===0?"week_to_date" as const:"complete" as const,
    };
  });
  const lastComplete=weeks[1]!.orders;
  const precedingComplete=weeks[2]!.orders;
  return {
    weeks,lastComplete,precedingComplete,
    completeWeekChange:lastComplete-precedingComplete,
    currentWeekToDate:weeks[0]!.orders,
  };
}
