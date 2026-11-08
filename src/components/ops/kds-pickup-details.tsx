import type { KdsOrder } from "@/lib/mealdeck-kds";

/** Staff-only contact projection. Delivery address is not exposed to public catalogues. */
export function KdsPickupDetails({
  fulfilment,
  pickupContact,
  vehicle,
  deliveryAddress,
  deliveryContact,
}: Pick<
  KdsOrder,
  "fulfilment" | "pickupContact" | "vehicle" | "deliveryAddress" | "deliveryContact"
>) {
  if (fulfilment === "delivery" && deliveryAddress && deliveryContact) {
    return (
      <dl className="md-kds-pickup-details" aria-label="Driver delivery address">
        <div className="md-kds-customer-name">
          <dt>Deliver to</dt>
          <dd>{deliveryContact.name}</dd>
        </div>
        <div>
          <dt>Customer WhatsApp / phone</dt>
          <dd className="md-kds-contact-phone">{deliveryContact.phone}</dd>
        </div>
        <div>
          <dt>Full delivery address</dt>
          <dd className="md-kds-contact-address">
            {[
              deliveryAddress.doorNumber,
              deliveryAddress.roadName,
              deliveryAddress.addressLine2,
              deliveryAddress.postcode,
            ]
              .filter(Boolean)
              .join(", ")}
          </dd>
        </div>
        <div>
          <dt>Delivery promise</dt>
          <dd>Up to 60 minutes after confirmed payment</dd>
        </div>
      </dl>
    );
  }
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
            <dd className="md-kds-contact-phone"><a href={"tel:" + pickupContact.phone} aria-label="Call customer">{pickupContact.phone}</a></dd>
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
