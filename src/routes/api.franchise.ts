import { createFileRoute } from "@tanstack/react-router";

function endpoint(request:Request){
  const base=process.env.OMNIQORA_PUBLIC_API_URL?.trim();
  if(!base)throw new Error("OMNIQORA_PUBLIC_API_URL is not configured");
  const source=new URL(request.url);
  const target=new URL(base);
  source.searchParams.forEach((value,key)=>target.searchParams.set(key,value));
  return target;
}

async function proxy(request:Request){
  try{
    const target=endpoint(request);
    const init:RequestInit={method:request.method,headers:{"Accept":"application/json"}};
    if(request.method==="POST"){
      init.headers={"Accept":"application/json","Content-Type":"application/json"};
      init.body=await request.text();
    }
    const response=await fetch(target,init);
    const body=await response.text();
    return new Response(body,{status:response.status,headers:{"Content-Type":response.headers.get("content-type")||"application/json","Cache-Control":"no-store"}});
  }catch(error){
    console.error("[franchise-proxy]",error);
    return Response.json({ok:false,error:"Franchise service is temporarily unavailable."},{status:503});
  }
}

export const Route=createFileRoute("/api/franchise")({
  server:{handlers:{GET:({request})=>proxy(request),POST:({request})=>proxy(request)}}
});
