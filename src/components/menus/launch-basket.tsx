import type { CSSProperties } from "react";
import { Bookmark, ChevronUp, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { approvedBrandLogos, type ApprovedBrandId } from "@/lib/brand-logos";
import {
  MAX_LAUNCH_PICK_QUANTITY,
  MAX_LAUNCH_PICKS,
  findLaunchMenuItem,
  launchPickCount,
  launchSelectionLabels,
  type LaunchMenuPick,
} from "@/lib/launch-menu-picks";
import { launchCrossSelectionSummaries } from "@/lib/launch-menu-upsells";

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
}: {
  picks: LaunchMenuPick[];
  onQuantity: (key: string, value: number) => void;
  onEdit: (pick: LaunchMenuPick) => void;
  onRemove: (pick: LaunchMenuPick) => void;
}) {
  const total = launchPickCount(picks);

  return (
    <div className="lmb-basket">
      {picks.length === 0 ? (
        <div className="lmb-empty">
          <span className="lmb-empty-icon" aria-hidden="true">
            <ShoppingBag size={30} strokeWidth={1.6} />
            <Plus size={14} className="lmb-empty-plus" />
          </span>
          <h3>Your basket is empty</h3>
          <p>Pick a dish from any brand. Your choices, upgrades and extras will appear here.</p>
        </div>
      ) : (
        <ul className="lmb-list" aria-label="Basket selections">
          {picks.map((pick) => {
            const found = findLaunchMenuItem(pick.brandId, pick.itemId);
            if (!found) return null;
            const labels = launchSelectionLabels(
              found.brand,
              found.item,
              pick.selections,
              pick.crossSelections,
            );
            const children = launchCrossSelectionSummaries(
              found.brand,
              found.item,
              pick.selections,
              pick.crossSelections ?? [],
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
                  </div>
                </div>
                {labels.length > 0 && <p className="lmb-choices">{labels.join(" · ")}</p>}

                {(["upgrade", "extra"] as const).map((mode) => {
                  const additions = children.filter((child) => child.mode === mode);
                  if (additions.length === 0) return null;
                  const heading = mode === "upgrade" ? "Upgrades" : "Extras";
                  return (
                    <div key={mode} className="lmb-additions" data-addition-mode={mode}>
                      <h4>{heading}</h4>
                      <ul aria-label={heading + " for " + found.item.name}>
                        {additions.map((child) => (
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
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                <div className="lmb-item-actions">
                  <LaunchQuantityControl
                    quantity={pick.quantity}
                    onChange={(value) => onQuantity(pick.key, value)}
                    name={found.item.name}
                    canIncrease={total < MAX_LAUNCH_PICKS}
                  />
                  <button
                    type="button"
                    className="lmb-edit"
                    aria-label={"Edit " + found.item.name}
                    onClick={() => onEdit(pick)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="lmb-remove"
                    aria-label={"Remove " + found.item.name}
                    onClick={() => onRemove(pick)}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="lmb-note">
        <Bookmark size={17} aria-hidden="true" />
        <div>
          <strong>Saved on this device</strong>
          <p>Plan your favourites. Prices and ordering are coming soon.</p>
        </div>
      </div>
    </div>
  );
}

export function LaunchBasketDock({ count, onOpen }: { count: number; onOpen: () => void }) {
  const countLabel = count + (count === 1 ? " selection" : " selections");

  return (
    <>
      <div className="lmb-dock-clearance" aria-hidden="true" />
      <div className="lmb-dock">
        <button
          className="lmb-dock-button"
          type="button"
          aria-label={"View basket, " + countLabel}
          aria-haspopup="dialog"
          onClick={onOpen}
        >
          <span className="lmb-dock-icon" aria-hidden="true">
            <ShoppingBag size={24} strokeWidth={1.8} />
          </span>
          <span className="lmb-dock-copy">
            <strong>View basket</strong>
            <small>Ordering coming soon</small>
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
