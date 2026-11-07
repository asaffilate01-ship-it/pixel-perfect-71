import { createServerFn } from "@tanstack/react-start";
import { customerEntryPolicy } from "./mealdeck-customer-entry";

/** Public VAPID key only. Private signing keys and sender credentials stay server-side. */
export const getMealDeckCustomerPushConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { readCustomerPushAvailability } = await import("./mealdeck-notifications.server");
  const config = await readCustomerPushAvailability(process.env);
  return { publicKey: config.publicKey };
});

/** The registration restart uses server time, not a customer-controlled clock. */
export const getMealDeckCustomerEntryPolicy = createServerFn({ method: "GET" }).handler(() =>
  customerEntryPolicy(),
);
