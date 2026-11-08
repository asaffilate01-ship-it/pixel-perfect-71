import { usePublicMenu } from "./use-public-menu";
import { MilkcakeOfferTerms } from "./milkcake-offer-terms";
import { isMealDeckMilkcakePromotion } from "@/lib/mealdeck-milkcake-promotion";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { Bookmark, ChevronUp, Minus, Plus, RotateCcw, ShoppingBag, Trash2 } from "lucide-react";
import { approvedBrandLogos, type ApprovedBrandId } from "@/lib/brand-logos";
import {
  MAX_LAUNCH_PICK_QUANTITY,
  MAX_LAUNCH_PICKS,
  findLaunchMenuItem,
  launchPickCount,
  launchItemGroups,
  type LaunchMenuPick,
} from "@/lib/launch-menu-picks";
import { launchCrossSelectionSummaries } from "@/lib/launch-menu-upsells";
import {
  formatLaunchMenuPrice,
  formatLaunchPromotionalPrice,
  launchMenuOfferBasketDisplayPrice,
} from "@/lib/launch-menu-display-prices";

export type LaunchBasketStorageStatus = "checking" | "saved" | "session";

function logoFor(id: string) {
  return approvedBrandLogos[(id === "skorch-burgers" ? "skorch" : id) as ApprovedBrandId];
}

