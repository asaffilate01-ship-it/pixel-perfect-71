import type {MenuItem,LocationKey,FulfilmentType} from "./mealdeck";

export type OfferRule={
  id:string;
  sourceBrandId:string;
  targetBrandId:string;
  sourceKeywords:string[];
  targetKeywords:string[];
  label:string;
  kind:"add"|"upgrade";
  priority:number;
  enabled:boolean;
};
export const DEFAULT_CROSS_BRAND_OFFERS:readonly OfferRule[]=[
  {id:"skorch-loadd",sourceBrandId:"skorch-burgers",targetBrandId:"loadd",
    sourceKeywords:["burger","smash"],targetKeywords:["fries","loaded","mac"],
    label:"Make it loaded: add a side from Load'd",kind:"upgrade",priority:100,enabled:true},
  {id:"skorch-moktl",sourceBrandId:"skorch-burgers",targetBrandId:"moktl",
    sourceKeywords:["burger","smash"],targetKeywords:["cooler","mocktail"],
    label:"Finish with a Moktl mocktail",kind:"add",priority:95,enabled:true},
  {id:"taconelle-moktl",sourceBrandId:"taconelle",targetBrandId:"moktl",
    sourceKeywords:["taco"],targetKeywords:["cooler","mocktail"],
    label:"Try a refreshing Moktl alongside your tacos",kind:"add",priority:90,enabled:true},
  {id:"tavo-vyta",sourceBrandId:"tavo-chicken",targetBrandId:"vyta",
    sourceKeywords:["chicken","wrap"],targetKeywords:["juice","bowl"],
    label:"Add a fresh Vyta pick",kind:"add",priority:85,enabled:true},
];
export type SuggestedOffer={
  id:string;
  label:string;
  kind:OfferRule["kind"];
  sourceBrandId:string;
  target:MenuItem;
  indicativePricePence:number;
};
function contains(text:string,terms:readonly string[]):boolean{
  const value=text.normalize("NFKC").toLowerCase();
  return terms.some(word=>value.includes(word.toLowerCase()));
}
/**
 * Only suggest CURRENT, serviceable catalogue items, never a sample price.
 * A rule is a recommendation, NOT a discounted price or committed item.
 */
export function recommendCrossBrandOffers(input:{
  menu:readonly MenuItem[];
  cart:readonly Pick<MenuItem,"id"|"brandId"|"name">[];
  rules?:readonly OfferRule[];
  limit?:number;
}):SuggestedOffer[]{
  const{menu,cart,rules=DEFAULT_CROSS_BRAND_OFFERS,limit=3}=input;
  if(!cart.length||limit<=0)return[];
  const cartIds=new Set(cart.map(x=>x.id));
  const chosen=new Set<string>();
  const sorted=[...rules].filter(x=>x.enabled).sort((a,b)=>b.priority-a.priority);
  const suggestions:SuggestedOffer[]=[];
  for(const rule of sorted){
    if(!cart.some(line=>line.brandId===rule.sourceBrandId&&contains(line.name,rule.sourceKeywords)))
      continue;
    for(const target of menu){
      if(target.brandId!==rule.targetBrandId||
         !contains(target.name,rule.targetKeywords)||
         cartIds.has(target.id)||chosen.has(target.id)||
         !Number.isSafeInteger(target.pricePence)||target.pricePence<0)continue;
      chosen.add(target.id);
      suggestions.push({id:rule.id+":"+target.id,label:rule.label,kind:rule.kind,
        sourceBrandId:rule.sourceBrandId,target,indicativePricePence:target.pricePence});
      break;
    }
    if(suggestions.length>=limit)break;
  }
  return suggestions;
}

export type GroupContribution={participantId:string;amountPence:number;paidPence:number};
export function groupPaymentProgress(input:{
  totalPence:number;contributions:readonly GroupContribution[];hostCoveredPence?:number;
}):{remainingPence:number;coveredPence:number;fullyCovered:boolean;valid:boolean}{
  const{totalPence,contributions,hostCoveredPence=0}=input;
  const valid=Number.isSafeInteger(totalPence)&&totalPence>=0&&
    Number.isSafeInteger(hostCoveredPence)&&hostCoveredPence>=0&&
    contributions.length<=100&&new Set(contributions.map(c=>c.participantId)).size===contributions.length&&
    contributions.every(c=>c.participantId.length>0&&Number.isSafeInteger(c.amountPence)&&
      Number.isSafeInteger(c.paidPence)&&c.amountPence>=0&&c.paidPence>=0&&c.paidPence<=c.amountPence);
  if(!valid)return{remainingPence:Math.max(0,totalPence||0),coveredPence:0,fullyCovered:false,valid:false};
  const coveredPence=contributions.reduce((n,c)=>n+c.paidPence,hostCoveredPence);
  if(!Number.isSafeInteger(coveredPence)||coveredPence>totalPence)return{remainingPence:totalPence,coveredPence:0,fullyCovered:false,valid:false};
  return{remainingPence:totalPence-coveredPence,coveredPence,fullyCovered:coveredPence===totalPence,valid:true};
}
export function handoffRequirements(fulfilment:FulfilmentType):readonly string[]{
  if(fulfilment==="curbside")return["Verified payment","Vehicle registration","Order handoff code","Staff confirmation at vehicle"];
  if(fulfilment==="delivery")return["Verified payment","Order handoff code","Courier collection verification","Delivery confirmation"];
  if(fulfilment==="pickup")return["Verified payment","Order handoff code","Customer collection verification"];
  return["Verified payment or authorised account","Staff handoff verification"];
}
export function previewFulfilments(location:LocationKey):readonly FulfilmentType[]{
  // Preview labels are not a serviceability decision. Dishbee must authorize.
  return location==="stalbans"?["delivery"]:["delivery","pickup","curbside"];
}
