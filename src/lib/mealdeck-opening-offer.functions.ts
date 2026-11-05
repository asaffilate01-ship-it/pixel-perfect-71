import { createServerFn } from "@tanstack/react-start";

export const getMealDeckOpeningOfferPublic = createServerFn({ method: "GET" }).handler(async () => {
  const { readOnlineCheckoutStatus } = await import("./mealdeck-online-checkout.server");
  return (await readOnlineCheckoutStatus(process.env)).openingOffer;
});
