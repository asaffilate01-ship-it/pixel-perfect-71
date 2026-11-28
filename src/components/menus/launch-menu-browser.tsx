import { usePublicMenu } from "./use-public-menu";
import { GuidedOrderStart, useGuidedMenuStart } from "./guided-order-start";
import { rememberGuidedOrderMethod } from "@/lib/mealdeck-guided-order";
import { launchMenuItemDescriptor } from "@/lib/launch-menu-item-descriptor";
import { PublicMenuStatus } from "./public-menu-status";
import { MenuFavouriteButton, MenuFavourites } from "./menu-favourites";
import { useMenuFavourites } from "./use-menu-favourites";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowRight, ChevronRight, Layers3, Plus, Search, ShoppingBag, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { useOwnDriverAvailability } from "@/components/own-driver-offer-banner";
import { MenuInstallPrompt } from "@/components/menus/menu-install-prompt";
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
import {
  getLaunchDessertRecommendations,
  type LaunchDessertRecommendation,
} from "@/lib/launch-menu-desserts";
import { approvedBrandLogos, type ApprovedBrandId } from "@/lib/brand-logos";
import { marketingBrands } from "@/lib/marketing-brands";
import { getMealDeckMenuPage } from "@/lib/mealdeck-menu-seo";
import { getLaunchMenuScrollTarget } from "@/lib/launch-menu-navigation";
import { findOtherBrandMenuMatches, matchesLaunchMenuSearch, OTHER_BRAND_SEARCH_LIMIT } from "@/lib/launch-menu-search";
import type { MealDeckPublicMenuSnapshot } from "@/lib/mealdeck-public-menu";
import {
  getLaunchMenuBrand,
  isLaunchBrandPriceApproved,
  type LaunchMenuUpsell,
} from "@/lib/launch-menu-catalogue";
import {
  formatLaunchMenuPrice,
  formatLaunchMenuItemPrice,
  launchMenuOfferBasketDisplayPrice,
} from "@/lib/launch-menu-display-prices";
import "@/styles.launch-prices.css";
import { prepareLaunchCheckout } from "@/lib/launch-basket-transfer";
import {
  LAUNCH_BASKET_EXPIRY_NOTICE,
  decodeTimedLaunchBasket,
  emptyTimedLaunchBasket,
  encodeTimedLaunchBasket,
  expireTimedLaunchBasket,
  updateTimedLaunchBasket,
  type TimedLaunchBasket,
} from "@/lib/launch-basket-expiration";
import {
  LAUNCH_PICKS_STORAGE_KEY,
  addLaunchPick,
  canQuickAddLaunchItem,
  findLaunchMenuItem,
  launchItemGroups,
  launchPickCount,
  setLaunchPickQuantity,
  updateLaunchPick,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "@/lib/launch-menu-picks";

const brandOrder = ["skorch-burgers", "tavo-chicken", "souvano", "loadd", "moktl"];
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
    ].find(isVisibleFocusTarget) ?? undefined
  );
}

