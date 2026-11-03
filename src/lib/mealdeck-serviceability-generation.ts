/**
 * Monotonic request generation for postcode/fulfilment serviceability checks.
 * Each new check or input edit invalidates all older network responses.
 * Browser-only UI coordination; never a substitute for Dishbee server checks.
 */
export type ServiceabilityGeneration={
  start:()=>number;
  invalidate:()=>void;
  current:(generation:number)=>boolean;
};
export function createServiceabilityGeneration():ServiceabilityGeneration{
  let sequence=0;
  return {
    start(){sequence+=1;return sequence;},
    invalidate(){sequence+=1;},
    current(generation){return Number.isSafeInteger(generation)&&generation>0&&generation===sequence;},
  };
}
