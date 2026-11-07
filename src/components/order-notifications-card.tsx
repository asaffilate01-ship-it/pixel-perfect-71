import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, Check, RefreshCw, Smartphone } from "lucide-react";
import { getMealDeckCustomerAccessToken } from "@/lib/mealdeck-customer-browser";
import type { MealDeckCheckoutMode } from "@/lib/mealdeck-checkout-browser";
import { useMealDeckPwa } from "@/lib/mealdeck-pwa-context";
import {
  disableOrderNotifications,
  enableOrderNotifications,
  matchesOrderPushKey,
  ORDER_PUSH_RECONNECT_MESSAGE,
  ORDER_PUSH_UPDATE_MESSAGE,
  OrderNotificationsError,
  readOrderPushConfig,
  readOrderPushDevice,
  requestOrderNotifications,
  type OrderPushConfig,
} from "@/lib/mealdeck-order-notifications-browser";
import "./order-notifications-card.css";

type DeviceState =
  | "checking"
  | "off"
  | "enabled"
  | "blocked"
  | "home-screen-required"
  | "unsupported"
  | "unavailable"
  | "error";

export function OrderNotificationsCard({
  orderId,
  mode,
}: {
  orderId: string;
  mode: MealDeckCheckoutMode;
}) {
  const headingId = useId();
  const descriptionId = useId();
  const { updateReady, update } = useMealDeckPwa();
  const [config, setConfig] = useState<OrderPushConfig | null>(null);
  const [updateNeeded, setUpdateNeeded] = useState(false);
  const [state, setState] = useState<DeviceState>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const actionPending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const actionControl = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const restoreActionFocus = useRef(false);

  const check = useCallback(async () => {
    if (actionPending.current) return;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    const request = ++generation.current;
    setState("checking");
    setError("");
    try {
      const [configuration, device] = await Promise.allSettled([
        readOrderPushConfig(requestController.signal),
        readOrderPushDevice(),
      ]);
      if (requestController.signal.aborted || request !== generation.current) return;
      if (configuration.status === "rejected") throw configuration.reason;
      setConfig(configuration.value);
      if (device.status === "rejected") {
        if (!configuration.value.available) {
          setState("unavailable");
          return;
        }
        throw device.reason;
      }
      const current = device.value;
      setUpdateNeeded(current.updateReady);
      setEndpoint(current.subscription?.endpoint ?? null);
      // Withdrawal remains accessible even while the sender is unavailable.
      if (current.subscription && current.permission === "granted") {
        const keyMatches =
          !configuration.value.available ||
          matchesOrderPushKey(current.subscription, configuration.value.publicKey);
        const saved = await requestOrderNotifications(
          mode,
          {
            action: "status",
            orderId,
            endpoint: current.subscription.endpoint,
          },
          getMealDeckCustomerAccessToken,
          requestController.signal,
        );
        if (requestController.signal.aborted || request !== generation.current) return;
        setConfig({
          ...configuration.value,
          available:
            configuration.value.available &&
            saved.available === true &&
            keyMatches &&
            !current.updateReady,
        });
        if (current.updateReady) setError(ORDER_PUSH_UPDATE_MESSAGE);
        else if (!keyMatches) setError(ORDER_PUSH_RECONNECT_MESSAGE);
        if (saved.enabled) {
          setState("enabled");
          return;
        }
        if (current.updateReady || !keyMatches) {
          setState("error");
          return;
        }
        if (!saved.available) {
          setState("unavailable");
          return;
        }
      }
      if (configuration.value.available && current.updateReady) {
        setConfig({ ...configuration.value, available: false });
        setState("error");
        setError(ORDER_PUSH_UPDATE_MESSAGE);
        return;
      }
      setState(
        !configuration.value.available
          ? "unavailable"
          : current.support !== "supported"
            ? current.support
            : current.permission === "denied"
              ? "blocked"
              : "off",
      );
    } catch (reason) {
      if (requestController.signal.aborted || request !== generation.current) return;
      setState("error");
      setError(
        reason instanceof Error
          ? reason.message
          : "Order alerts could not be checked. Please try again.",
      );
    }
  }, [mode, orderId]);

  useEffect(() => {
    void check();
    const onFocus = () => {
      void check();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      generation.current += 1;
      controller.current?.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  useEffect(() => {
    if (updateReady && !busy) void check();
  }, [busy, check, updateReady]);

  useEffect(() => {
    if (!busy && state !== "checking" && restoreActionFocus.current) {
      (actionControl.current ?? heading.current)?.focus();
      restoreActionFocus.current = false;
    }
  }, [busy, state]);

  async function changeNotifications(enable: boolean) {
    if (actionPending.current || (enable && !config?.available) || (!enable && !endpoint)) return;
    actionPending.current = true;
    restoreActionFocus.current = true;
    controller.current?.abort();
    const request = ++generation.current;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (enable && config) {
        // No awaited operation may precede this call: iOS needs the original tap.
        const savedEndpoint = await enableOrderNotifications(
          mode,
          orderId,
          config,
          getMealDeckCustomerAccessToken,
        );
        if (request !== generation.current) return;
        setEndpoint(savedEndpoint);
        setState("enabled");
        setMessage("Order alerts are on for this device.");
      } else if (endpoint) {
        await disableOrderNotifications(mode, orderId, endpoint, getMealDeckCustomerAccessToken);
        if (request !== generation.current) return;
        setState(config?.available ? "off" : "unavailable");
        setMessage("Alerts for this order are off on this device.");
      }
    } catch (reason) {
      if (request !== generation.current) return;
      if (reason instanceof OrderNotificationsError) {
        if (
          reason.code === "blocked" ||
          reason.code === "home-screen-required" ||
          reason.code === "unsupported"
        )
          setState(reason.code);
        if (reason.code === "dismissed") setState("off");
        if (enable && (reason.code === "not-ready" || reason.code === "key-changed")) {
          setState("error");
          setConfig((current) => (current ? { ...current, available: false } : current));
          if (reason.message === ORDER_PUSH_UPDATE_MESSAGE) setUpdateNeeded(true);
        }
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "Your order alert choice could not be saved. Please try again.",
      );
    } finally {
      actionPending.current = false;
      if (request === generation.current) setBusy(false);
    }
  }

  const working = busy || state === "checking";
  return (
    <section className="md-order-notifications" aria-labelledby={headingId} aria-busy={working}>
      <div className="md-order-notifications-heading">
        {state === "enabled" && config?.available ? (
          <Check size={23} aria-hidden="true" />
        ) : (
          <Bell size={23} aria-hidden="true" />
        )}
        <h2 id={headingId} ref={heading} tabIndex={-1}>
          Keep up with your order
        </h2>
      </div>
      <p id={descriptionId}>
        {state === "checking"
          ? "Checking notifications on this device…"
          : state === "enabled"
            ? config?.available
              ? "Order alerts are on. We’ll send updates when the kitchen accepts your order, starts preparing it and has it ready for handover."
              : updateNeeded
                ? "Your order alert choice is saved. Update MealDeck to finish setting up alerts on this device. You can follow the live progress here."
                : "Your order alert choice is saved. Sending is temporarily unavailable; follow the live progress on this page."
            : state === "unavailable"
              ? "Order alerts are still being connected. You can follow your order’s live progress on this page."
              : state === "blocked"
                ? "MealDeck notifications are blocked. Allow them in your browser or device settings, then check again."
                : state === "home-screen-required"
                  ? "On iPhone or iPad, notifications work from MealDeck on your home screen. Open the app there and choose to allow them."
                  : state === "unsupported"
                    ? "This browser does not support app notifications. Keep this page available to follow your order’s progress."
                    : state === "error"
                      ? "You can keep following the live progress here while notifications reconnect."
                      : "Get updates when your order is accepted, preparing and ready for handover, even when you leave this page."}
      </p>
      {(state === "off" || state === "enabled") && (
        <p className="md-order-notifications-note">
          Keep your collection code ready. Open this private order to see it at handover.
        </p>
      )}
      <div className="md-order-notifications-actions">
        {state === "off" && config?.available && (
          <button
            type="button"
            className="md-order-notifications-primary"
            ref={actionControl}
            disabled={working}
            aria-describedby={descriptionId}
            onClick={() => {
              void changeNotifications(true);
            }}
          >
            <Bell size={18} aria-hidden="true" />
            {busy ? "Connecting alerts…" : "Notify me about this order"}
          </button>
        )}
        {state === "enabled" && (
          <button
            type="button"
            className="md-order-notifications-secondary"
            ref={actionControl}
            disabled={working}
            onClick={() => {
              void changeNotifications(false);
            }}
          >
            <BellOff size={18} aria-hidden="true" />
            {busy ? "Turning off…" : "Turn off this order’s alerts"}
          </button>
        )}
        {updateNeeded && updateReady && (
          <button
            type="button"
            className="md-order-notifications-secondary"
            disabled={working}
            onClick={update}
          >
            <RefreshCw size={17} aria-hidden="true" /> Update app
          </button>
        )}
        {(["blocked", "error", "unsupported", "unavailable"].includes(state) ||
          (state === "enabled" && !config?.available)) && (
          <button
            type="button"
            className="md-order-notifications-secondary"
            ref={state === "enabled" ? undefined : actionControl}
            disabled={working}
            onClick={() => {
              void check();
            }}
          >
            <RefreshCw size={17} aria-hidden="true" /> Check again
          </button>
        )}
      </div>
      {state === "home-screen-required" && (
        <details className="md-order-notifications-install">
          <summary>
            <Smartphone size={18} aria-hidden="true" /> Add MealDeck to your home screen
          </summary>
          <ol>
            <li>Open MealDeck in Safari and tap the Share button.</li>
            <li>Choose Add to Home Screen and finish adding MealDeck.</li>
            <li>Open MealDeck from its new icon, then choose to allow order alerts.</li>
          </ol>
          {mode === "guest" && (
            <p>
              Keep this browser for the guest order you have already placed. Add MealDeck before
              your next order to use home-screen alerts.
            </p>
          )}
        </details>
      )}
      {error && (
        <p className="md-order-notifications-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="md-order-notifications-message" role="status">
          {message}
        </p>
      )}
      <p className="md-order-notifications-note">
        These alerts are only for this order.{" "}
        {mode === "member" && (
          <>
            Offers are a separate choice.{" "}
            <Link to="/account" search={{}}>
              Manage offer notifications
            </Link>
          </>
        )}
      </p>
      {state === "enabled" && config?.available && (
        <p className="md-order-notifications-note">
          Your phone’s notification and Focus settings control how alerts appear.
        </p>
      )}
    </section>
  );
}
