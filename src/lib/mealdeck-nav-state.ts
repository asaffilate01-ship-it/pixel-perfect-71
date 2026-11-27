/** Exact route/hash matches, with the arcade section active across its subpages. */
export type NavTarget={to:string;hash?:string|undefined};
export function isMealDeckNavCurrent(
  pathname:string, hash:string, target:NavTarget,
):boolean{
  if(target.to==="/play"&&!target.hash&&pathname.startsWith("/play/"))return true;
  if(pathname!==target.to)return false;
  const cleanHash=(value:string)=>value.replace(/^#/,"");
  return target.hash
    ? cleanHash(hash)===cleanHash(target.hash)
    : target.to!=="/"||!cleanHash(hash);
}
