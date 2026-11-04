import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Layers3,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { approvedBrandLogos, type ApprovedBrandId } from "@/lib/brand-logos";
import { marketingBrands } from "@/lib/marketing-brands";
import {
  getLaunchMenuBrand,
  type LaunchMenuBrand,
  type LaunchMenuItem,
  type LaunchMenuSection,
  type LaunchMenuUpsell,
} from "@/lib/launch-menu-catalogue";
import {
  LAUNCH_PICKS_STORAGE_KEY,
  MAX_LAUNCH_PICK_QUANTITY,
  MAX_LAUNCH_PICKS,
  addLaunchPick,
  decodeLaunchPicks,
  encodeLaunchPicks,
  findLaunchMenuItem,
  isLaunchGroupActive,
  launchItemGroups,
  launchPickCount,
  launchSelectionLabels,
  missingLaunchChoices,
  setLaunchPickQuantity,
  toggleLaunchOption,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "@/lib/launch-menu-picks";

const brandOrder = ["skorch-burgers", "tavo-chicken", "souvano", "loadd", "moktl"];
const brandHeadlines: Record<string, string> = {
  "skorch-burgers": "Stacked. Seared.",
  "tavo-chicken": "Turn up the flavour.",
  souvano: "Mediterranean grill.",
  loadd: "Fries, taken further.",
  moktl: "Zero alcohol. Full vibe.",
};

function logoFor(id: string) {
  return approvedBrandLogos[(id === "skorch-burgers" ? "skorch" : id) as ApprovedBrandId];
}

type MenuEntry = { brand: LaunchMenuBrand; section: LaunchMenuSection; item: LaunchMenuItem };
type Draft = MenuEntry & { existing?: LaunchMenuPick };

function QuantityControl({
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
    <div className="lm-quantity">
      <button
        type="button"
        aria-label={"Decrease " + name}
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
      >
        <Minus size={16} />
      </button>
      <span aria-label={"Quantity " + quantity}>{quantity}</span>
      <button
        type="button"
        aria-label={"Increase " + name}
        disabled={quantity >= MAX_LAUNCH_PICK_QUANTITY || !canIncrease}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function Picks({
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
    <div className="lm-picks-content">
      {picks.length === 0 ? (
        <div className="lm-empty-picks">
          <Layers3 size={36} aria-hidden="true" />
          <h3>A little of what you fancy.</h3>
          <p>Choose dishes from any of these brands to build your launch-day picks.</p>
        </div>
      ) : (
        <ul className="lm-pick-list">
          {picks.map((pick) => {
            const found = findLaunchMenuItem(pick.brandId, pick.itemId);
            if (!found) return null;
            const labels = launchSelectionLabels(found.brand, found.item, pick.selections);
            return (
              <li key={pick.key}>
                <span className="lm-pick-brand">
                  {found.brand.name} · {found.section.title}
                </span>
                <h3>{found.item.name}</h3>
                {labels.length > 0 && <p>{labels.join(" · ")}</p>}
                <div className="lm-pick-actions">
                  <QuantityControl
                    quantity={pick.quantity}
                    onChange={(value) => onQuantity(pick.key, value)}
                    name={found.item.name}
                    canIncrease={total < MAX_LAUNCH_PICKS}
                  />
                  <button type="button" className="lm-text-button" onClick={() => onEdit(pick)}>
                    Edit<span className="sr-only"> {found.item.name}</span>
                  </button>
                  <button
                    type="button"
                    className="lm-icon-button"
                    aria-label={"Remove " + found.item.name}
                    onClick={() => onRemove(pick)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="lm-picks-note">
        <strong>Saved on this device.</strong>
        <p>Plan your favourites now. Prices and ordering are coming soon.</p>
      </div>
    </div>
  );
}

function CustomisePick({
  draft,
  onSave,
  onBack,
  error,
}: {
  draft: Draft;
  onSave: (selections: LaunchMenuSelections, quantity: number) => void;
  onBack: () => void;
  error: string;
}) {
  const { brand, section, item, existing } = draft;
  const [selections, setSelections] = useState<LaunchMenuSelections>(existing?.selections ?? {});
  const [quantity, setQuantity] = useState(existing?.quantity ?? 1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const groups = launchItemGroups(brand, item);
  const missing = missingLaunchChoices(brand, item, selections);
  return (
    <>
      <div className="lm-dialog-heading">
        <img src={logoFor(brand.id)} alt={brand.name} width="140" height="95" />
        <span className="lm-eyebrow">{section.title}</span>
        <DialogTitle ref={headingRef} tabIndex={-1} className="lm-dialog-title">
          {item.name}
        </DialogTitle>
        <DialogDescription className="lm-dialog-description">
          {item.description ?? "Add this to your MealDeck picks."}
        </DialogDescription>
        {section.description && <p className="lm-included">{section.description}</p>}
      </div>
      <div className="lm-customise-body">
        {groups.map((group) =>
          isLaunchGroupActive(group, selections, item) ? (
            <fieldset className="lm-option-group" key={group.id}>
              <legend>
                {group.label}
                <span>{group.required ? "Choose one" : "Optional"}</span>
              </legend>
              {group.description && <p>{group.description}</p>}
              <div className="lm-option-grid">
                {group.kind === "single" && !group.required && (
                  <label
                    className={"lm-option " + (!selections[group.id]?.length ? "is-selected" : "")}
                  >
                    <input
                      type="radio"
                      name={group.id}
                      checked={!selections[group.id]?.length}
                      onChange={() => {
                        const active = selections[group.id]?.[0];
                        if (active)
                          setSelections(
                            toggleLaunchOption(brand, item, selections, group.id, active),
                          );
                      }}
                    />
                    <span>
                      {group.id.includes("make-it-a-meal") ? "Just the main" : "No upgrade"}
                    </span>
                  </label>
                )}
                {group.options.map((option) => {
                  const selected = selections[group.id]?.includes(option.id) ?? false;
                  return (
                    <label
                      key={option.id}
                      className={"lm-option " + (selected ? "is-selected" : "")}
                    >
                      <input
                        type={group.kind === "single" ? "radio" : "checkbox"}
                        name={group.id}
                        checked={selected}
                        onChange={() =>
                          setSelections(
                            toggleLaunchOption(brand, item, selections, group.id, option.id),
                          )
                        }
                      />
                      <span>
                        <strong>{option.label}</strong>
                        {option.description && <small>{option.description}</small>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null,
        )}
        <div className="lm-allergen-note">
          For allergies or dietary needs, please check with the team before ordering when we launch.
        </div>
      </div>
      <div className="lm-dialog-bottom">
        {missing.length > 0 && (
          <p className="lm-choice-hint" role="status">
            Choose {missing.map((group) => group.label.toLowerCase()).join(" and ")} to continue.
          </p>
        )}
        {error && (
          <p className="lm-error" role="alert">
            {error}
          </p>
        )}
        <div className="lm-dialog-actions">
          <QuantityControl name={item.name} quantity={quantity} onChange={setQuantity} />
          <button
            type="button"
            className="lm-primary"
            disabled={missing.length > 0}
            onClick={() => onSave(selections, quantity)}
          >
            {existing ? "Save changes" : "Add to my picks"}
            <Plus size={18} />
          </button>
        </div>
        <p>Prices to follow · Ordering coming soon</p>
        <button type="button" className="lm-text-button" onClick={onBack}>
          Back to the menu
        </button>
      </div>
    </>
  );
}

export function LaunchMenuBrowser({
  requestedBrandId,
  requestedSectionId,
}: {
  requestedBrandId?: string | undefined;
  requestedSectionId?: string | undefined;
}) {
  const navigate = useNavigate();
  const brand = getLaunchMenuBrand(requestedBrandId ?? "skorch-burgers");
  const pendingBrand = marketingBrands.find((entry) => entry.id === requestedBrandId);
  const [search, setSearch] = useState("");
  const [picks, setPicks] = useState<LaunchMenuPick[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picksOpen, setPicksOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    try {
      setPicks(decodeLaunchPicks(window.localStorage.getItem(LAUNCH_PICKS_STORAGE_KEY)));
    } catch {
      /* Browsing still works when storage is disabled. */
    }
  }, []);
  useEffect(() => {
    setSearch("");
  }, [brand?.id]);

  function updatePicks(next: LaunchMenuPick[]) {
    setPicks(next);
    try {
      window.localStorage.setItem(LAUNCH_PICKS_STORAGE_KEY, encodeLaunchPicks(next));
    } catch {
      /* Keep this session's picks. */
    }
  }

  function browse(brandId: string, sectionId?: string) {
    setSearch("");
    void navigate({
      to: "/menus",
      search: { brand: brandId, ...(sectionId ? { section: sectionId } : {}) },
      resetScroll: false,
    }).then(() => {
      document
        .getElementById(sectionId ? "launch-menu-items" : "launch-brand-selector")
        ?.scrollIntoView({ block: "start" });
    });
  }

  function openItem(entry: MenuEntry, existing?: LaunchMenuPick) {
    if (!picksOpen)
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSaveError("");
    setDraft({ ...entry, ...(existing ? { existing } : {}) });
    setPicksOpen(false);
  }

  function savePick(selections: LaunchMenuSelections, quantity: number) {
    if (!draft) return;
    const previous = draft.existing
      ? picks.filter((pick) => pick.key !== draft.existing?.key)
      : picks;
    const next = addLaunchPick(previous, draft.brand.id, draft.item.id, selections, quantity);
    if (next === previous) {
      setSaveError(
        "Your picks can hold up to 20 of a dish and 60 items in total. Reduce a quantity to continue.",
      );
      return;
    }
    updatePicks(next);
    setNotice(
      draft.item.name + (draft.existing ? " updated in your picks." : " added to your picks."),
    );
    setDraft(null);
  }

  function chooseUpsell(upsell: LaunchMenuUpsell) {
    if (!brand) return;
    if (upsell.targetBrandId) {
      // A featured named drink opens that exact product, not an unrelated first item.
      const featured = brand.sections
        .flatMap((section) => section.items.map((item) => ({ brand, section, item })))
        .find((entry) => entry.item.name === upsell.label);
      if (featured) openItem(featured);
      else browse(upsell.targetBrandId, upsell.targetSectionId);
      return;
    }
    const section = brand.sections.find((entry) =>
      entry.items.some((item) => item.optionGroupIds.includes(upsell.optionGroupId ?? "")),
    );
    if (section) {
      browse(brand.id, section.id);
      setNotice(
        "Choose a " +
          (section.title.toLowerCase().includes("burger") || section.id === "beef-smash-deck"
            ? "burger"
            : "main") +
          " to explore " +
          upsell.label.toLowerCase() +
          ".",
      );
    }
  }

  const quantity = launchPickCount(picks);
  const activeSection = brand?.sections.some((section) => section.id === requestedSectionId)
    ? requestedSectionId
    : undefined;
  const query = search.trim().toLocaleLowerCase("en-GB");
  const sections = (brand?.sections ?? [])
    .filter((section) => !activeSection || section.id === activeSection)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        [
          item.name,
          item.description,
          section.title,
          section.description,
          ...(brand
            ? launchItemGroups(brand, item).flatMap((group) =>
                group.options.map((option) => option.label),
              )
            : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("en-GB")
          .includes(query),
      ),
    }))
    .filter((section) => section.items.length > 0);
  const visibleCount = sections.reduce((total, section) => total + section.items.length, 0);
  const pairings =
    brand?.id === "moktl"
      ? ["skorch-burgers", "tavo-chicken"]
      : brand?.id === "loadd"
        ? ["skorch-burgers", "moktl"]
        : brand?.id === "souvano"
          ? ["moktl", "loadd"]
          : ["loadd", "moktl"];
  const pickProps = {
    picks,
    onQuantity: (key: string, value: number) =>
      updatePicks(setLaunchPickQuantity(picks, key, value)),
    onEdit: (pick: LaunchMenuPick) => {
      const entry = findLaunchMenuItem(pick.brandId, pick.itemId);
      if (entry) openItem(entry, pick);
    },
    onRemove: (pick: LaunchMenuPick) => {
      const entry = findLaunchMenuItem(pick.brandId, pick.itemId);
      updatePicks(setLaunchPickQuantity(picks, pick.key, 0));
      setNotice((entry?.item.name ?? "Item") + " removed from your picks.");
    },
  };
  const menuStyle = { "--lm-accent": brand?.accent ?? "#951018" } as CSSProperties;

  return (
    <div
      className="md-marketing-shell lm-shell"
      data-menu-brand={brand?.id ?? "pending"}
      style={menuStyle}
    >
      <SiteHeader />
      <main className="lm-main">
        <div className="lm-page-heading">
          <span className="lm-eyebrow">The launch deck</span>
          <p>Five menus. Every craving.</p>
          <span className="lm-launch-label">Browse now · Ordering coming soon</span>
        </div>
        <nav
          id="launch-brand-selector"
          className="lm-brand-selector"
          aria-label="Choose a brand menu"
        >
          {brandOrder.map((id) => {
            const entry = getLaunchMenuBrand(id);
            return entry ? (
              <button
                key={id}
                type="button"
                aria-pressed={brand?.id === id}
                onClick={() => browse(id)}
                className={brand?.id === id ? "is-active" : ""}
              >
                <img src={logoFor(id)} alt="" width="165" height="110" />
                <span>{entry.name}</span>
                <small>{brand?.id === id ? "On the menu" : "View menu"}</small>
              </button>
            ) : null;
          })}
        </nav>

        {brand ? (
          <>
            <header className="lm-brand-heading">
              <div>
                <span className="lm-eyebrow">{brand.name} / Launch menu</span>
                <h1>{brandHeadlines[brand.id]}</h1>
                <p>{brand.description}</p>
              </div>
              <div className="lm-heading-note">
                <Layers3 aria-hidden="true" />
                <strong>Build your own hand.</strong>
                <p>
                  {brand.id === "moktl"
                    ? "Find your favourite flavour."
                    : brand.id === "loadd"
                      ? "Fries, mac or the Full House."
                      : "Pick a main. Make it a meal."}
                  <br />
                  Mix it up across the deck.
                </p>
              </div>
            </header>

            <div className="lm-menu-toolbar">
              <label className="lm-search">
                <Search size={19} aria-hidden="true" />
                <span className="sr-only">Search {brand.name} menu</span>
                <input
                  type="search"
                  placeholder={"Search " + brand.name + "…"}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear menu search"
                    onClick={() => setSearch("")}
                  >
                    <X size={18} />
                  </button>
                )}
              </label>
              <span className="lm-result-count" role="status">
                {visibleCount} {visibleCount === 1 ? "item" : "items"}
              </span>
              <button
                type="button"
                className="lm-your-picks-button"
                onClick={() => {
                  returnFocusRef.current = document.activeElement as HTMLElement;
                  setPicksOpen(true);
                }}
              >
                <ShoppingBag size={18} />
                Your picks<span>{quantity}</span>
              </button>
            </div>
            <nav className="lm-category-nav" aria-label={brand.name + " menu sections"}>
              <button
                type="button"
                className={!activeSection ? "is-active" : ""}
                aria-pressed={!activeSection}
                onClick={() => browse(brand.id)}
              >
                All items
              </button>
              {brand.sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={activeSection === section.id ? "is-active" : ""}
                  aria-pressed={activeSection === section.id}
                  onClick={() => browse(brand.id, section.id)}
                >
                  {section.title}
                </button>
              ))}
            </nav>

            {notice && (
              <div className="lm-notice">
                <span role="status">
                  <Check size={18} aria-hidden="true" />
                  {notice}
                </span>
                <button type="button" aria-label="Dismiss update" onClick={() => setNotice("")}>
                  <X size={18} />
                </button>
              </div>
            )}

            <div className="lm-layout">
              <div id="launch-menu-items" className="lm-menu-content">
                {sections.length ? (
                  <div className="lm-section-grid">
                    {sections.map((section) => (
                      <section
                        key={section.id}
                        className={
                          "lm-menu-section " +
                          (section.id === "cans-drinks" ? "lm-drinks-section" : "")
                        }
                        aria-labelledby={"section-" + section.id}
                      >
                        <h2 id={"section-" + section.id}>
                          <span>{section.title}</span>
                        </h2>
                        {section.description && (
                          <p className="lm-section-description">{section.description}</p>
                        )}
                        <ul>
                          {section.items.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                className="lm-dish"
                                onClick={() => openItem({ brand, section, item })}
                                aria-label={"Choose " + item.name + " from " + section.title}
                              >
                                <span>
                                  <strong>{item.name}</strong>
                                  {item.description && <small>{item.description}</small>}
                                  {item.optionGroupIds.some((id) => id.endsWith("-portion")) && (
                                    <small className="lm-choice-label">
                                      3, 5 or 8 pieces · Choose your flavour
                                    </small>
                                  )}
                                  {item.optionGroupIds.includes("souvano-donner-flavour") && (
                                    <small className="lm-choice-label">Choose your flavour</small>
                                  )}
                                </span>
                                <span className="lm-add-icon" aria-hidden="true">
                                  <Plus size={20} />
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {section.items.some((item) =>
                          item.optionGroupIds.some((id) => id.endsWith("make-it-a-meal")),
                        ) && (
                          <div className="lm-meal-callout">
                            <strong>
                              Make it a <em>meal</em>
                            </strong>
                            <span>
                              {brand.id === "souvano"
                                ? "Fries, rice or naan & a drink"
                                : "Add fries & a drink"}
                            </span>
                            <small>Choose your main to customise</small>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="lm-no-results">
                    <Search size={34} aria-hidden="true" />
                    <h2>No dishes found</h2>
                    <p>Try another dish or flavour, or view the full {brand.name} menu.</p>
                    <button
                      type="button"
                      className="lm-primary"
                      onClick={() => {
                        setSearch("");
                        browse(brand.id);
                      }}
                    >
                      View all items
                    </button>
                  </div>
                )}

                <section className="lm-pairings" aria-labelledby="pairing-title">
                  <div>
                    <span className="lm-eyebrow">Across the deck</span>
                    <h2 id="pairing-title">Something on the side?</h2>
                    <p>Explore more brands and add a separate pick.</p>
                  </div>
                  <div className="lm-pairing-grid">
                    {pairings.map((id) => {
                      const pairing = getLaunchMenuBrand(id);
                      return pairing ? (
                        <button type="button" key={id} onClick={() => browse(id)}>
                          <img src={logoFor(id)} alt="" width="120" height="85" />
                          <span>
                            <strong>{pairing.name}</strong>
                            <small>
                              {id === "moktl"
                                ? "Find your mocktail"
                                : id === "loadd"
                                  ? "Loaded fries & mac ’n cheese"
                                  : id === "skorch-burgers"
                                    ? "Explore smash burgers"
                                    : "Chicken burgers, wings & more"}
                            </small>
                          </span>
                          <ArrowRight size={20} />
                        </button>
                      ) : null;
                    })}
                  </div>
                </section>
              </div>

              <aside className="lm-sidebar" aria-label="Meal upgrades and your picks">
                <section className="lm-upsells">
                  <span className="lm-eyebrow">{brand.name} extras</span>
                  <h2>{brand.id === "moktl" ? "In the spotlight." : "Take it further."}</h2>
                  <p>
                    {brand.id === "moktl"
                      ? "Another flavour for your next hand."
                      : "Explore this brand’s meals, upgrades and extras."}
                  </p>
                  {brand.upsells.map((upsell) => (
                    <button key={upsell.id} type="button" onClick={() => chooseUpsell(upsell)}>
                      <span>
                        <strong>{upsell.label}</strong>
                        {upsell.description && <small>{upsell.description}</small>}
                      </span>
                      <ChevronRight size={19} />
                    </button>
                  ))}
                </section>
                <section className="lm-picks-panel">
                  <div className="lm-picks-title">
                    <h2>Your picks</h2>
                    <span>{quantity}</span>
                  </div>
                  <Picks {...pickProps} />
                </section>
              </aside>
            </div>
          </>
        ) : (
          <section className="lm-pending-menu">
            {pendingBrand && (
              <img src={pendingBrand.logo} alt={pendingBrand.name} width="250" height="180" />
            )}
            <span className="lm-eyebrow">Coming in the next deck</span>
            <h1>
              {pendingBrand
                ? pendingBrand.name + " is in the next deck."
                : "Choose a menu to explore."}
            </h1>
            <p>
              Explore Skorch, Tavo Chicken, Souvano, Load’d and Moktl while we prepare the rest.
            </p>
            <button type="button" className="lm-primary" onClick={() => browse("skorch-burgers")}>
              Explore the menus
              <ArrowRight size={18} />
            </button>
          </section>
        )}

        <section className="lm-next-deck" aria-labelledby="menu-next-deck-title">
          <span className="lm-eyebrow">More cravings on the way</span>
          <h2 id="menu-next-deck-title">Coming in the next deck.</h2>
          <p>The next MealDeck brands are getting their menus ready.</p>
          <div>
            {marketingBrands
              .filter((entry) => !getLaunchMenuBrand(entry.id))
              .map((entry) => (
                <Link to="/menus" search={{ brand: entry.id }} key={entry.id}>
                  {entry.name}
                  <ChevronRight size={14} />
                </Link>
              ))}
          </div>
        </section>
        <footer className="lm-menu-footer">
          <strong>
            One order. <em>Every craving.</em>
          </strong>
          <p>
            Launch menu preview · Prices and availability will be confirmed when ordering opens.
          </p>
          <Link to="/order" search={{ preview: "sample" }}>
            Try the illustrative group basket demo
            <ArrowRight size={15} />
          </Link>
        </footer>
      </main>
      <SiteFooter />
      {quantity > 0 && (
        <button
          type="button"
          className="lm-mobile-picks"
          onClick={() => {
            returnFocusRef.current = document.activeElement as HTMLElement;
            setPicksOpen(true);
          }}
        >
          <ShoppingBag size={19} />
          <span>
            View your picks<small>Ordering coming soon</small>
          </span>
          <b>{quantity}</b>
          <ChevronRight size={20} />
        </button>
      )}

      <Dialog
        open={!!draft || picksOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            setPicksOpen(false);
          }
        }}
      >
        <DialogContent
          className="lm-dialog"
          overlayClassName="lm-dialog-overlay"
          data-menu-brand={draft?.brand.id ?? brand?.id}
          style={
            { "--lm-accent": draft?.brand.accent ?? brand?.accent ?? "#951018" } as CSSProperties
          }
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          {draft ? (
            <CustomisePick
              key={draft.item.id + (draft.existing?.key ?? "new")}
              draft={draft}
              onSave={savePick}
              onBack={() => {
                setDraft(null);
                setPicksOpen(false);
              }}
              error={saveError}
            />
          ) : (
            <>
              <div className="lm-dialog-heading">
                <span className="lm-eyebrow">Your launch-day line-up</span>
                <DialogTitle className="lm-dialog-title">
                  Your picks <span>({quantity})</span>
                </DialogTitle>
                <DialogDescription className="lm-dialog-description">
                  Mix brands and make it yours. These are saved picks, ready to revisit when
                  ordering opens.
                </DialogDescription>
              </div>
              <Picks {...pickProps} />
              <div className="lm-dialog-bottom">
                <button type="button" className="lm-primary" onClick={() => setPicksOpen(false)}>
                  Keep exploring
                  <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
