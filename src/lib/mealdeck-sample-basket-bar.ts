import type {SampleBasketSummary} from "./mealdeck-preview-basket";

/**
 * Preview-only basket summary for mobile. Invalid sample data never becomes
 * an order total or a payment call-to-action.
 */
export type SampleBasketBarModel={
  visible:boolean;
  dishLabel:string;
  brandLabel:string;
  subtotalPence:number|null;
};
export function sampleBasketBarModel(summary:SampleBasketSummary):SampleBasketBarModel{
  if(!summary.valid||!Number.isSafeInteger(summary.dishes)||summary.dishes<1||
     !Number.isSafeInteger(summary.brands)||summary.brands<1||
     !Number.isSafeInteger(summary.subtotalPence)||summary.subtotalPence<0)
    return {visible:false,dishLabel:"",brandLabel:"",subtotalPence:null};
  return {
    visible:true,
    dishLabel:`${summary.dishes} ${summary.dishes===1?"dish":"dishes"}`,
    brandLabel:`${summary.brands} ${summary.brands===1?"brand":"brands"}`,
    subtotalPence:summary.subtotalPence,
  };
}
