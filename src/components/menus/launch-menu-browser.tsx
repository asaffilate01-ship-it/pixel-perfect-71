import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronRight, Layers3, Plus, Search, ShoppingBag, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  LaunchBasket,
  LaunchBasketDock,
  type LaunchBasketStorageStatus,
} from "@/components/menus/launch-basket";
import {
  LaunchBasketFeedback,
  type LaunchBasketUpdate,
} from "@/components/menus/launch-basket-feedback";
import { LaunchMenuMobileNav } from "@/components/menus/launch-menu-mobile-nav";
import { LaunchMenuAppNav } from "@/components/menus/launch-menu-app-nav";
import {
  LaunchItemCustomiser,
  type LaunchItemDraft,
  type LaunchMenuEntry,
} from "@/components/menus/launch-item-customiser";
import type { LaunchCrossSelection } from "@/lib/launch-menu-upsells";
import { approvedBrandLogos, type ApprovedBrandId } from "@/lib/brand-logos";
import { marketingBrands } from "@/lib/marketing-brands";
import { getLaunchMenuBrand, type LaunchMenuUpsell } from "@/lib/launch-menu-catalogue";
import {
  formatLaunchMenuPrice,
  launchMenuBasketDisplayPrice,
} from "@/lib/launch-menu-display-prices";
import "@/styles.launch-prices.css";
import {
  LAUNCH_PICKS_STORAGE_KEY,
  addLaunchPick,
  decodeLaunchPicks,
  encodeLaunchPicks,
  findLaunchMenuItem,
  launchItemGroups,
  launchPickCount,
  setLaunchPickQuantity,
  updateLaunchPick,
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

function isVisibleFocusTarget(element: HTMLElement | null | undefined): element is HTMLElement {
  return (
    !!element?.isConnected &&
    element.getClientRects().length > 0 &&
    window.getComputedStyle(element).visibility !== "hidden"
  );
}

function visibleBasketTrigger(): HTMLElement | undefined {
  // The fixed mobile bar replaces the dock only on phones. Never restore focus
  // to a dock/button hidden by the responsive layout or on-screen keyboard.
  return (
    [
      document.querySelector<HTMLButtonElement>('[data-launch-basket-trigger="mobile"]'),
      document.querySelector<HTMLButtonElement>(".lmb-dock-button"),
      document.querySelector<HTMLButtonElement>('[data-launch-basket-trigger="toolbar"]'),
    ].find(isVisibleFocusTarget) ?? undefined
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
  const [clearedPicks, setClearedPicks] = useState<LaunchMenuPick[] | null>(null);
  const [draft, setDraft] = useState<LaunchItemDraft | null>(null);
  const [picksOpen, setPicksOpen] = useState(false);
  const [notice, setNotice] = useState<LaunchBasketUpdate | null>(null);
  const [storageStatus, setStorageStatus] = useState<LaunchBasketStorageStatus>("checking");
  const [saveError, setSaveError] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const basketHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    try {
      setPicks(decodeLaunchPicks(window.localStorage.getItem(LAUNCH_PICKS_STORAGE_KEY)));
      setStorageStatus("saved");
    } catch {
      /* Browsing still works when storage is disabled. */
      setStorageStatus("session");
    }
  }, []);
  useEffect(() => {
    setSearch("");
  }, [brand?.id]);
  useEffect(() => {
    if (picksOpen) basketHeadingRef.current?.focus();
  }, [picksOpen]);

  function persistPicks(next: LaunchMenuPick[]) {
    try {
      window.localStorage.setItem(LAUNCH_PICKS_STORAGE_KEY, encodeLaunchPicks(next));
      setStorageStatus("saved");
      return true;
    } catch {
      /* Keep this session's picks. */
      setStorageStatus("session");
      return false;
    }
  }

  function updatePicks(next: LaunchMenuPick[]) {
    setPicks(next);
    setClearedPicks(null);
    persistPicks(next);
  }

  function retrySave() {
    // Retry only the latest in-memory basket. Reloading browser storage here
    // could replace choices made after a failed write with an older basket.
    const saved = persistPicks(picks);
    setNotice({
      message: saved ? "Basket saved on this device." : "Your basket is still here for this visit.",
      tone: saved ? "success" : "info",
    });
    return saved;
  }

  function emptyBasket() {
    if (!picks.length) return;
    const previous = picks;
    updatePicks([]);
    setClearedPicks(previous);
    setNotice({ message: "Basket emptied." });
  }

  function undoEmptyBasket() {
    if (!clearedPicks || picks.length) return;
    updatePicks(clearedPicks);
    setNotice({ message: "Your basket has been restored." });
  }

  function browse(brandId: string, sectionId?: string, target: "brand" | "items" = "brand") {
    setSearch("");
    void navigate({
      to: "/menus",
      search: { brand: brandId, ...(sectionId ? { section: sectionId } : {}) },
      resetScroll: false,
    }).then(() => {
      const mobile = window.matchMedia("(max-width: 800px)").matches;
      const destination =
        mobile || target === "items" || sectionId ? "launch-menu-items" : "launch-brand-selector";
      requestAnimationFrame(() => {
        document.getElementById(destination)?.scrollIntoView({ block: "start" });
      });
    });
  }

  function openItem(entry: LaunchMenuEntry, existing?: LaunchMenuPick) {
    if (!picksOpen)
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSaveError("");
    setDraft({ ...entry, ...(existing ? { existing } : {}) });
    setPicksOpen(false);
  }

  function savePick(
    selections: LaunchMenuSelections,
    quantity: number,
    crossSelections: LaunchCrossSelection[],
  ) {
    if (!draft) return;
    const next = draft.existing
      ? updateLaunchPick(picks, draft.existing.key, selections, quantity, crossSelections)
      : addLaunchPick(picks, draft.brand.id, draft.item.id, selections, quantity, crossSelections);
    if (next === picks) {
      setSaveError(
        "Your basket can hold up to 20 of a dish and 60 selections in total. Check your choices or reduce a quantity to continue.",
      );
      return;
    }
    updatePicks(next);
    setNotice({
      message:
        draft.item.name + (draft.existing ? " updated in your basket." : " added to your basket."),
    });
    setDraft(null);
    if (draft.existing) setPicksOpen(true);
  }

  function openBasket() {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft(null);
    setPicksOpen(true);
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
      setNotice({
        message:
          "Choose a " +
          (section.title.toLowerCase().includes("burger") || section.id === "beef-smash-deck"
            ? "burger"
            : "main") +
          " to explore " +
          upsell.label.toLowerCase() +
          ".",
        tone: "info",
      });
    }
  }

  const quantity = launchPickCount(picks);
  const basketPrice = launchMenuBasketDisplayPrice(picks);
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
  const pairingSections: Record<string, string> = {
    "skorch-burgers": "beef-smash-deck",
    "tavo-chicken": "burgers",
    souvano: "heatwave",
    loadd: "loaded-fries",
    moktl: "mocktail-lounge",
  };
  const pairingOrder = ["loadd", "moktl", "skorch-burgers", "tavo-chicken", "souvano"];
  const pairings: LaunchMenuEntry[] = pairingOrder
    .filter((id) => id !== brand?.id)
    .flatMap((id) => {
      const pairing = getLaunchMenuBrand(id);
      const section = pairing?.sections.find((entry) => entry.id === pairingSections[id]);
      const item = section?.items[0];
      return pairing && section && item ? [{ brand: pairing, section, item }] : [];
    });
  const pickProps = {
    picks,
    onClear: emptyBasket,
    onUndoClear: undoEmptyBasket,
    canUndoClear: !!clearedPicks && picks.length === 0,
    storageStatus,
    onRetrySave: retrySave,
    onQuantity: (key: string, value: number) =>
      updatePicks(setLaunchPickQuantity(picks, key, value)),
    onEdit: (pick: LaunchMenuPick) => {
      const entry = findLaunchMenuItem(pick.brandId, pick.itemId);
      if (entry) openItem(entry, pick);
    },
    onRemove: (pick: LaunchMenuPick) => {
      const entry = findLaunchMenuItem(pick.brandId, pick.itemId);
      updatePicks(setLaunchPickQuantity(picks, pick.key, 0));
      setNotice({ message: (entry?.item.name ?? "Item") + " removed from your basket." });
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

            <LaunchMenuMobileNav
              brandId={brand.id}
              brandName={brand.name}
              brands={brandOrder.flatMap((id) => {
                const entry = getLaunchMenuBrand(id);
                return entry ? [{ id: entry.id, name: entry.name }] : [];
              })}
              sections={brand.sections.map((entry) => ({ id: entry.id, name: entry.title }))}
              activeSection={activeSection}
              search={search}
              count={visibleCount}
              onBrand={(id) => browse(id, undefined, "items")}
              onSection={(id) => browse(brand.id, id, "items")}
              onSearch={setSearch}
            />
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
                data-launch-basket-trigger="toolbar"
                onClick={openBasket}
                aria-label={
                  "View basket, " + quantity + (quantity === 1 ? " selection" : " selections")
                }
              >
                <ShoppingBag size={18} />
                View basket<span>{quantity}</span>
              </button>
            </div>
            <nav className="lm-category-nav" aria-label={brand.name + " menu sections"}>
              <button
                type="button"
                className={!activeSection ? "is-active" : ""}
                aria-pressed={!activeSection}
                onClick={() => browse(brand.id, undefined, "items")}
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
                                aria-describedby={"launch-price-" + item.id}
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
                                <span className="lm-dish-action">
                                  <span className="lm-item-price" id={"launch-price-" + item.id}>
                                    {formatLaunchMenuPrice(item.pricePence)}
                                    <span className="sr-only"> per item</span>
                                  </span>
                                  <span className="lm-add-icon" aria-hidden="true">
                                    <Plus size={20} />
                                  </span>
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
                    <p>
                      Add another brand to your basket. Each dish is a separate extra; meal upgrades
                      stay with your main.
                    </p>
                  </div>
                  <div className="lm-pairing-grid">
                    {pairings.map((entry) => (
                      <button
                        type="button"
                        key={entry.brand.id}
                        onClick={() => openItem(entry)}
                        aria-label={"Add " + entry.item.name + " from " + entry.brand.name}
                        aria-describedby={"pairing-price-" + entry.item.id}
                      >
                        <img src={logoFor(entry.brand.id)} alt="" width="90" height="65" />
                        <span>
                          <strong>{entry.item.name}</strong>
                          <small>
                            {entry.brand.name} · {entry.section.title}
                          </small>
                          <span className="lm-pairing-price" id={"pairing-price-" + entry.item.id}>
                            {formatLaunchMenuPrice(entry.item.pricePence)}
                            <span className="sr-only"> per item</span>
                          </span>
                        </span>
                        <Plus size={20} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="lm-sidebar" aria-label="Your basket and meal upgrades">
                <section className="lm-picks-panel">
                  <div className="lm-picks-title">
                    <h2>
                      <ShoppingBag size={20} aria-hidden="true" />
                      Your basket
                    </h2>
                    <span>{quantity}</span>
                  </div>
                  <LaunchBasket {...pickProps} />
                </section>
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
            Launch menus · Item and upgrade prices shown. Any delivery charge is confirmed at
            checkout.
          </p>
        </footer>
      </main>
      <SiteFooter />
      <LaunchBasketDock count={quantity} onOpen={openBasket} />
      <LaunchMenuAppNav
        brands={brandOrder.flatMap((id) => {
          const entry = getLaunchMenuBrand(id);
          return entry ? [{ id: entry.id, name: entry.name, logo: logoFor(id) }] : [];
        })}
        brandId={brand?.id}
        count={quantity}
        basketOpen={picksOpen}
        dialogOpen={!!draft || picksOpen}
        onMenus={() => {
          const target =
            document.getElementById("launch-menu-items") ??
            document.getElementById("launch-brand-selector");
          target?.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        }}
        onBrand={(id) => browse(id, undefined, "items")}
        onBasket={openBasket}
      />
      <LaunchBasketFeedback
        update={notice}
        dialogOpen={!!draft || picksOpen}
        canUndo={!!clearedPicks && picks.length === 0}
        canViewBasket={picks.length > 0}
        onUndo={() => {
          undoEmptyBasket();
          requestAnimationFrame(() => visibleBasketTrigger()?.focus({ preventScroll: true }));
        }}
        onBasket={openBasket}
        onDismiss={() => {
          setNotice(null);
          requestAnimationFrame(() => visibleBasketTrigger()?.focus({ preventScroll: true }));
        }}
      />

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
          id="launch-menu-dialog"
          className={"lm-dialog " + (draft ? "lm-customise-dialog" : "lm-basket-dialog")}
          overlayClassName="lm-dialog-overlay"
          data-menu-brand={draft?.brand.id ?? brand?.id}
          style={
            { "--lm-accent": draft?.brand.accent ?? brand?.accent ?? "#951018" } as CSSProperties
          }
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = isVisibleFocusTarget(returnFocusRef.current)
              ? returnFocusRef.current
              : visibleBasketTrigger();
            target?.focus({ preventScroll: true });
          }}
        >
          {draft ? (
            <LaunchItemCustomiser
              key={draft.item.id + (draft.existing?.key ?? "new")}
              draft={draft}
              onSave={savePick}
              onBack={() => {
                setDraft(null);
                setPicksOpen(!!draft.existing);
              }}
              error={saveError}
            />
          ) : (
            <>
              <div className="lm-dialog-heading">
                <span className="lm-eyebrow">Your launch-day line-up</span>
                <DialogTitle className="lm-dialog-title" ref={basketHeadingRef} tabIndex={-1}>
                  Your basket <span>({quantity})</span>
                </DialogTitle>
                <DialogDescription className="lm-dialog-description">
                  Mix brands and make it yours.{" "}
                  {storageStatus === "session"
                    ? "Keep this page open: this browser couldn’t save your current basket."
                    : storageStatus === "checking"
                      ? "Checking your saved choices."
                      : "Your choices are saved on this device."}{" "}
                  Item prices are shown. Ordering is coming soon.
                </DialogDescription>
              </div>
              <LaunchBasket {...pickProps} />
              <div className="lm-dialog-bottom lm-basket-footer">
                {quantity > 0 && (
                  <div className="lm-basket-footer-total">
                    <span>Items subtotal</span>
                    <strong>{formatLaunchMenuPrice(basketPrice.itemsSubtotalPence)}</strong>
                  </div>
                )}
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
