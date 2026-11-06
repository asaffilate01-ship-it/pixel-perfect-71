import { useEffect, useRef, useState } from "react";
import { Check, Info, RotateCcw, X } from "lucide-react";
import "@/styles.launch-feedback.css";

export type LaunchBasketUpdate = { message: string; tone?: "success" | "info" };

type BasketNoticeProps = {
  update: LaunchBasketUpdate;
  canUndo: boolean;
  onUndo: () => void;
  onDismiss: () => void;
  onExpire: (update: LaunchBasketUpdate) => void;
};

function BasketNotice({ update, canUndo, onUndo, onDismiss, onExpire }: BasketNoticeProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const expireRef = useRef(onExpire);

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    // Keep recovery actions and saving warnings available until dismissed.
    // Routine confirmations may disappear without moving keyboard focus.
    if (canUndo || update.tone === "info" || hovered || focused) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const restart = () => {
      clearTimeout(timeout);
      if (!document.hidden) timeout = setTimeout(() => expireRef.current(update), 6_000);
    };
    restart();
    document.addEventListener("visibilitychange", restart);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [update, canUndo, hovered, focused]);

  return (
    <div
      className="lm-basket-feedback"
      role="group"
      aria-label="Basket update"
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <span className="lm-basket-feedback-icon" aria-hidden="true">
        {update.tone === "info" ? <Info size={18} /> : <Check size={18} />}
      </span>
      <p>{update.message}</p>
      <button
        type="button"
        className="lm-basket-feedback-dismiss"
        aria-label="Dismiss basket update"
        onClick={onDismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
      {canUndo && (
        <div className="lm-basket-feedback-actions">
          <button type="button" onClick={onUndo}>
            <RotateCcw size={16} aria-hidden="true" />
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/** Confirm changes without adding a second basket opener. */
export function LaunchBasketFeedback({
  update,
  dialogOpen,
  canUndo,
  onUndo,
  onDismiss,
  onExpire,
}: {
  update: LaunchBasketUpdate | null;
  dialogOpen: boolean;
} & Omit<BasketNoticeProps, "update">) {
  const visible = !!update && !dialogOpen;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {visible ? update.message : ""}
      </p>
      {visible && (
        <BasketNotice
          update={update}
          canUndo={canUndo}
          onUndo={onUndo}
          onDismiss={onDismiss}
          onExpire={onExpire}
        />
      )}
    </>
  );
}
