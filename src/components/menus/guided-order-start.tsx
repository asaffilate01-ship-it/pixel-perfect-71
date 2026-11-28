import { useEffect, useRef, useState } from "react";
import { ArrowRight, CarFront, Check, MapPin, ShoppingBag, Truck } from "lucide-react";
import { normaliseUkPostcode } from "@/lib/mealdeck-own-driver-delivery";
import { deliveryAreaRejectionMessage } from "@/lib/mealdeck-delivery-postcode-notice";
import { requestMealDeckCheckout } from "@/lib/mealdeck-checkout-browser";
import { clearGuidedOrderMethod, guidedMenuReady, readGuidedDeliveryPostcode, readGuidedOrderMethod, rememberGuidedOrderMethod, type GuidedOrderMethod } from "@/lib/mealdeck-guided-order";

const choices = [
  { method: "delivery", title: "Delivery", description: "To your door · check postcode", Icon: Truck },
  { method: "pickup", title: "Pickup", description: "Collect inside our Luton kitchen", Icon: ShoppingBag },
  { method: "curbside", title: "Kerbside", description: "We bring your food to your car", Icon: CarFront },
] as const;

export function useGuidedMenuStart(deliveryLive: boolean) {
  const [method, setMethod] = useState<GuidedOrderMethod | null>(null);
  const [postcode, setPostcode] = useState("");
  const [verifiedPostcode, setVerifiedPostcode] = useState<string | null>(null);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const remembered = readGuidedDeliveryPostcode();
    setMethod(readGuidedOrderMethod());
    setPostcode(remembered);
    setVerifiedPostcode(remembered || null);
    return () => { generation.current++; };
  }, []);
  const ready = guidedMenuReady(method, deliveryLive, postcode, verifiedPostcode);
  function choose(next: GuidedOrderMethod | null) {
    generation.current++;
    clearGuidedOrderMethod();
    setMethod(next);
    setPostcode("");
    setVerifiedPostcode(null);
    setIssue("");
    setBusy(false);
    if (next === "pickup" || next === "curbside") rememberGuidedOrderMethod(next);
  }
  function editPostcode(value: string) {
    generation.current++;
    clearGuidedOrderMethod();
    setPostcode(value);
    setVerifiedPostcode(null);
    setBusy(false);
    setIssue("");
  }
  async function checkPostcode() {
    const canonical = normaliseUkPostcode(postcode);
    if (!canonical || method !== "delivery" || !deliveryLive) {
      setIssue("Enter a valid UK postcode and check delivery availability.");
      return;
    }
    const request = ++generation.current;
    setBusy(true);
    setIssue("");
    setVerifiedPostcode(null);
    try {
      const result = await requestMealDeckCheckout<{ eligible?: boolean; postcode?: string; distanceMetres?: number | null }>(
        "guest", { action: "delivery_area", postcode: canonical }, async () => null,
      );
      if (request !== generation.current) return;
      if (result.postcode !== canonical || typeof result.eligible !== "boolean" ||
          (result.eligible && (typeof result.distanceMetres !== "number" || !Number.isFinite(result.distanceMetres))))
        throw new Error("Invalid postcode response.");
      if (!result.eligible) {
        setIssue(deliveryAreaRejectionMessage(result.distanceMetres ?? null));
        return;
      }
      setPostcode(canonical);
      setVerifiedPostcode(canonical);
      rememberGuidedOrderMethod("delivery", canonical);
    } catch {
      if (request === generation.current) setIssue("We couldn't check delivery just now. Retry or choose pickup or kerbside.");
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  return { method, postcode, verifiedPostcode, issue, busy, ready, choose, editPostcode, checkPostcode, deliveryLive };
}

export function GuidedOrderStart({ flow, onChoice }: { flow: ReturnType<typeof useGuidedMenuStart>; onChoice: () => void }) {
  const selected = choices.find(choice => choice.method === flow.method);
  return (
    <section className="lm-order-start" aria-label="Choose how to receive your order">
      <div className="lm-order-start-heading">
        <div>
          <span className="lm-eyebrow">Step 1 · How to receive your food</span>
          <h2>{flow.ready ? selected?.title : "How would you like your order?"}</h2>
          <p><MapPin size={16} aria-hidden="true" /> Luton · 314–318 Selbourne Road, LU4 8NU</p>
        </div>
        {flow.ready && <button type="button" className="lm-order-change" onClick={() => flow.choose(null)}>Change method</button>}
      </div>
      {!flow.ready && <div className="lm-order-methods" role="group" aria-label="Order fulfilment method">
        {choices.map(({ method, title, description, Icon }) => (
          <button key={method} type="button" aria-pressed={flow.method === method}
            disabled={method === "delivery" && !flow.deliveryLive}
            onClick={() => { onChoice(); flow.choose(method); }}>
            <Icon size={26} aria-hidden="true" />
            <span><strong>{title}</strong><small>{method === "delivery" && !flow.deliveryLive ? "Currently unavailable or checking" : description}</small></span>
            {flow.method === method && <Check size={20} aria-hidden="true" />}
          </button>
        ))}
      </div>}
      {flow.method === "delivery" && !flow.ready && <div className="lm-order-postcode">
        <label>Delivery postcode
          <input value={flow.postcode} maxLength={20} autoComplete="postal-code" placeholder="e.g. LU4 8NU"
            onChange={event => flow.editPostcode(event.target.value)} />
        </label>
        <button type="button" className="lm-primary" disabled={flow.busy || !flow.deliveryLive}
          onClick={() => { onChoice(); void flow.checkPostcode(); }}>{flow.busy ? "Checking…" : "Check postcode"} <ArrowRight size={18} aria-hidden="true" /></button>
        <p>Free delivery within 4 km of LU4 8NU on eligible orders of £15 or more after discounts. Final availability and prices are checked before payment.</p>
        {flow.issue && <p role="alert" className="lm-order-error">{flow.issue}</p>}
      </div>}
      {flow.ready && <p role="status" className="lm-order-confirmed"><Check size={17} aria-hidden="true" /> {flow.method === "delivery" ? "Postcode checked. Final delivery availability will be rechecked at checkout." : "Collection location selected. Choose your food below."}</p>}
    </section>
  );
}
