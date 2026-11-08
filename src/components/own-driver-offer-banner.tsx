import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";

/** Public marketing appears only after the server confirms the driver checkout gate. */
export function useOwnDriverAvailability() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      try {
        const response = await fetch("/api/checkout", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error("Status unavailable");
        const status: unknown = await response.json();
        const result = status && typeof status === "object" && !Array.isArray(status) ? status as Record<string,unknown> : {};
        if (!controller.signal.aborted)
          setAvailable(result["available"] === true && Array.isArray(result["fulfilments"]) && result["fulfilments"].includes("delivery"));
      } catch { if (!controller.signal.aborted) setAvailable(false); }
    };
    void update();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void update(); }, 60_000);
    window.addEventListener("online", update);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("online", update); };
  }, []);
  return available;
}

export function OwnDriverOfferBanner() {
  const available = useOwnDriverAvailability();
  if (!available) return null;
  return (
    <div className="md-own-driver-offer flex flex-wrap items-center justify-center gap-2 bg-amber-300 px-4 py-3 text-center text-sm text-zinc-950 sm:gap-4" role="status" aria-label="Luton free delivery offer">
      <Truck size={18} aria-hidden="true" />
      <span><strong>Due to popular demand: FREE delivery!</strong> Within 3 km of LU4 8NU, for orders of £15+ after discounts. Our own driver · estimated within 60 minutes.</span>
      <Link to="/menus" className="font-bold underline underline-offset-4">Order delivery</Link>
    </div>
  );
}
