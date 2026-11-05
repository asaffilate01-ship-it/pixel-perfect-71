import { useId } from "react";
import { CreditCard, RefreshCw, ShoppingBag, Users } from "lucide-react";
import type { SharedPaymentChoice } from "@/lib/mealdeck-shared-payments";
import "../../styles.mealdeck-group-payments.css";

const choices = [
  {
    value: "host",
    title: "I’ll pay for everyone",
    detail: "One secure payment for the whole order.",
    icon: CreditCard,
  },
  {
    value: "by_bag",
    title: "Everyone pays for their food",
    detail: "A payment link for each numbered bag, using the final kitchen prices.",
    icon: ShoppingBag,
  },
  {
    value: "equal",
    title: "Split the total equally",
    detail:
      "Share the final total across the numbered bags. Any odd penny is shown before payment.",
    icon: Users,
  },
] as const;

export function GroupPaymentChoice({
  value,
  onChange,
  available,
  loading,
  message,
  bagCount,
  disabled,
  onRefresh,
}: {
  value: SharedPaymentChoice;
  onChange: (value: SharedPaymentChoice) => void;
  available: boolean;
  loading: boolean;
  message: string;
  bagCount: number;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const id = useId();
  const validBags = bagCount >= 2 && bagCount <= 10;
  return (
    <section className="md-shared-choice md-shared-surface" aria-labelledby={id + "-title"}>
      <fieldset disabled={disabled} aria-describedby={id + "-note"}>
        <legend id={id + "-title"}>How will your group pay?</legend>
        <div className="md-shared-choice-options">
          {choices.map(({ value: option, title, detail, icon: Icon }) => (
            <label key={option} className="md-shared-choice-option">
              <input
                type="radio"
                name={id + "-payment"}
                value={option}
                checked={value === option}
                disabled={option !== "host" && (!available || !validBags)}
                onChange={() => onChange(option)}
              />
              <Icon size={22} aria-hidden="true" />
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p id={id + "-note"} className="md-shared-muted">
        {loading
          ? "Checking shared payment availability…"
          : !available
            ? message ||
              "Shared payment setup is unavailable. You can still choose one payer when checkout is open."
            : !validBags
              ? "Use separate numbered bags for 2–10 people to share the payment."
              : "Payments stay linked to one order. The kitchen starts after all required shares are paid. The organiser can cover the remaining amount."}
      </p>
      {!available && !loading && (
        <button
          type="button"
          className="md-shared-text-button"
          disabled={disabled}
          onClick={onRefresh}
        >
          <RefreshCw size={16} aria-hidden="true" /> Check availability again
        </button>
      )}
    </section>
  );
}
