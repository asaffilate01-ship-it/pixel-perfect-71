/** Private order-only handoff communications. No payment or kitchen authority. */
export type OrderCommsMessage = { id:string; sender:"customer"|"staff"; body:string; createdAt:string };
export type OrderCommsSnapshot = {
  state:"not_arrived"|"on_my_way"|"arrived";
  arrivedAt:string|null;
  parkingNote:string|null;
  pin:{ latitude:number;longitude:number;expiresAt:string }|null;
  messages:OrderCommsMessage[];
  serverNow:string;
};
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const stamp=(v:unknown)=>typeof v==="string"&&v.length<=50&&Number.isFinite(Date.parse(v));
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function parseOrderCommsSnapshot(raw:unknown):OrderCommsSnapshot|null{
  if(!record(raw)||!["not_arrived","on_my_way","arrived"].includes(String(raw.state))
    ||!stamp(raw.serverNow)
    ||!(raw.arrivedAt===null||stamp(raw.arrivedAt))
    ||!(raw.parkingNote===null||(typeof raw.parkingNote==="string"&&raw.parkingNote.length<=120))
    ||!Array.isArray(raw.messages)||raw.messages.length>50)return null;
  const messages:OrderCommsMessage[]=[];
  for(const v of raw.messages){
    if(!record(v)||typeof v.id!=="string"||!uuid.test(v.id)
      ||(v.sender!=="customer"&&v.sender!=="staff")
      ||typeof v.body!=="string"||v.body.length<1||v.body.length>500
      ||!stamp(v.createdAt))return null;
    messages.push({id:v.id,sender:v.sender,body:v.body,createdAt:v.createdAt as string});
  }
  const p=raw.pin;
  let pin:OrderCommsSnapshot["pin"]=null;
  if(p!==null){
    if(!record(p)||typeof p.latitude!=="number"||typeof p.longitude!=="number"
       ||p.latitude<49||p.latitude>61||p.longitude< -9||p.longitude>3||!stamp(p.expiresAt))return null;
    if(Date.parse(p.expiresAt as string)>Date.parse(raw.serverNow as string))
      pin={latitude:p.latitude,longitude:p.longitude,expiresAt:p.expiresAt as string};
  }
  return {
    state:raw.state as OrderCommsSnapshot["state"],
    arrivedAt:raw.arrivedAt as string|null,
    parkingNote:raw.parkingNote as string|null,
    pin,messages,serverNow:raw.serverNow as string,
  };
}
export type CustomerCommsKind="read"|"on_my_way"|"arrived"|"message"|"pin";
export function parseCustomerCommsAction(input:unknown):
  {orderId:string;kind:CustomerCommsKind;body:string|null;parkingNote:string|null;latitude:number|null;longitude:number|null}|null{
  if(!record(input)||input.action!=="handoff_comms"
     ||typeof input.orderId!=="string"||!uuid.test(input.orderId)
     ||!["read","on_my_way","arrived","message","pin"].includes(String(input.kind))
     ||Object.keys(input).some(k=>!["action","orderId","kind","body","parkingNote","latitude","longitude"].includes(k)))return null;
  const kind=input.kind as CustomerCommsKind;
  const body=input.body===undefined?null:input.body;
  const parkingNote=input.parkingNote===undefined?null:input.parkingNote;
  const latitude=input.latitude===undefined?null:input.latitude;
  const longitude=input.longitude===undefined?null:input.longitude;
  if(!(body===null||(typeof body==="string"&&body.trim().length>=1&&body.length<=500&&!/[\p{Cc}\p{Cf}]/u.test(body)))
     ||!(parkingNote===null||(typeof parkingNote==="string"&&parkingNote.length<=120&&!/[\p{Cc}\p{Cf}]/u.test(parkingNote)))
     ||!(latitude===null||(typeof latitude==="number"&&Number.isFinite(latitude)&&latitude>=49&&latitude<=61))
     ||!(longitude===null||(typeof longitude==="number"&&Number.isFinite(longitude)&&longitude>= -9&&longitude<=3))
     ||(latitude===null)!==(longitude===null)
     ||(kind==="message"&&(body===null||parkingNote!==null||latitude!==null))
     ||(kind==="pin"&&(latitude===null||body!==null))
     ||(kind==="read"&&(body!==null||parkingNote!==null||latitude!==null))
     ||(kind==="on_my_way"&&(body!==null||latitude!==null))
     ||(kind==="arrived"&&body!==null))return null;
  return {orderId:input.orderId,kind,body:body as string|null,parkingNote:parkingNote as string|null,
          latitude:latitude as number|null,longitude:longitude as number|null};
}
