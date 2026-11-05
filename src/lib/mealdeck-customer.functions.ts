import { createServerFn } from "@tanstack/react-start";
import { isWebPushPublicKey } from "./mealdeck-customer";

/** Public VAPID key only. Private signing keys and sender credentials stay server-side. */
export const getMealDeckCustomerPushConfig = createServerFn({ method: "GET" }).handler(() => {
  const key = process.env["MEALDECK_WEB_PUSH_PUBLIC_KEY"]?.trim();
  return { publicKey: isWebPushPublicKey(key) ? key : null };
});
