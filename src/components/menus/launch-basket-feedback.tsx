import { ArrowRight, Check, Info, RotateCcw, X } from "lucide-react";
import "@/styles.launch-feedback.css";

export type LaunchBasketUpdate = { message: string; tone?: "success" | "info" };

/** Keep basket feedback within reach even at the end of a long menu. */
export function LaunchBasketFeedback({
  update,
  dialogOpen,
  canUndo,
  canViewBasket,
  onUndo,
  onBasket,
  onDismiss,
}: {
  update: LaunchBasketUpdate | null;
  dialogOpen: boolean;
  canUndo: boolean;
  canViewBasket: boolean;
  onUndo: () => void;
  onBasket: () => void;
  onDismiss: () => void;
}) {
  const visible = !!update && !dialogOpen;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {visible ? update.message : ""}
      </p>
      {visible && (
        <div className="lm-basket-feedback" role="group" aria-label="Basket update">
          <span className="lm-basket-feedback-icon" aria-hidden="true">
            {update.tone === "info" ? <Info size={20} /> : <Check size={20} />}
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
          {(canUndo || canViewBasket) && (
            <div className="lm-basket-feedback-actions">
              {canUndo && (
                <button type="button" onClick={onUndo}>
                  <RotateCcw size={16} aria-hidden="true" />
                  Undo
                </button>
              )}
              {canViewBasket && (
                <button type="button" onClick={onBasket}>
                  View basket
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
