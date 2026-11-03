/** Shared navigation matching: only exact route/hash targets show as active. */
export type NavTarget={to:string;hash?:string};
export function isMealDeckNavCurrent(
  pathname:string, hash:string, target:NavTarget,
):boolean{
  if(pathname!==target.to)return false;
  const cleanHash=(value:string)=>value.replace(/^#/,"");
  return target.hash
    ? cleanHash(hash)===cleanHash(target.hash)
    : target.to!=="/"||!cleanHash(hash);
}
