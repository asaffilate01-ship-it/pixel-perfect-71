import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { isMealDeckSundayDeliveryPreopen } from "@/lib/mealdeck-launch-schedule";

/** Public marketing appears only after the server confirms the driver checkout gate. */
export function useOwnDriverAvailability() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      try {
        const response = await fetch("/api/checkout", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Status unavailable");
        const status: unknown = await response.json();
        const result =
          status && typeof status === "object" && !Array.isArray(status)
            ? (status as Record<string, unknown>)
            : {};
        if (!controller.signal.aborted)
          setAvailable(
            result["available"] === true &&
              Array.isArray(result["fulfilments"]) &&
              result["fulfilments"].includes("delivery"),
          );
      } catch {
        if (!controller.signal.aborted) setAvailable(false);
      }
    };
    void update();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void update();
    }, 60_000);
    window.addEventListener("online", update);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("online", update);
    };
  }, []);
  return available;
}

/** Informational countdown only: production delivery remains gated by /api/checkout. */
export function useOwnDriverPreopenNotice() {
  const [preopen, setPreopen] = useState(false);
  useEffect(() => {
    const update = () => setPreopen(isMealDeckSundayDeliveryPreopen(Date.now()));
    update();
    const timer = window.setInterval(update, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return preopen;
}

export function OwnDriverOfferBanner() {
  const available = useOwnDriverAvailability();
  const preopen = useOwnDriverPreopenNotice();
  if (!available && !preopen) return null;
  return (
    <div
      className="md-own-driver-offer flex flex-wrap items-center justify-center gap-2 bg-amber-300 px-4 py-3 text-center text-sm text-zinc-950 sm:gap-4"
      role="status"
      aria-label={available ? "Luton free delivery offer" : "Luton delivery launch announcement"}
    >
      <Truck size={18} aria-hidden="true" />
      <span>
        {available ? (
          <>
            <strong>FREE delivery is now available!</strong> Within 3 km of LU4 8NU, with a minimum
            payable order of £15 after all discounts. Our own driver · estimated within 60 minutes.
          </>
        ) : (
          <>
            <strong>FREE delivery planned from 3pm today, Sunday 8 November!</strong> Within 3 km of
            LU4 8NU, on orders paying £15+ after discounts. Starts once the kitchen, printer and
            driver have passed their launch checks.
          </>
        )}
      </span>
      <Link to="/menus" className="font-bold underline underline-offset-4">
        {available ? "Order delivery" : "Explore menus"}
      </Link>
    </div>
  );
}
