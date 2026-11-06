import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomerEntryPolicy } from "@/components/use-customer-entry-policy";
import {
  getMealDeckCustomerAccessToken,
  initializeMealDeckCustomerClient,
  readMealDeckCustomerAccount,
  subscribeMealDeckCustomerAuth,
  type CustomerAccountState,
} from "@/lib/mealdeck-customer-browser";
import {
  CHECKOUT_MODE_KEY,
  requestMealDeckCheckout,
  type MealDeckCheckoutMode,
} from "@/lib/mealdeck-checkout-browser";
import {
  GUEST_PRIVACY_VERSION,
  normaliseGuestInput,
  parseGuestCheckoutState,
  type GuestCheckoutState,
} from "@/lib/mealdeck-guest";

export function usePaymentIdentity() {
  const entryPolicy = useCustomerEntryPolicy();
  const [mode, setMode] = useState<MealDeckCheckoutMode>("member");
  const [account, setAccount] = useState<CustomerAccountState | null>(null);
  const [guest, setGuest] = useState<GuestCheckoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountIssue, setAccountIssue] = useState("");
  const [guestIssue, setGuestIssue] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [details, setDetails] = useState({ name: "", email: "", phone: "" });
  const active = useRef(true);
  const revision = useRef(0);
  const savingGuest = useRef(false);
  const modeChosen = useRef(false);
  useEffect(() => {
    if (!entryPolicy || modeChosen.current) return;
    try {
      const saved = sessionStorage.getItem(CHECKOUT_MODE_KEY);
      if (saved === "member" || saved === "guest") {
        setMode(saved);
        modeChosen.current = true;
        return;
      }
    } catch {
      /* No persisted choice. */
    }
    setMode(entryPolicy.emailRegistrationDeferred ? "guest" : "member");
  }, [entryPolicy]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (savingGuest.current) return;
    const requestId = ++revision.current;
    setLoading(true);
    const [memberResult, guestResult] = await Promise.allSettled([
      (async () => {
        await initializeMealDeckCustomerClient();
        return readMealDeckCustomerAccount();
      })(),
      (async () => {
        const response = await fetch("/api/checkout", {
          credentials: "same-origin",
          cache: "no-store",
          ...(signal ? { signal } : {}),
        });
        if (!response.ok) throw new Error("Guest payment availability could not be checked.");
        const result = (await response.json()) as { guestCheckout?: unknown };
        const parsed = parseGuestCheckoutState(result.guestCheckout);
        if (!parsed) throw new Error("Guest payment availability could not be checked.");
        return parsed;
      })(),
    ]);
    if (!active.current || signal?.aborted || requestId !== revision.current) return;
    if (memberResult.status === "fulfilled") {
      setAccount(memberResult.value);
      setAccountIssue("");
    } else {
      setAccount(null);
      setAccountIssue("Your member account could not be checked. Sign in again or retry.");
    }
    if (guestResult.status === "fulfilled") {
      setGuest(guestResult.value);
      setGuestIssue("");
    } else {
      setGuest(null);
      setGuestIssue("Guest payment availability could not be checked. Please retry.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    let unsubscribe: (() => void) | undefined;
    try {
      if (sessionStorage.getItem(CHECKOUT_MODE_KEY) === "guest") setMode("guest");
    } catch {
      /* Explicit choice still works. */
    }
    void refresh(controller.signal);
    void initializeMealDeckCustomerClient()
      .then(() => {
        if (active.current)
          unsubscribe = subscribeMealDeckCustomerAuth(() => {
            void refresh(controller.signal);
          });
      })
      .catch(() => {
        /* The explicit account error is shown by refresh. */
      });
    const visible = () => {
      if (document.visibilityState === "visible") void refresh(controller.signal);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active.current = false;
      revision.current += 1;
      controller.abort();
      unsubscribe?.();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  function chooseMode(next: MealDeckCheckoutMode) {
    if (savingGuest.current) return;
    modeChosen.current = true;
    setMode(next);
    try {
      sessionStorage.setItem(CHECKOUT_MODE_KEY, next);
    } catch {
      /* Choice remains local to this page. */
    }
  }

  async function saveGuest() {
    if (guestBusy || !guest?.eligible || mode !== "guest") return false;
    setGuestIssue("");
    let contact: ReturnType<typeof normaliseGuestInput>;
    try {
      contact = normaliseGuestInput({
        action: "guest",
        ...details,
        privacyVersion: GUEST_PRIVACY_VERSION,
      });
    } catch (problem) {
      setGuestIssue(problem instanceof Error ? problem.message : "Check your contact details.");
      return false;
    }
    const requestId = ++revision.current;
    savingGuest.current = true;
    setGuestBusy(true);
    try {
      const result = await requestMealDeckCheckout<{ guestCheckout?: unknown }>(
        "guest",
        {
          action: "guest",
          ...contact,
          privacyVersion: GUEST_PRIVACY_VERSION,
        },
        getMealDeckCustomerAccessToken,
      );
      const next = parseGuestCheckoutState(result.guestCheckout);
      if (!next?.session) throw new Error("Your guest details could not be saved. Please retry.");
      if (!active.current || requestId !== revision.current) return false;
      setDetails({ ...contact, email: contact.email ?? "" });
      setGuest(next);
      setLoading(false);
      return true;
    } catch (problem) {
      if (active.current && requestId === revision.current)
        setGuestIssue(
          problem instanceof Error ? problem.message : "Your guest details could not be saved.",
        );
      return false;
    } finally {
      savingGuest.current = false;
      if (active.current) {
        setGuestBusy(false);
        setLoading(false);
      }
    }
  }

  const memberReady = account?.status === "signed_in" && account.profile.registered;
  return {
    registrationDeferred: entryPolicy?.emailRegistrationDeferred !== false,
    mode,
    chooseMode,
    account,
    guest,
    loading,
    accountIssue,
    guestIssue,
    guestBusy,
    details,
    setDetails,
    saveGuest,
    refresh,
    ready: !loading && !guestBusy && (mode === "member" ? memberReady : !!guest?.session),
  };
}

export type PaymentIdentityState = ReturnType<typeof usePaymentIdentity>;
