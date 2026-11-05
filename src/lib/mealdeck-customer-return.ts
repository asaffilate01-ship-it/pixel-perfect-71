/** Fixed same-site destinations only. Never accept an arbitrary post-auth redirect. */
export type CustomerReturnTarget = "/menus" | "/checkout" | "/checkout?group=1" | "/group-pay";

export function customerReturnTarget(value: unknown): CustomerReturnTarget {
  return value === "/checkout" || value === "/checkout?group=1" || value === "/group-pay"
    ? value
    : "/menus";
}

export function customerEmailReturnPath(value: unknown) {
  const target = customerReturnTarget(value);
  return target === "/menus" ? "/account" : "/account?returnTo=" + encodeURIComponent(target);
}
