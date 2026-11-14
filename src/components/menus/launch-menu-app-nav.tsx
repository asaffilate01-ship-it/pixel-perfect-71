import { Link } from "@tanstack/react-router";
import { WhatsAppOrderLink } from "@/components/whatsapp-order-link";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Ellipsis,
  Gamepad2,
  Home,
  LayoutGrid,
  MapPin,
  ShoppingBag,
  UtensilsCrossed,
  UserRound,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { useCustomerEntryPolicy } from "@/components/use-customer-entry-policy";
import "@/styles.launch-app.css";

type AppBrand = { id: string; name: string; logo: string };
type MenuSheet = "brands" | "more";

/** One mobile navigation bar; basket contents remain owned by LaunchMenuBrowser. */
export function LaunchMenuAppNav({
  brands,
  brandId,
  count,
  basketOpen,
  dialogOpen,
  onMenus,
  onBrand,
  onBasket,
  onCheckout,
}: {
  brands: readonly AppBrand[];
  brandId: string | undefined;
  count: number;
  basketOpen: boolean;
  dialogOpen: boolean;
  onMenus: () => void;
  onBrand: (id: string) => void;
  onBasket: () => void;
  onCheckout: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const entryPolicy = useCustomerEntryPolicy();
  const groupOrderingOpen =
    !!entryPolicy &&
    Date.parse(entryPolicy.serverNow) >= Date.parse(entryPolicy.registrationResumesAt);
  const [sheet, setSheet] = useState<MenuSheet>("brands");
  const [sheetOpen, setSheetOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const navigatingAway = useRef(false);
  const sheetId = useId();
  const active = sheetOpen ? sheet : basketOpen ? "basket" : "menus";

  useEffect(() => {
    if (dialogOpen) setSheetOpen(false);
  }, [dialogOpen]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 800px)");
    const closeOnDesktop = () => {
      if (!mobile.matches) setSheetOpen(false);
    };
    mobile.addEventListener("change", closeOnDesktop);
    return () => mobile.removeEventListener("change", closeOnDesktop);
  }, []);

  function openSheet(next: MenuSheet, trigger: HTMLButtonElement) {
    navigatingAway.current = false;
    triggerRef.current = trigger;
    setSheet(next);
    setSheetOpen(true);
  }

  function followLink() {
    navigatingAway.current = true;
    setSheetOpen(false);
  }

  return (
    <>
      <div className="lma-nav-clearance" aria-hidden="true" />
      <nav className="lma-app-nav" aria-label="Ordering navigation" data-has-checkout={count > 0} hidden={dialogOpen || sheetOpen}>
        <button
          type="button"
          className="lma-tab"
          data-active={active === "menus"}
          aria-current={active === "menus" ? "page" : undefined}
          onClick={onMenus}
        >
          <span className="lma-tab-icon">
            <UtensilsCrossed size={21} aria-hidden="true" />
          </span>
          <span>Order Now</span>
        </button>
        <button
          type="button"
          className="lma-tab"
          data-active={active === "brands"}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen && sheet === "brands"}
          aria-controls={sheetOpen && sheet === "brands" ? sheetId : undefined}
          onClick={(event) => openSheet("brands", event.currentTarget)}
        >
          <span className="lma-tab-icon">
            <LayoutGrid size={21} aria-hidden="true" />
          </span>
          <span>Brands</span>
        </button>
        <button
          type="button"
          className="lma-tab lma-tab-basket"
          data-active={active === "basket"}
          data-launch-basket-trigger="mobile"
          onClick={onBasket}
          aria-label={`View basket, ${count} ${count === 1 ? "selection" : "selections"}`}
          aria-haspopup="dialog"
          aria-expanded={basketOpen}
          aria-controls={basketOpen ? "launch-menu-dialog" : undefined}
        >
          <span className="lma-tab-icon">
            <ShoppingBag size={22} aria-hidden="true" />
            <span className="lma-basket-count" aria-hidden="true">
              {count > 99 ? "99+" : count}
            </span>
          </span>
          <span>Basket</span>
        </button>
        {count > 0 && (
          <Link
            to="/checkout"
            className="lma-tab lma-tab-checkout"
            onClick={onCheckout}
            aria-label={"Continue to checkout with " + count + (count === 1 ? " item" : " items")}
          >
            <span className="lma-tab-icon">
              <ArrowRight size={22} aria-hidden="true" />
            </span>
            <span>Checkout</span>
          </Link>
        )}
        <button
          type="button"
          className="lma-tab"
          data-active={active === "more"}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen && sheet === "more"}
          aria-controls={sheetOpen && sheet === "more" ? sheetId : undefined}
          onClick={(event) => openSheet("more", event.currentTarget)}
        >
          <span className="lma-tab-icon">
            <Ellipsis size={23} aria-hidden="true" />
          </span>
          <span>More</span>
        </button>
      </nav>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent
          id={sheetId}
          className="lma-sheet translate-x-0 translate-y-0"
          overlayClassName="lma-sheet-overlay"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            headingRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (navigatingAway.current || dialogOpen) return;
            const trigger = triggerRef.current;
            if (
              trigger?.isConnected &&
              trigger.getClientRects().length &&
              window.getComputedStyle(trigger).visibility !== "hidden"
            ) {
              trigger.focus({ preventScroll: true });
            } else {
              document
                .querySelector<HTMLButtonElement>(
                  "#launch-brand-selector button[aria-pressed='true']",
                )
                ?.focus({ preventScroll: true });
            }
          }}
        >
          <div className="lma-sheet-content">
            <div className="lma-sheet-handle" aria-hidden="true" />
            <div className="lma-sheet-heading">
              <p className="lma-sheet-eyebrow">MealDeck</p>
              <DialogTitle className="lma-sheet-title" ref={headingRef} tabIndex={-1}>
                {sheet === "brands" ? "Pick your craving." : "More from the deck."}
              </DialogTitle>
              <DialogDescription className="lma-sheet-description">
                {sheet === "brands"
                  ? "Five brands, one basket. Your choices stay with you when you switch menus."
                  : "Explore MealDeck and keep your favourites within reach."}
              </DialogDescription>
            </div>

            {sheet === "brands" ? (
              <div className="lma-brand-list">
                {brands.map((brand) => (
                  <button
                    key={brand.id}
                    type="button"
                    className="lma-brand-choice"
                    aria-pressed={brand.id === brandId}
                    onClick={() => {
                      setSheetOpen(false);
                      onBrand(brand.id);
                    }}
                  >
                    <img src={brand.logo} alt="" width={78} height={54} />
                    <span>
                      <strong>{brand.name}</strong>
                      <small>{brand.id === brandId ? "Viewing now" : "View menu"}</small>
                    </span>
                    {brand.id === brandId ? (
                      <Check size={20} aria-hidden="true" />
                    ) : (
                      <ArrowUpRight size={19} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="lma-more-content">
                <nav className="lma-more-links" aria-label="Explore MealDeck">
                  <Link to="/group-order" onClick={followLink}>
                    <Users size={21} aria-hidden="true" />
                    <span>
                      {groupOrderingOpen
                        ? "Group order · Choose together"
                        : "Group ordering · Starting 9 November"}
                    </span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                  <Link to="/account" onClick={followLink}>
                    <UserRound size={21} aria-hidden="true" />
                    <span>My account &amp; rewards</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                  <Link to="/" onClick={followLink}>
                    <Home size={21} aria-hidden="true" />
                    <span>Home</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                  <Link to="/" hash="locations" onClick={followLink}>
                    <MapPin size={21} aria-hidden="true" />
                    <span>Locations</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                  <Link to="/play" onClick={followLink}>
                    <Gamepad2 size={21} aria-hidden="true" />
                    <span>Play &amp; rewards</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </nav>
                <PwaInstallCard />
                <Link to="/offers" onClick={followLink} className="lma-more-note">
                  Offers &amp; member benefits
                </Link>
                <p className="lma-more-note">
                  Order for Luton collection or kerbside during kitchen opening hours.
                </p>
                <WhatsAppOrderLink className="lma-more-note" onClick={followLink} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
