/** Internal-facing money calculations; not a payment or settlement service. */
export function poundsToPence(value:string):number|null{
  if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim()))return null;
  const [major,minor=""]=value.trim().split(".");
  const total=Number(major)*100+Number(minor.padEnd(2,"0"));
  return Number.isSafeInteger(total)&&total>=0?total:null;
}
export function penceToPounds(pence:number|bigint|null|undefined):string{
  if(typeof pence==="bigint"){
    const positive=pence<0n?-pence:pence;
    return (pence<0n?"-":"")+"£"+(positive/100n).toString()+"."+(positive%100n).toString().padStart(2,"0");
  }
  if(!Number.isFinite(pence??NaN))return "—";
  return (pence!<0?"-":"")+"£"+(Math.abs(pence!)/100).toFixed(2);
}
export function packCostPerBaseUnit(
  packPricePence:number,quantityInBaseUnits:number,
):number|null{
  if(!Number.isSafeInteger(packPricePence)||packPricePence<0||
     !Number.isFinite(quantityInBaseUnits)||quantityInBaseUnits<=0||
     quantityInBaseUnits>1e9)return null;
  const cost=packPricePence/quantityInBaseUnits;
  return Number.isFinite(cost)&&cost<=1e6?Math.round(cost*1e6)/1e6:null;
}
export function estimatedRecipeMargin(
  salePence:number,estimatedFoodCostPence:number|null,
):{foodCostPercent:number;estimatedContributionPence:number}|null{
  if(!Number.isSafeInteger(salePence)||salePence<=0||
     estimatedFoodCostPence===null||!Number.isSafeInteger(estimatedFoodCostPence)||
     estimatedFoodCostPence<0)return null;
  return{
    foodCostPercent:Math.round(estimatedFoodCostPence/salePence*10000)/100,
    estimatedContributionPence:salePence-estimatedFoodCostPence,
  };
}
export type DailyOpsPoint={date:string;orders:number;grossPence:number};
export function cleanDailySeries(value:unknown):DailyOpsPoint[]{
  if(!Array.isArray(value))return[];
  return value.filter((row):row is DailyOpsPoint=>
    !!row&&typeof row==="object"&&
    /^\d{4}-\d{2}-\d{2}$/.test((row as DailyOpsPoint).date)&&
    Number.isSafeInteger((row as DailyOpsPoint).orders)&&
    Number.isSafeInteger((row as DailyOpsPoint).grossPence)&&
    (row as DailyOpsPoint).orders>=0&&(row as DailyOpsPoint).grossPence>=0).slice(0,94);
}