export function LaunchQuantityControl({
  quantity,
  onChange,
  name,
  canIncrease = true,
}: {
  quantity: number;
  onChange: (value: number) => void;
  name: string;
  canIncrease?: boolean;
}) {
  return (
    <div className="lmb-quantity" role="group" aria-label={"Quantity for " + name}>
      <button
        type="button"
        aria-label={"Decrease " + name}
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
      >
        <Minus size={17} aria-hidden="true" />
      </button>
      <span aria-label={"Quantity " + quantity}>{quantity}</span>
      <button
        type="button"
        aria-label={"Increase " + name}
        disabled={quantity >= MAX_LAUNCH_PICK_QUANTITY || !canIncrease}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

export function LaunchBasket({
  picks,
  onQuantity,
  onEdit,
  onRemove,
  onClear,
  onUndoClear,
  canUndoClear,
  storageStatus,
  onRetrySave,
}: {
  picks: LaunchMenuPick[];
  onQuantity: (key: string, value: number) => void;
  onEdit: (pick: LaunchMenuPick) => void;
  onRemove: (pick: LaunchMenuPick) => void;
  onClear: () => void;
  onUndoClear: () => void;
  canUndoClear: boolean;
  storageStatus: LaunchBasketStorageStatus;
  onRetrySave: () => boolean;
}) {
  const { catalogue } = usePublicMenu();
  const total = launchPickCount(picks);
  const basketPrice = launchMenuOfferBasketDisplayPrice(picks, catalogue);
  const hasMilkcakeOffer = basketPrice.hasMilkcakeOffer;
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const storageHeadingRef = useRef<HTMLElement>(null);
  const focusAfterSave = useRef(false);
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterAction = useRef<
    { type: "clear" | "undo" } | { type: "remove"; key: string | undefined } | null
  >(null);

  useEffect(() => {
    const action = focusAfterAction.current;
    const target =
      action?.type === "clear"
        ? undoButtonRef.current
        : action?.type === "undo"
          ? clearButtonRef.current
          : action?.type === "remove"
            ? ((action.key ? removeButtonRefs.current.get(action.key) : null) ??
              clearButtonRef.current ??
              emptyHeadingRef.current)
            : null;
    if (target) {
      focusAfterAction.current = null;
      target.focus({ preventScroll: true });
    }
  }, [picks.length, canUndoClear]);

  useEffect(() => {
    if (storageStatus === "saved" && focusAfterSave.current) {
      focusAfterSave.current = false;
      storageHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [storageStatus]);

  return (
    <div className="lmb-basket">
      {picks.length === 0 ? (
        <div className="lmb-empty">
          <span className="lmb-empty-icon" aria-hidden="true">
            <ShoppingBag size={30} strokeWidth={1.6} />
            <Plus size={14} className="lmb-empty-plus" />
          </span>
          <h3 ref={emptyHeadingRef} tabIndex={-1}>
            {canUndoClear ? "Basket emptied" : "Your basket is empty"}
          </h3>
          <p>
            {canUndoClear
              ? "Changed your mind? Bring back all your choices, upgrades and extras."
              : "Pick a dish from any brand. Your choices, upgrades and extras will appear here."}
          </p>
          {canUndoClear && (
            <button
              type="button"
              className="lmb-undo-clear"
              aria-label="Undo empty basket"
              ref={undoButtonRef}
              onClick={() => {
                focusAfterAction.current = { type: "undo" };
                onUndoClear();
              }}
            >
              <RotateCcw size={18} aria-hidden="true" />
              Undo
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="lmb-toolbar">
            <span>
              {total} {total === 1 ? "selection" : "selections"}
            </span>
            <button
              type="button"
              className="lmb-clear"
              ref={clearButtonRef}
              onClick={() => {
                focusAfterAction.current = { type: "clear" };
                onClear();
              }}
            >
              <Trash2 size={17} aria-hidden="true" />
              Empty basket
            </button>
          </div>
          <ul className="lmb-list" aria-label="Basket selections">
            {picks.map((pick, index) => {
              const found = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);
              if (!found) return null;
              const controlName = found.item.name + " from " + found.section.title;
              const price = basketPrice.lines[index]!;
              const groups = launchItemGroups(found.brand, found.item);
              const children = launchCrossSelectionSummaries(
                found.brand,
                found.item,
                pick.selections,
                pick.crossSelections ?? [],
                catalogue,
              );

              return (
                <li
                  key={pick.key}
                  className="lmb-item"
                  style={{ "--lmb-brand-color": found.brand.accent } as CSSProperties}
                >
                  <div className="lmb-item-heading">
                    <img
                      className="lmb-brand-logo"
                      src={logoFor(found.brand.id)}
                      alt=""
                      width="54"
                      height="48"
                    />
                    <div>
                      <span className="lmb-item-brand">{found.brand.name}</span>
                      <h3>{found.item.name}</h3>
                      <span className="lmb-item-section">{found.section.title}</span>
                    </div>
                  </div>
                  <div className="lmb-item-price">
                    <span>
                      {price.promotionQuantity ? (
                        <>
                          1 × 99p
                          {pick.quantity > 1 && ` + ${pick.quantity - 1} × £3.99 before 30% off`}
                        </>
                      ) : (
                        <>
                          {formatLaunchMenuPrice(price.baseUnitPence)} each × {pick.quantity}
                          {isMealDeckMilkcakePromotion(found.item.promotion) &&
                            " · Additional milkcake, before 30% off"}
                        </>
                      )}
                    </span>
                    <strong>
                      {found.item.available === false
                        ? "Currently unavailable — remove or replace this item"
                        : formatLaunchPromotionalPrice(
                            price.displayedBaseLinePence,
                            price.promotionQuantity ? found.item.promotion : undefined,
                          )}
                    </strong>
                  </div>
                  {isMealDeckMilkcakePromotion(found.item.promotion) && (
                    <p className="lmb-promotion">
                      <MilkcakeOfferTerms explained />
                    </p>
                  )}
                  {price.options.length > 0 && (
                    <dl className="lmb-option-prices" aria-label={"Options for " + controlName}>
                      {price.options.map((option) => (
                        <div key={option.optionId}>
                          <dt>
                            <small>
                              {groups.find((group) => group.id === option.groupId)?.label}
                            </small>
                            <span>
                              {option.label} × {pick.quantity}
                            </span>
                          </dt>
                          <dd>
                            {option.unitPence === 0
                              ? "Included"
                              : "+" + formatLaunchMenuPrice(option.linePence)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {(["upgrade", "extra"] as const).map((mode) => {
                    const additions = children.filter((child) => child.mode === mode);
                    if (additions.length === 0) return null;
                    const heading = mode === "upgrade" ? "Upgrades" : "Extras";
                    return (
                      <div key={mode} className="lmb-additions" data-addition-mode={mode}>
                        <h4>{heading}</h4>
                        <ul aria-label={heading + " for " + found.item.name}>
                          {additions.map((child) => {
                            const additionPrice = price.additions.find(
                              (entry) => entry.slot === child.slot && entry.itemId === child.itemId,
                            );
                            return (
                              <li
                                className="lmb-child"
                                key={child.slot + ":" + child.brandId + ":" + child.itemId}
                                data-brand={child.brandId}
                              >
                                <div className="lmb-child-heading">
                                  <img src={logoFor(child.brandId)} alt="" width="40" height="36" />
                                  <div>
                                    <span className="lmb-child-brand">{child.brandName}</span>
                                    <strong>{child.itemName}</strong>
                                  </div>
                                  <span
                                    className="lmb-child-quantity"
                                    aria-label={"Quantity " + pick.quantity}
                                  >
                                    ×{pick.quantity}
                                  </span>
                                </div>
                                <p>{child.label}</p>
                                <p className="lmb-child-price">
                                  {formatLaunchMenuPrice(additionPrice?.unitPence ?? null)} each ·{" "}
                                  {formatLaunchMenuPrice(additionPrice?.linePence ?? null)} for{" "}
                                  {pick.quantity}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}

                  <div className="lmb-item-actions">
                    <LaunchQuantityControl
                      quantity={pick.quantity}
                      onChange={(value) => onQuantity(pick.key, value)}
                      name={controlName}
                      canIncrease={total < MAX_LAUNCH_PICKS}
                    />
                    <button
                      type="button"
                      className="lmb-edit"
                      aria-label={"Edit " + controlName}
                      onClick={() => onEdit(pick)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="lmb-remove"
                      aria-label={"Remove " + controlName}
                      ref={(node) => {
                        if (node) removeButtonRefs.current.set(pick.key, node);
                        else removeButtonRefs.current.delete(pick.key);
                      }}
                      onClick={() => {
                        const neighbour = picks[index + 1] ?? picks[index - 1];
                        focusAfterAction.current = { type: "remove", key: neighbour?.key };
                        onRemove(pick);
                      }}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="lmb-subtotal">
            <p className="lmb-subtotal-amount">
              <span>Items subtotal</span>
              <strong>{formatLaunchMenuPrice(basketPrice.itemsSubtotalPence)}</strong>
            </p>
            {basketPrice.hasPaidChoices && (
              <p>Includes your selected upgrades, add-ons and extras.</p>
            )}
            {hasMilkcakeOffer && (
              <p>
                Includes one 99p milkcake with its discount. Additional milkcakes are £3.99 each
                before the usual 30% discount. The discount on the remaining eligible items and
                extras is confirmed at checkout.
              </p>
            )}
            <p>
              Choose collection, kerbside or eligible free local delivery at checkout. Your final
              total is confirmed before payment.
            </p>
          </div>
        </>
      )}
      <div className="lmb-note" data-storage-status={storageStatus}>
        <Bookmark size={17} aria-hidden="true" />
        <div>
          <strong ref={storageHeadingRef} tabIndex={-1}>
            {storageStatus === "session"
              ? "Here for this visit"
              : storageStatus === "checking"
                ? "Checking your saved basket"
                : "Saved on this device"}
          </strong>
          <p>
            {storageStatus === "session"
              ? "This browser couldn’t save your basket. Keep this page open so your choices stay with you."
              : "Your choices stay here. Availability and the final total are checked before payment."}
          </p>
          {storageStatus === "session" && (
            <button
              type="button"
              className="lmb-retry-save"
              onClick={() => {
                focusAfterSave.current = onRetrySave();
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Try saving again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function LaunchBasketDock({
  count,
  dialogOpen,
  feedbackMessage,
  onOpen,
}: {
  count: number;
  dialogOpen: boolean;
  feedbackMessage?: string | null;
  onOpen: () => void;
}) {
  const countLabel = count + (count === 1 ? " selection" : " selections");
  const feedbackId = useId();

  return (
    <>
      <div className="lmb-dock-clearance" aria-hidden="true" />
      <div className="lmb-dock" hidden={dialogOpen}>
        <button
          className="lmb-dock-button"
          type="button"
          aria-label={"View basket, " + countLabel}
          aria-describedby={feedbackMessage ? feedbackId : undefined}
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          onClick={onOpen}
        >
          <span className="lmb-dock-icon" aria-hidden="true">
            <ShoppingBag size={24} strokeWidth={1.8} />
          </span>
          <span className="lmb-dock-copy">
            <strong>View basket</strong>
            <small
              id={feedbackId}
              data-basket-update={!!feedbackMessage}
              title={feedbackMessage ?? undefined}
            >
              {feedbackMessage || "Review your order"}
            </small>
          </span>
          <span className="lmb-dock-count" aria-hidden="true">
            {count}
          </span>
          <ChevronUp className="lmb-dock-arrow" size={18} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
