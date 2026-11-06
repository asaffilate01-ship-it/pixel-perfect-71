import { useEffect, useState } from "react";
import { getMealDeckCustomerEntryPolicy } from "@/lib/mealdeck-customer.functions";
import type { CustomerEntryPolicy } from "@/lib/mealdeck-customer-entry";

/** Refresh on focus and at the scheduled Monday boundary without a browser-time bypass. */
export function useCustomerEntryPolicy() {
  const [policy, setPolicy] = useState<CustomerEntryPolicy | null>(null);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const next = await getMealDeckCustomerEntryPolicy();
        if (!active || current !== sequence) return;
        setPolicy(next);
        clearTimeout(timer);
        if (next.emailRegistrationDeferred) {
          const remaining = Date.parse(next.registrationResumesAt) - Date.parse(next.serverNow);
          timer = setTimeout(
            () => void refresh(),
            Math.max(1000, Math.min(remaining + 100, 60_000)),
          );
        }
      } catch {
        // Never enable registration from a failed status read; retry on focus.
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      sequence++;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return policy;
}