function LaunchDessertUpsells({
  recommendations,
  onAdd,
}: {
  recommendations: LaunchDessertRecommendation[];
  onAdd: (entry: LaunchDessertRecommendation) => void;
}) {
  if (!recommendations.length) return null;
  return (
    <section className="lm-dessert-upsell" aria-label="Dessert suggestions">
      <span className="lm-eyebrow">Desserts</span>
      <h3>Finish with a milkcake</h3>
      <div className="lm-dessert-choices">
        {recommendations.map((entry) => (
          <button
            key={entry.item.id}
            type="button"
            onClick={() => onAdd(entry)}
            aria-label={
              "Add " +
              entry.item.name +
              " from " +
              entry.brand.name +
              " for " +
              formatLaunchMenuItemPrice(entry.item)
            }
          >
            <span className="lm-dessert-copy">
              <strong>{entry.item.name}</strong>
              <small>{entry.brand.name}</small>
            </span>
            <span className="lm-dessert-add">
              <strong>{formatLaunchMenuItemPrice(entry.item)}</strong>
              <span>
                <Plus size={16} aria-hidden="true" /> Add
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function LaunchMenuBrowser({
  requestedBrandId,
  requestedSectionId,
  initialMenu,
}: {
  requestedBrandId?: string | undefined;
  requestedSectionId?: string | undefined;
  initialMenu?: MealDeckPublicMenuSnapshot | null | undefined;
}) {
  const navigate = useNavigate();
  const deliveryLive = useOwnDriverAvailability();
  const flow = useGuidedMenuStart(deliveryLive);
  const focusNext = useRef(false);
  const [brandChosen, setBrandChosen] = useState(false);
  const showDishes = flow.ready && (Boolean(requestedBrandId) || brandChosen);
  useEffect(() => {
    if (flow.ready && focusNext.current) {
      focusNext.current = false;
      document.getElementById("launch-brand-selector")?.focus();
    }
  }, [flow.ready]);
  const publicMenu = usePublicMenu(initialMenu);
  const favourites = useMenuFavourites();
  const { catalogue } = publicMenu;
  const brand = getLaunchMenuBrand(requestedBrandId ?? "skorch-burgers", catalogue);
  const menuPage = getMealDeckMenuPage(brand?.id);
  const pendingBrand = marketingBrands.find((entry) => entry.id === requestedBrandId);
  const [search, setSearch] = useState("");
  const [basket, setBasket] = useState<TimedLaunchBasket>(emptyTimedLaunchBasket);
  const basketRef = useRef<TimedLaunchBasket>(emptyTimedLaunchBasket());
  const picks = basket.picks;
  const [clearedPicks, setClearedPicks] = useState<TimedLaunchBasket | null>(null);
  const [draft, setDraft] = useState<LaunchItemDraft | null>(null);
  const [picksOpen, setPicksOpen] = useState(false);
  const [notice, setNotice] = useState<LaunchBasketUpdate | null>(null);
  const [storageStatus, setStorageStatus] = useState<LaunchBasketStorageStatus>("checking");
  const [saveError, setSaveError] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const basketHeadingRef = useRef<HTMLHeadingElement>(null);
  const desktopBasketHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    try {
      // Old v1 baskets lack item age, so they are not silently kept indefinitely.
      const restored = decodeTimedLaunchBasket(window.localStorage.getItem(LAUNCH_PICKS_STORAGE_KEY));
      basketRef.current = restored;
      setBasket(restored);
      window.localStorage.setItem(LAUNCH_PICKS_STORAGE_KEY, encodeTimedLaunchBasket(restored));
      setStorageStatus("saved");
    } catch {
      /* Browsing still works with ephemeral, twenty-minute timed picks. */
      setStorageStatus("session");
    }
  }, []);
  useEffect(() => {
    const prune = () => {
      const before = basketRef.current;
      const next = expireTimedLaunchBasket(before);
      if (next === before) return;
      basketRef.current = next;
      setBasket(next);
      setClearedPicks(null);
      persistPicks(next);
      setNotice({ message: LAUNCH_BASKET_EXPIRY_NOTICE, tone: "info" });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAUNCH_PICKS_STORAGE_KEY) return;
      const restored = decodeTimedLaunchBasket(event.newValue);
      basketRef.current = restored;
      setBasket(restored);
      setClearedPicks(null);
    };
    const visible = () => { if (document.visibilityState === "visible") prune(); };
    const timer = window.setInterval(prune, 1000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", prune);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", prune);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    setSearch("");
  }, [brand?.id]);
  useEffect(() => {
    if (picksOpen) basketHeadingRef.current?.focus();
  }, [picksOpen]);
  useEffect(() => {
    if (!showDishes) { setDraft(null); setPicksOpen(false); }
  }, [showDishes]);

  function persistPicks(next: TimedLaunchBasket) {
    try {
      window.localStorage.setItem(LAUNCH_PICKS_STORAGE_KEY, encodeTimedLaunchBasket(next));
      setStorageStatus("saved");
      return true;
    } catch {
      /* Keep this session's picks and expiry timestamps. */
      setStorageStatus("session");
      return false;
    }
  }

  function acceptBasket(next: TimedLaunchBasket) {
    basketRef.current = next;
    setBasket(next);
    persistPicks(next);
  }

  function updatePicks(next: LaunchMenuPick[]) {
    acceptBasket(updateTimedLaunchBasket(basketRef.current, next));
    setClearedPicks(null);
  }

  function retrySave() {
    // Retry only this visit's surviving basket and original expiry timestamps.
    const current = expireTimedLaunchBasket(basketRef.current);
    basketRef.current = current;
    setBasket(current);
    const saved = persistPicks(current);
    setNotice({
      message: saved ? "Basket saved on this device." : "Your basket is still here for this visit.",
      tone: saved ? "success" : "info",
    });
    return saved;
  }

  function emptyBasket() {
    const previous = expireTimedLaunchBasket(basketRef.current);
    if (!previous.picks.length) return;
    updatePicks([]);
    setClearedPicks(previous);
    setNotice({ message: "Basket emptied." });
  }

  function undoEmptyBasket() {
    if (!clearedPicks || basketRef.current.picks.length) return;
    const restored = expireTimedLaunchBasket(clearedPicks);
    acceptBasket(restored);
    setClearedPicks(null);
    setNotice({
      message: restored.picks.length ? "Your remaining basket items have been restored." : LAUNCH_BASKET_EXPIRY_NOTICE,
      tone: restored.picks.length ? "success" : "info",
    });
  }

  function browse(brandId: string, sectionId?: string, target: "brand" | "items" = "brand") {
    if (!flow.ready) return;
    setBrandChosen(true);
    setSearch("");
    const scrollTarget = getLaunchMenuScrollTarget(sectionId, target);
    const page = getMealDeckMenuPage(brandId);
    const navigation = page
      ? navigate({
          to: "/menus/$brandId",
          params: { brandId: page.brandId },
          search: sectionId ? { section: sectionId } : {},
          resetScroll: scrollTarget === "top",
        })
      : navigate({
          to: "/menus",
          search: { brand: brandId, ...(sectionId ? { section: sectionId } : {}) },
          resetScroll: scrollTarget === "top",
        });
    void navigation.then(() => {
      requestAnimationFrame(() => {
        if (scrollTarget === "top") {
          // Switching brands must show the beginning of its page, on mobile and desktop.
          window.scrollTo({ top: 0, behavior: "instant" });
          return;
        }
        // Section shortcuts and Order Now still take the customer to the food.
        document.getElementById("launch-menu-items")?.scrollIntoView({ block: "start" });
      });
    });
  }

  function openItem(entry: LaunchMenuEntry, existing?: LaunchMenuPick) {
    if (!showDishes || !publicMenu.ready || entry.item.available === false) return;
    // Simple dishes with no selectable modifiers can be added in one tap.
    // Products with choices retain their complete customisation and validation.
    if (!existing && canQuickAddLaunchItem(entry.item)) {
      const livePicks = expireTimedLaunchBasket(basketRef.current).picks;
      const next = addLaunchPick(livePicks, entry.brand.id, entry.item.id, {}, 1);
      if (next !== livePicks) {
        updatePicks(next);
        setNotice({ message: entry.item.name + " added to your basket." });
      } else {
        setNotice({ message: "Your basket is full. Review your choices to continue.", tone: "info" });
      }
      return;
    }
    if (!picksOpen)
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSaveError("");
    setNotice(null);
    setDraft({ ...entry, ...(existing ? { existing } : {}) });
    setPicksOpen(false);
  }

  function savePick(
    selections: LaunchMenuSelections,
    quantity: number,
    crossSelections: LaunchCrossSelection[],
  ) {
    if (
      !showDishes ||
      !draft ||
      !publicMenu.ready ||
      findLaunchMenuItem(draft.brand.id, draft.item.id, catalogue)?.item.available === false
    )
      return;
    const livePicks = expireTimedLaunchBasket(basketRef.current).picks;
    const next = draft.existing
      ? updateLaunchPick(livePicks, draft.existing.key, selections, quantity, crossSelections)
      : addLaunchPick(livePicks, draft.brand.id, draft.item.id, selections, quantity, crossSelections);
    if (next === livePicks) {
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
    if (!showDishes || !basketRef.current.picks.length) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft(null);
    setNotice(null);
    setPicksOpen(true);
  }

  function addDessert(entry: LaunchDessertRecommendation) {
    if (!showDishes || !publicMenu.ready) return;
    const current = getLaunchDessertRecommendations(picks, catalogue, brand?.id).find(
      (candidate) => candidate.item.id === entry.item.id,
    );
    if (!current) return;
    const livePicks = expireTimedLaunchBasket(basketRef.current).picks;
    const next = addLaunchPick(livePicks, current.brand.id, current.item.id, {}, 1);
    if (next === livePicks) return;
    updatePicks(next);
    setNotice({ message: current.item.name + " added to your basket." });
    // The suggestions disappear once a dessert is present. Keep keyboard focus
    // inside the active basket rather than on a removed Add button.
    requestAnimationFrame(() => {
      const heading = picksOpen ? basketHeadingRef.current : desktopBasketHeadingRef.current;
      heading?.focus({ preventScroll: true });
    });
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

  function proceedToCheckout(event: MouseEvent<HTMLAnchorElement>) {
    if (!showDishes || !flow.method) { event.preventDefault(); return; }
    const live = expireTimedLaunchBasket(basketRef.current);
    if (!publicMenu.ready || basketPrice.itemsSubtotalPence === null || !live.picks.length
      || live.picks.length !== picks.length
      || live.picks.some((pick, index) => pick.key !== picks[index]?.key || pick.quantity !== picks[index]?.quantity)) {
      event.preventDefault();
      acceptBasket(live);
      setNotice({ message: LAUNCH_BASKET_EXPIRY_NOTICE, tone: "info" });
      return;
    }
    try {
      rememberGuidedOrderMethod(flow.method, flow.method === "delivery" ? flow.verifiedPostcode ?? undefined : undefined);
      prepareLaunchCheckout(live.picks, live);
      setPicksOpen(false);
    } catch {
      event.preventDefault();
      acceptBasket(expireTimedLaunchBasket(basketRef.current));
      setNotice({ message: LAUNCH_BASKET_EXPIRY_NOTICE, tone: "info" });
    }
  }

  const quantity = launchPickCount(picks);
  const basketPrice = launchMenuOfferBasketDisplayPrice(picks, catalogue);
  const dessertRecommendations = publicMenu.ready
    ? getLaunchDessertRecommendations(picks, catalogue, brand?.id)
    : [];
  const activeSection = brand?.sections.some((section) => section.id === requestedSectionId)
    ? requestedSectionId
    : undefined;
  const query = search.trim();
  const sections = (brand?.sections ?? [])
    .filter((section) => !!query || !activeSection || section.id === activeSection)
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => item.available !== false)
        .filter(
          (item) =>
            !query ||
            matchesLaunchMenuSearch(query, [
              brand?.name,
              item.name,
              item.description,
              section.title,
              section.description,
              ...(brand
                ? launchItemGroups(brand, item).flatMap((group) =>
                    group.options
                      .filter((option) =>
                        option.available !== false &&
                        (!publicMenu.ready || item.availableOptionIds?.includes(option.id) === true),
                      )
                      .map((option) => option.label),
                  )
                : []),
            ]),
        ),
    }))
    .filter((section) => section.items.length > 0);
  const visibleCount = sections.reduce((total, section) => total + section.items.length, 0);
  const currentBrandId = brand?.id;
  const otherMatches = useMemo(
    () => publicMenu.ready && currentBrandId
      ? findOtherBrandMenuMatches(query, catalogue, currentBrandId)
      : [],
    [query, catalogue, currentBrandId, publicMenu.ready],
  );
  const pairingSections: Record<string, string> = {
    "skorch-burgers": "beef-smash-deck",
    "tavo-chicken": "burgers",
    souvano: "heatwave",
    loadd: "loaded-fries",
    moktl: "mocktail-lounge",
  };
  const pairingOrder = ["loadd", "moktl", "skorch-burgers", "tavo-chicken", "souvano"];
  const pairings: LaunchMenuEntry[] = pairingOrder
    .filter((id) => id !== brand?.id && isLaunchBrandPriceApproved(id))
    .flatMap((id) => {
      const pairing = getLaunchMenuBrand(id, catalogue);
      const section = pairing?.sections.find((entry) => entry.id === pairingSections[id]);
      const item = section?.items.find((item) => item.available !== false);
      return pairing && section && item ? [{ brand: pairing, section, item }] : [];
    });
  const discoveryEntries = query ? otherMatches : pairings;
  const pickProps = {
    picks,
    onClear: emptyBasket,
    onUndoClear: undoEmptyBasket,
    canUndoClear: !!clearedPicks && picks.length === 0,
    storageStatus,
    onRetrySave: retrySave,
    onQuantity: (key: string, value: number) =>
      updatePicks(setLaunchPickQuantity(expireTimedLaunchBasket(basketRef.current).picks, key, value)),
    onEdit: (pick: LaunchMenuPick) => {
      const entry = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);
      if (entry) openItem(entry, pick);
    },
    onRemove: (pick: LaunchMenuPick) => {
      const entry = findLaunchMenuItem(pick.brandId, pick.itemId, catalogue);
      updatePicks(setLaunchPickQuantity(expireTimedLaunchBasket(basketRef.current).picks, pick.key, 0));
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
      <PublicMenuStatus />
      <main className="lm-main">
        {menuPage && (
          <nav className="lm-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">MealDeck</Link>
            <span aria-hidden="true">/</span>
            <Link to="/menus">Luton menus</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{menuPage.brandName}</span>
          </nav>
        )}
        <div className="lm-page-heading">
          <span className="lm-eyebrow">MealDeck Luton</span>
          <p>Five menus. Every craving.</p>
          <span className="lm-launch-label">
            <span>
              Luton ·{" "}
              {deliveryLive ? "Free delivery, collection & kerbside" : "Collection & kerbside"}
            </span>
            <img
              className="lm-halal-mark"
              src="/halal-mark.svg"
              alt="All food is halal"
              width="40"
              height="40"
            />
          </span>
        </div>
        <GuidedOrderStart flow={flow} showDishes={showDishes} onChoice={() => { focusNext.current = true; }} />
        <div className="lm-order-reveal" hidden={!flow.ready}>
        <div className="lm-group-entry">
          <p>
            <strong>Ordering together?</strong>{" "}
            Choose a private room and check whether group ordering is accepting new orders.
          </p>
          <Link to="/group-order">
            Explore group ordering{" "}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <MenuInstallPrompt />
        <nav
          id="launch-brand-selector"
          className="lm-brand-selector"
          aria-label="Choose a brand menu"
          tabIndex={-1}
        >
          {brandOrder.map((id) => {
            const entry = getLaunchMenuBrand(id, catalogue);
            return entry ? (
              <Link
                key={id}
                to="/menus/$brandId"
                params={{ brandId: id }}
                search={{}}
                aria-current={showDishes && brand?.id === id ? "page" : undefined}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  browse(id);
                }}
                className={showDishes && brand?.id === id ? "is-active" : ""}
              >
                <img src={logoFor(id)} alt="" width="165" height="110" />
                <span>{entry.name}</span>
                <small>
                  {!isLaunchBrandPriceApproved(id)
                    ? "Prices coming soon"
                    : showDishes && brand?.id === id
                      ? "On the menu"
                      : "View menu"}
                </small>
              </Link>
            ) : null;
          })}
        </nav>

        {!showDishes && flow.ready && <p className="lm-order-stage-hint" role="status">Step 2 · Choose a brand to see its dishes. Mix all five brands in one basket.</p>}
        <div className="lm-order-reveal" hidden={!showDishes}>
        {brand ? (
          <>
            <header className="lm-brand-heading">
              <div>
                <span className="lm-eyebrow">{brand.name} by MealDeck / Luton menu</span>
                <h1>{menuPage?.heading ?? brand.name}</h1>
                <p>{menuPage?.intro ?? brand.description}</p>
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

            {!isLaunchBrandPriceApproved(brand.id) && (
              <p className="lm-price-pending">
                <strong>Souvano’s next hand is on its way.</strong> Browse the menu while we prepare
                the updated prices. These dishes cannot be ordered yet.
              </p>
            )}

            <LaunchMenuMobileNav
              brandId={brand.id}
              brandName={brand.name}
              brands={brandOrder.flatMap((id) => {
                const entry = getLaunchMenuBrand(id, catalogue);
                return entry ? [{ id: entry.id, name: entry.name }] : [];
              })}
              sections={brand.sections.map((entry) => ({ id: entry.id, name: entry.title }))}
              activeSection={activeSection}
              search={search}
              count={visibleCount}
              otherCount={otherMatches.length}
              onBrand={(id) => browse(id)}
              onSection={(id) => browse(brand.id, id, "items")}
              onSearch={setSearch}
            />
            <div className="lm-menu-toolbar">
              <label className="lm-search">
                <Search size={19} aria-hidden="true" />
                <span className="sr-only">Search all MealDeck menus</span>
                <input
                  type="search"
                  placeholder="Search dishes, flavours or brands…"
                  maxLength={120}
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
                {visibleCount} {visibleCount === 1 ? "item" : "items"} in {brand.name}
                {query && otherMatches.length > 0 && ` · ${otherMatches.length}${otherMatches.length === OTHER_BRAND_SEARCH_LIMIT ? "+" : ""} across other menus`}
              </span>
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
                <MenuFavourites favourites={favourites} catalogue={catalogue} liveReady={publicMenu.ready} onChoose={openItem} />
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
                            <li key={item.id} className="lm-dish-row">
                              <button
                                type="button"
                                className="lm-dish"
                                disabled={!publicMenu.ready || item.available === false}
                                onClick={() => openItem({ brand, section, item })}
                                aria-label={
                                  "Add " +
                                  item.name +
                                  " from " +
                                  section.title +
                                  " · choose options"
                                }
                                aria-describedby={"launch-price-" + item.id}
                              >
                                <span>
                                  <span className="lm-dish-title-line">
                                    <strong>{item.name}</strong>
                                    {launchMenuItemDescriptor(brand, section, item) && (
                                      <span className="lm-dish-kind">
                                        {launchMenuItemDescriptor(brand, section, item)}
                                      </span>
                                    )}
                                  </span>
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
                                    {item.priceVariants?.length ? "From " : ""}
                                    {formatLaunchMenuItemPrice(item)}
                                    <span className="sr-only"> per item</span>
                                  </span>
                                  <span className="lm-add-label" aria-hidden="true">
                                    Add
                                  </span>
                                </span>
                              </button>
                              <MenuFavouriteButton favourites={favourites} entry={{ brand, section, item }} />
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
                    <h2>{query ? "No matching dishes in " + brand.name : "No dishes found"}</h2>
                    <p>{otherMatches.length > 0
                      ? "Matching dishes from other brands are shown below."
                      : "Try another dish or flavour, or view the full menu."}</p>
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

                {discoveryEntries.length > 0 && (
                <section className="lm-pairings" aria-labelledby="pairing-title">
                  <div>
                    <span className="lm-eyebrow">Across the deck</span>
                    <h2 id="pairing-title">{query ? "Matches from other brands" : "Something on the side?"}</h2>
                    <p>{query
                      ? "Current dishes across the other menus. Refine your search to see more specific results."
                      : "Add another brand to your basket. Each dish is a separate extra; meal upgrades stay with your main."}</p>
                  </div>
                  <div className="lm-pairing-grid">
                    {discoveryEntries.map((entry) => (
                      <button
                        type="button"
                        key={entry.brand.id + ":" + entry.item.id}
                        disabled={!publicMenu.ready || entry.item.available === false}
                        onClick={() => openItem(entry)}
                        aria-label={"Add " + entry.item.name + " from " + entry.brand.name}
                        aria-describedby={"pairing-price-" + entry.brand.id + "-" + entry.item.id}
                      >
                        <img src={logoFor(entry.brand.id)} alt="" width="90" height="65" />
                        <span>
                          <strong>{entry.item.name}</strong>
                          <small>
                            {entry.brand.name} · {entry.section.title}
                          </small>
                          <span className="lm-pairing-price" id={"pairing-price-" + entry.brand.id + "-" + entry.item.id}>
                            {entry.item.priceVariants?.length ? "From " : ""}
                            {formatLaunchMenuItemPrice(entry.item)}
                            <span className="sr-only"> per item</span>
                          </span>
                        </span>
                        <span className="lm-pairing-add" aria-hidden="true">
                          Add
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                )}
              </div>

              <aside className="lm-sidebar" aria-label="Your basket and meal upgrades">
                {(quantity > 0 || !!clearedPicks) && <section className="lm-picks-panel">
                  <div className="lm-picks-title">
                    <h2
                      className="lm-basket-title-brand"
                      ref={desktopBasketHeadingRef}
                      tabIndex={-1}
                    >
                      <MealDeckLogo className="lm-basket-logo" decorative loading="lazy" />
                      <ShoppingBag size={20} aria-hidden="true" />
                      Your basket
                    </h2>
                    <span>{quantity}</span>
                  </div>
                  <LaunchBasket {...pickProps} />
                  <LaunchDessertUpsells
                    recommendations={dessertRecommendations}
                    onAdd={addDessert}
                  />
                  {quantity > 0 && (
                    <div className="lm-checkout-entry">
                      <Link
                        to="/checkout"
                        className="lm-primary"
                        onClick={proceedToCheckout}
                      >
                        Review &amp; checkout <ArrowRight size={18} aria-hidden="true" />
                      </Link>
                      <p>
                        Basket items expire after 20 minutes.{" "}
                        {deliveryLive
                          ? "Collection and kerbside have no minimum; free delivery requires £15 after discounts within 4 km of LU4 8NU."
                          : "No minimum order for collection or kerbside."}{" "}
                        Guests and members welcome. Verified members earn points on eligible paid orders.{" "}
                        <Link to="/account">Member benefits</Link>
                      </p>
                    </div>
                  )}
                </section>}
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

        </div>
        </div>
        {menuPage && (
          <section className="lm-local-guide" aria-labelledby="menu-local-guide-title">
            <span className="lm-eyebrow">{menuPage.brandName} at MealDeck Luton</span>
            <h2 id="menu-local-guide-title">Useful before you order</h2>
            <p>
              {deliveryLive
                ? "Free delivery within 4 km on orders £15+ after discounts, or collect from 314–318 Selbourne Road, Luton, LU4 8NU."
                : "Collection and kerbside pickup from 314–318 Selbourne Road, Luton, LU4 8NU."}{" "}
              <Link to="/luton">See the Luton kitchen and opening hours</Link>.
            </p>
            <div className="lm-local-faqs">
              {menuPage.faqs.map((faq) => (
                <details key={faq.q}>
                  <summary>{faq.q}</summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
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
            Five Luton menus · Item and upgrade prices shown.{" "}
            {deliveryLive
              ? "Free own-driver delivery within 4 km, £15 minimum after discounts; collection and kerbside also available."
              : "Collection and kerbside pickup; check local delivery availability at checkout."}
          </p>
        </footer>
      </main>
      <SiteFooter />
      {showDishes && quantity > 0 && <LaunchBasketDock
        count={quantity}
        dialogOpen={!!draft || picksOpen}
        feedbackMessage={
          notice?.tone !== "info" && !(clearedPicks && picks.length === 0)
            ? (notice?.message ?? null)
            : null
        }
        onOpen={openBasket}
      />}
      {showDishes && <LaunchMenuAppNav
        brands={brandOrder.flatMap((id) => {
          const entry = getLaunchMenuBrand(id, catalogue);
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
        onBrand={(id) => browse(id)}
        onBasket={openBasket}
        onCheckout={proceedToCheckout}
      />}
      <LaunchBasketFeedback
        update={notice}
        dialogOpen={!!draft || picksOpen}
        canUndo={!!clearedPicks && picks.length === 0}
        onUndo={() => {
          undoEmptyBasket();
          requestAnimationFrame(() => visibleBasketTrigger()?.focus({ preventScroll: true }));
        }}
        onExpire={(expired) => setNotice((current) => (current === expired ? null : current))}
        onDismiss={() => {
          setNotice(null);
          requestAnimationFrame(() => visibleBasketTrigger()?.focus({ preventScroll: true }));
        }}
      />

      <Dialog
        open={showDishes && (!!draft || picksOpen)}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            setPicksOpen(false);
            setNotice(null);
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
              basketPicks={picks}
              onSave={savePick}
              onBack={() => {
                setDraft(null);
                setPicksOpen(!!draft.existing);
              }}
              error={saveError}
            />
          ) : (
            <div className="lm-basket-sheet-content">
              <div className="lm-dialog-heading">
                <MealDeckLogo
                  className="lm-basket-logo lm-basket-logo-dialog"
                  decorative
                  loading="lazy"
                />
                <span className="lm-eyebrow">Your MealDeck line-up</span>
                <DialogTitle className="lm-dialog-title" ref={basketHeadingRef} tabIndex={-1}>
                  Your basket <span>({quantity})</span>
                </DialogTitle>
                <DialogDescription className="lm-dialog-description">
                  Mix brands and make it yours.{" "}
                  {storageStatus === "session"
                    ? "Keep this page open: this browser couldn’t save your current basket."
                    : storageStatus === "checking"
                      ? "Checking your saved choices."
                      : "Your basket is saved for a maximum of 20 minutes per item."}{" "}
                  Confirm current prices and{" "}
                  fulfilment availability at checkout.
                </DialogDescription>
              </div>
              <div className="lm-basket-scroll">
                <LaunchBasket {...pickProps} />
                <LaunchDessertUpsells recommendations={dessertRecommendations} onAdd={addDessert} />
              </div>
              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {notice?.message ?? ""}
              </p>
              <div className="lm-dialog-bottom lm-basket-footer">
                {quantity > 0 && (
                  <div className="lm-basket-footer-total">
                    <span>Items subtotal</span>
                    <strong>{formatLaunchMenuPrice(basketPrice.itemsSubtotalPence)}</strong>
                  </div>
                )}
                {quantity > 0 && (
                  <Link
                    to="/checkout"
                    className="lm-primary"
                    onClick={proceedToCheckout}
                  >
                    Review &amp; checkout <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                )}
                <button
                  type="button"
                  className={quantity > 0 ? "lm-basket-continue" : "lm-primary"}
                  onClick={() => {
                    setPicksOpen(false);
                    setNotice(null);
                  }}
                >
                  Keep exploring
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
