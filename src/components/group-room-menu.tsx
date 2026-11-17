import { usePublicMenu } from "@/components/menus/use-public-menu";
import { PublicMenuStatus } from "@/components/menus/public-menu-status";
import { useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  LaunchItemCustomiser,
  type LaunchItemDraft,
  type LaunchMenuEntry,
} from "@/components/menus/launch-item-customiser";
import { approvedBrandLogos, type ApprovedBrandId } from "@/lib/brand-logos";
import { getLaunchMenuBrand, isLaunchBrandPriceApproved } from "@/lib/launch-menu-catalogue";
import { matchesLaunchMenuSearch } from "@/lib/launch-menu-search";
import {
  formatLaunchMenuPrice,
  formatLaunchMenuItemPrice,
  launchMenuBasketDisplayPrice,
  launchMenuPickDisplayPrice,
} from "@/lib/launch-menu-display-prices";
import { isMealDeckMilkcakePromotion } from "@/lib/mealdeck-milkcake-promotion";
import {
  addLaunchPick,
  canQuickAddLaunchItem,
  findLaunchMenuItem,
  launchItemGroups,
  launchPickCount,
  launchSelectionLabels,
  setLaunchPickQuantity,
  updateLaunchPick,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "@/lib/launch-menu-picks";
import {
  launchCrossSelectionSummaries,
  type LaunchCrossSelection,
} from "@/lib/launch-menu-upsells";

const brandIds = ["skorch-burgers", "tavo-chicken", "souvano", "loadd", "moktl"];

function brandLogo(id: string) {
  return approvedBrandLogos[(id === "skorch-burgers" ? "skorch" : id) as ApprovedBrandId];
}

export function GroupRoomChoices({
  picks,
  onEdit,
  onRemove,
}: {
  picks: LaunchMenuPick[];
  onEdit?: ((pick: LaunchMenuPick) => void) | undefined;
  onRemove?: ((pick: LaunchMenuPick) => void) | undefined;
}) {
  const { catalogue } = usePublicMenu();
  return (
    <ul className="md-room-choices">
      {picks.map((pick) => {
        const entry = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);
        if (!entry) return <li key={pick.key}>This item needs a menu refresh.</li>;
        const options = [
          ...launchSelectionLabels(entry.brand, entry.item, pick.selections, pick.crossSelections),
          ...launchCrossSelectionSummaries(
            entry.brand,
            entry.item,
            pick.selections,
            pick.crossSelections,
            catalogue,
          ).map((choice) => choice.label),
        ];
        return (
          <li key={pick.key}>
            <div className="md-room-choice-copy">
              <span className="md-room-muted">{entry.brand.name}</span>
              <strong>
                {pick.quantity} × {entry.item.name}
              </strong>
              {options.length > 0 && <p>{options.join(" · ")}</p>}
              <span>
                {formatLaunchMenuPrice(
                  launchMenuPickDisplayPrice(pick, catalogue).itemsSubtotalPence,
                )}
              </span>
            </div>
            {(onEdit || onRemove) && (
              <div className="md-room-choice-actions">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(pick)}
                    aria-label={"Edit " + entry.item.name}
                  >
                    Edit
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(pick)}
                    aria-label={"Remove " + entry.item.name}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One person's in-memory choices. The room owns explicit save and ready transitions. */
export function GroupRoomMenu({
  picks,
  onChange,
  disabled,
  unsaved,
  onReviewSave,
}: {
  picks: LaunchMenuPick[];
  onChange: (next: LaunchMenuPick[]) => void;
  disabled: boolean;
  unsaved: boolean;
  onReviewSave: () => void;
}) {
  const publicMenu = usePublicMenu();
  const { catalogue } = publicMenu;
  const [brandId, setBrandId] = useState("skorch-burgers");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<LaunchItemDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const choicesHeading = useRef<HTMLHeadingElement>(null);
  const brand = getLaunchMenuBrand(brandId, catalogue)!;
  const query = search.trim();
  const sections = brand.sections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => item.available !== false)
        .filter((item) =>
          !query ||
          matchesLaunchMenuSearch(query, [
            item.name,
            item.description,
            section.title,
            section.description,
            ...launchItemGroups(brand, item).flatMap((group) =>
              group.options
                .filter((option) => option.available !== false)
                .map((option) => option.label),
            ),
          ]),
        ),
    }))
    .filter((section) => section.items.length);

  function openItem(entry: LaunchMenuEntry, existing?: LaunchMenuPick) {
    if (disabled || !publicMenu.ready || entry.item.available === false) return;
    // A simple, fixed-price item can join the draft with a single tap. Dishes
    // with price variants or modifier groups still require full customisation.
    // Nothing is committed to the shared room until the person explicitly saves.
    if (!existing && canQuickAddLaunchItem(entry.item)) {
      const next = addLaunchPick(picks, entry.brand.id, entry.item.id, {}, 1);
      if (next === picks) {
        setNotice("Your bag is full. Review or remove a choice before adding more.");
      } else {
        onChange(next);
        setNotice(entry.item.name + " added to your choices. Save before leaving.");
      }
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setDraft({ ...entry, ...(existing ? { existing } : {}) });
  }

  function save(
    selections: LaunchMenuSelections,
    quantity: number,
    crossSelections: LaunchCrossSelection[],
  ) {
    if (!draft || disabled || !publicMenu.ready) return;
    const next = draft.existing
      ? updateLaunchPick(picks, draft.existing.key, selections, quantity, crossSelections)
      : addLaunchPick(picks, draft.brand.id, draft.item.id, selections, quantity, crossSelections);
    if (next === picks) {
      setError(
        "Check the required choices. An order can hold up to 60 selections, with up to 20 of one exact dish.",
      );
      return;
    }
    onChange(next);
    setNotice(
      draft.item.name + (draft.existing ? " updated in your choices." : " added to your choices.") +
        " Save before leaving.",
    );
    setDraft(null);
  }

  return (
    <div className="md-room-composer">
      <PublicMenuStatus />
      <section className="md-room-own-choices" aria-labelledby="room-own-choices">
        <div className="md-room-section-title">
          <ShoppingBag size={22} aria-hidden="true" />
          <h3 id="room-own-choices" ref={choicesHeading} tabIndex={-1}>
            My choices ({launchPickCount(picks)})
          </h3>
        </div>
        {picks.length > 0 ? (
          <GroupRoomChoices
            picks={picks}
            onEdit={
              disabled
                ? undefined
                : (pick) => {
                    const entry = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);
                    if (entry) openItem(entry, pick);
                  }
            }
            onRemove={
              disabled
                ? undefined
                : (pick) => {
                    onChange(setLaunchPickQuantity(picks, pick.key, 0));
                    setNotice("Item removed from your choices.");
                    choicesHeading.current?.focus({ preventScroll: true });
                  }
            }
          />
        ) : (
          <p className="md-room-muted">Your bag is empty. Choose a menu below to get started.</p>
        )}
        <p className="md-room-money-row">
          <span>Menu subtotal</span>
          <strong>
            {formatLaunchMenuPrice(
              launchMenuBasketDisplayPrice(picks, catalogue).itemsSubtotalPence,
            )}
          </strong>
        </p>
        <p className="md-room-fine">
          For planning. The final price and any eligible offer are checked before payment.
        </p>
      </section>
      <p className="md-room-feedback" role="status">
        {notice}
      </p>
      {unsaved && (
        <div className="md-room-save-shortcut" role="status">
          <strong>Unsaved choices</strong>
          <button type="button" onClick={onReviewSave} disabled={disabled}>
            Review &amp; save <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <nav className="md-room-brands" aria-label="Choose a menu">
        {brandIds.map((id) => (
          <button
            type="button"
            key={id}
            aria-pressed={brandId === id}
            onClick={() => {
              setBrandId(id);
              setSearch("");
            }}
          >
            <img src={brandLogo(id)} alt="" width={90} height={60} />
            <span>{getLaunchMenuBrand(id)!.name}</span>
          </button>
        ))}
      </nav>
      <label className="md-room-search">
        <Search size={19} aria-hidden="true" />
        <span className="sr-only">Search {brand.name}</span>
        <input
          type="search"
          placeholder={"Search " + brand.name}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {sections.length ? (
        sections.map((section) => (
          <section className="md-room-menu-section" key={section.id}>
            <h3>{section.title}</h3>
            <div className="md-room-dishes">
              {section.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={
                    disabled ||
                    !publicMenu.ready ||
                    item.available === false ||
                    !isLaunchBrandPriceApproved(brand.id)
                  }
                  onClick={() => openItem({ brand, section, item })}
                >
                  <span>
                    <strong>{item.name}</strong>
                    {item.description && <small>{item.description}</small>}
                    <span className="md-room-dish-price">
                      {item.priceVariants?.length ? "From " : ""}
                      {formatLaunchMenuItemPrice(item)}
                      {isMealDeckMilkcakePromotion(item.promotion) && " · T&Cs apply"}
                    </span>
                  </span>
                  <Plus size={19} aria-hidden="true" />
                  <span className="sr-only">
                    {canQuickAddLaunchItem(item)
                      ? "Add " + item.name + " to my group choices"
                      : "Choose options for " + item.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      ) : (
        <p role="status" className="md-room-empty">
          No dishes match that search. Try another word or menu.
        </p>
      )}
      <Dialog
        open={!!draft && !disabled}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent
          className="lm-dialog lm-customise-dialog"
          overlayClassName="lm-dialog-overlay"
          data-menu-brand={draft?.brand.id}
          style={{ "--lm-accent": draft?.brand.accent ?? "#951018" } as CSSProperties}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current?.isConnected
              ? returnFocus.current
              : choicesHeading.current;
            target?.focus({ preventScroll: true });
          }}
        >
          {draft && (
            <LaunchItemCustomiser
              key={draft.item.id + (draft.existing?.key ?? "new")}
              context="group-order"
              draft={draft}
              basketPicks={picks}
              onSave={save}
              onBack={() => setDraft(null)}
              error={error}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
