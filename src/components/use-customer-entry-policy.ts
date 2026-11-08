import { useEffect, useState } from "react";
import { getMealDeckCustomerEntryPolicy } from "@/lib/mealdeck-customer.functions";
import type { CustomerEntryPolicy } from "@/lib/mealdeck-customer-entry";

/** Bounded backoff after a failed status read (e.g. a server restart). */
export const ENTRY_POLICY_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

/** Refresh on focus and at the scheduled Monday boundary without a browser-time bypass. */
export function useCustomerEntryPolicy() {
  const [policy, setPolicy] = useState<CustomerEntryPolicy | null>(null);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), delay);
    };
    const refresh = async () => {
      const current = ++sequence;
      try {
        const next = await getMealDeckCustomerEntryPolicy();
        if (!active || current !== sequence) return;
        failures = 0;
        setPolicy(next);
        clearTimeout(timer);
        if (next.emailRegistrationDeferred) {
          const remaining = Date.parse(next.registrationResumesAt) - Date.parse(next.serverNow);
          schedule(Math.max(1000, Math.min(remaining + 100, 60_000)));
        }
      } catch {
        // Never enable registration from a failed status read. Keep the last
        // server answer, retry with bounded backoff, and again on focus.
        if (!active || current !== sequence) return;
        const delay = ENTRY_POLICY_RETRY_DELAYS_MS[failures];
        failures += 1;
        if (delay !== undefined) schedule(delay);
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") {
        failures = 0;
        void refresh();
      }
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
