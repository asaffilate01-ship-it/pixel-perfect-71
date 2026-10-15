/**
 * MealDeck's server talks only to the scoped Dishbee checkout gateway.
 * Dishbee service-role credentials and per-merchant SumUp secrets never enter
 * this storefront, its browser bundle or its deployment environment.
 */

export type GatewayRequest={
  orderId:string;
  handoffCode:string;
  tenantId:string;
  locationId:string;
};
export type GatewayResult=
  | {status:"payment_required";paymentUrl:string}
  | {status:"processing"}
  | {status:"paid"|"pending"};

function gatewaySettings(){
  const url=process.env["DISHBEE_APP_URL"];
  const token=process.env["MEALDECK_CHECKOUT_TOKEN"];
  if(!url||!token||token.length<32)return null;
  try{
    const parsed=new URL(url);
    if(parsed.protocol!=="https:"||parsed.username||parsed.password||
      parsed.pathname!=="/"||parsed.search||parsed.hash)return null;
    return {origin:parsed.origin,token};
  }catch{return null;}
}

export function paymentGatewayAvailable(){return gatewaySettings()!==null;}

export function trustedHostedPaymentUrl(value:string):boolean{
  try{
    const url=new URL(value);
    return url.protocol==="https:"&&url.hostname==="checkout.sumup.com"
      &&url.port===""&&!url.username&&!url.password
      &&url.pathname.startsWith("/pay/")&&!url.hash;
  }catch{return false;}
}

export async function callDishbeeCheckout(
  action:"start"|"status",
  request:GatewayRequest,
):Promise<GatewayResult>{
  const settings=gatewaySettings();
  if(!settings)throw new Error("MealDeck payments are not configured");
  const response=await fetch(settings.origin+"/api/mealdeck/checkout",{
    method:"POST",
    redirect:"error",
    signal:AbortSignal.timeout(15000),
    headers:{
      "content-type":"application/json",
      "authorization":"Bearer "+settings.token,
    },
    body:JSON.stringify({action,...request}),
  });
  if(!response.ok)throw new Error("Dishbee payment gateway unavailable");
  const body=await response.json() as Partial<GatewayResult>;
  if(body.status==="payment_required"&&"paymentUrl" in body
    &&typeof body.paymentUrl==="string"&&trustedHostedPaymentUrl(body.paymentUrl)){
    return {status:"payment_required",paymentUrl:body.paymentUrl};
  }
  if(body.status==="processing"||body.status==="pending"||body.status==="paid"){
    return {status:body.status};
  }
  throw new Error("Dishbee returned an invalid payment result");
}
