/**
 * Marketing-only campaign previews. No discount is redeemable, earned,
 * stored or sent to checkout by this module. Dishbee is the sole authority
 * for any future live offers, eligibility, pricing and loyalty rewards.
 */
export const PREVIEW_OFFER_FILTERS = [
  {id:"all",label:"All previews"},
  {id:"basket",label:"Basket deals"},
  {id:"sharing",label:"Sharing"},
  {id:"rewards",label:"Rewards"},
] as const;
export type PreviewOfferCategory=Exclude<(typeof PREVIEW_OFFER_FILTERS)[number]["id"],"all">;
export type PreviewOfferFilter=(typeof PREVIEW_OFFER_FILTERS)[number]["id"];
export type PreviewOffer={
  id:string;rank:string;suit:"burger"|"french-taco"|"chicken"|"cake";
  label:string;value:string;copy:string;category:PreviewOfferCategory;
};
export const PREVIEW_OFFERS:readonly PreviewOffer[]=[
  {id:"burger-ace",rank:"A",suit:"burger",label:"The Burger Ace",value:"FREE",copy:"Spend £21. Get an eligible burger on us.",category:"basket"},
  {id:"perfect-pair",rank:"2",suit:"french-taco",label:"Perfect Pair",value:"½ PRICE",copy:"Buy two identical eligible items and get the second half price.",category:"sharing"},
  {id:"snap",rank:"C",suit:"chicken",label:"Snap!",value:"2 FOR 1",copy:"Selected matching items. Pay for one.",category:"sharing"},
  {id:"group-hand",rank:"M",suit:"cake",label:"The Group Hand",value:"+ POINTS",copy:"Selected group orders earn extra loyalty points.",category:"rewards"},
  {id:"full-house",rank:"H",suit:"burger",label:"Full House Feast",value:"£5 OFF",copy:"Order from three brands with a £30 minimum spend.",category:"basket"},
  {id:"loyalty-flush",rank:"10",suit:"french-taco",label:"The Loyalty Flush",value:"10× PTS",copy:"Your fifth direct order in a month earns 10× points.",category:"rewards"},
];
export function selectPreviewOffers(
  offers:readonly PreviewOffer[],filter:PreviewOfferFilter,max=6,
):PreviewOffer[]{
  if(!PREVIEW_OFFER_FILTERS.some(entry=>entry.id===filter))return [];
  if(!Number.isSafeInteger(max)||max<0||max>100)return [];
  const seen=new Set<string>();
  return offers.filter(offer=>{
    if(!offer.id||seen.has(offer.id))return false;
    seen.add(offer.id);
    return filter==="all"||offer.category===filter;
  }).slice(0,max);
}
