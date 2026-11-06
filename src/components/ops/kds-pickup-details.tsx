import type { KdsOrder } from "@/lib/mealdeck-kds";

/** Saved contact details are display-only, never a messaging or handover action. */
export function KdsPickupDetails({
  fulfilment,
  pickupContact,
  vehicle,
}: Pick<KdsOrder, "fulfilment" | "pickupContact" | "vehicle">) {
  if (fulfilment !== "pickup" && fulfilment !== "curbside") return null;
  const car = fulfilment === "curbside" ? vehicle : null;
  if (!pickupContact && !car) return null;
  return (
    <dl
      className="md-kds-pickup-details"
      aria-label={fulfilment === "curbside" ? "Kerbside pickup contact" : "Collection contact"}
    >
      {pickupContact && (
        <>
          <div className="md-kds-customer-name">
            <dt>Name</dt>
            <dd>{pickupContact.name}</dd>
          </div>
          <div>
            <dt>WhatsApp number</dt>
            <dd className="md-kds-contact-phone">{pickupContact.phone}</dd>
          </div>
        </>
      )}
      {car && (
        <>
          <div>
            <dt>Car</dt>
            <dd>
              {car.colour} {car.make}
            </dd>
          </div>
          <div>
            <dt>Reg ends</dt>
            <dd className="md-kds-registration">{car.registrationLast4}</dd>
          </div>
        </>
      )}
    </dl>
  );
}
