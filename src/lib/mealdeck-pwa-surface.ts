/** Install identities are navigation conveniences. RPC permissions remain authoritative. */
export function mealDeckPwaSurface(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/printer" || path.startsWith("/printer/")) {
    return {
      kind: "printer",
      name: "MealDeck Printer",
      manifest: "/printer.webmanifest",
      worker: "/printer-sw.js",
      scope: "/printer",
    } as const;
  }
  if (path === "/driver" || path.startsWith("/driver/")) {
    return {
      kind: "driver",
      name: "MealDeck Driver",
      manifest: "/driver.webmanifest",
      worker: "/driver-sw.js",
      scope: "/driver",
    } as const;
  }
  if (path === "/kds" || path.startsWith("/kds/")) {
    return {
      kind: "kds",
      name: "MealDeck Kitchen",
      manifest: "/kds.webmanifest",
      worker: "/kds-sw.js",
      scope: "/kds",
    } as const;
  }
  return {
    kind: "customer",
    name: "MealDeck",
    manifest: "/manifest.webmanifest",
    worker: "/sw.js",
    scope: "/",
  } as const;
}

export function isMealDeckStaffPath(pathname: string) {
  return ["/ops", "/kds", "/printer", "/driver"].some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}
