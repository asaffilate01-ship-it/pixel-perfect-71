import { useState } from "react";
import { ArrowRight, Check, Coffee, Layers3, UtensilsCrossed } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatPence } from "@/lib/mealdeck";
import { deckChoices, quoteDeckPreview, type DeckSlot, type PromoOffer } from "@/lib/promotions";

const slots = [
  { id: "main" as const, label: "Main deck", icon: UtensilsCrossed },
  { id: "side" as const, label: "Side deck", icon: Layers3 },
  { id: "drink" as const, label: "Drink deck", icon: Coffee },
];

function DeckBuilder() {
  const [selection, setSelection] = useState<Partial<Record<DeckSlot, string>>>({});
  const quote = quoteDeckPreview(selection);
  return (
    <div className="md-builder">
      <p className="md-preview-note">
        Try a combination below. Items and prices are illustrative; this preview does not create an
        order.
      </p>
      <div className="md-builder-grid">
        {slots.map(({ id, label, icon: Icon }) => (
          <fieldset key={id}>
            <legend>
              <Icon size={17} aria-hidden="true" /> {label}
            </legend>
            {deckChoices
              .filter((choice) => choice.slot === id)
              .map((choice) => (
                <label
                  key={choice.id}
                  className={selection[id] === choice.id ? "md-choice is-selected" : "md-choice"}
                >
                  <input
                    type="radio"
                    name={`deck-${id}`}
                    value={choice.id}
                    checked={selection[id] === choice.id}
                    onChange={() => setSelection((previous) => ({ ...previous, [id]: choice.id }))}
                  />
                  <span>
                    <small>{choice.brand}</small>
                    <strong>{choice.name}</strong>
                    <b>{formatPence(choice.pricePence)}</b>
                  </span>
                </label>
              ))}
          </fieldset>
        ))}
      </div>
      <div className="md-quote" aria-live="polite" aria-atomic="true">
        <div>
          <span>Selected bundle</span>
          <strong>{formatPence(quote.subtotalPence)}</strong>
        </div>
        <div>
          <span>Preview saving {quote.eligible && "(20%, capped at £5)"}</span>
          <strong>−{formatPence(quote.savingPence)}</strong>
        </div>
        <div className="md-quote-total">
          <span>Illustrative total</span>
          <strong>{formatPence(quote.totalPence)}</strong>
        </div>
        <p>
          {!quote.complete
            ? "Choose one item from each deck to see your offer."
            : quote.eligible
              ? "Your combination qualifies in this preview. Ordering opens later."
              : `This bundle is ${formatPence(quote.shortfallPence)} below the £20 minimum. Try another combination.`}
        </p>
      </div>
      <button type="button" className="md-text-button" onClick={() => setSelection({})}>
        Reset my choices
      </button>
    </div>
  );
}

export function PromoPreview({
  offer,
  onClose,
  onCloseAutoFocus,
}: {
  offer: PromoOffer | null;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  return (
    <Dialog
      open={offer !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className={`md-modal ${offer?.id === "build-your-deck" ? "md-modal-wide" : ""}`}
      >
        {offer && (
          <>
            <span className="md-kicker">Offer preview · Coming soon</span>
            <DialogTitle className="md-modal-title">{offer.name}</DialogTitle>
            <DialogDescription className="md-modal-description">
              {offer.description}
            </DialogDescription>
            {offer.id === "build-your-deck" && <DeckBuilder key={offer.id} />}
            <div className="md-offer-terms">
              <h3>The details</h3>
              <ul>
                {offer.terms.map((term) => (
                  <li key={term}>
                    <Check size={15} aria-hidden="true" />
                    <span>{term}</span>
                  </li>
                ))}
              </ul>
              <p>
                One offer per order. Once per customer per day. Selected items only. No stacking
                with other offers, discounted bundles or reward redemption. Minimum spends exclude
                delivery, service fees and paid upgrades.
              </p>
            </div>
            <p className="md-preview-note">
              This is a preview of a proposed offer. Final menus, prices, participating locations,
              dates and availability will be confirmed before launch.
            </p>
            <button type="button" className="md-button md-button-red" onClick={onClose}>
              Back to the deck <ArrowRight size={17} aria-hidden="true" />
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
