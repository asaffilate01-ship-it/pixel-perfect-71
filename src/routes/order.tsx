import { COMING_SOON } from "@/lib/launch-status";
import { OrderingPreview } from "@/components/coming-soon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bike,
  CarFront,
  UtensilsCrossed,
  Check,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  PanelLeftOpen,
  ChevronRight,
  Heart,
  BookmarkPlus,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SiteFooter } from "@/components/site-footer";
import { checkServiceability, getCatalogue, placeOrder, estimateDishbeeDelivery } from "@/lib/dishbee.functions";
import {
  addItem,
  brandById,
  formatPence,
  fulfilmentLabels,
  itemCount,
  lineUnitPrice,
  locations,
  modifierGroupsFor,
  setQuantity,
  subtotal,
  type Brand,
  type CartLine,
  type FulfilmentType,
  type LocationKey,
  type MenuItem,
  type ModifierGroup,
  type ModifierOption,
  type SelectedModifier,
} from "@/lib/mealdeck";
import { SiteHeader } from "@/components/site-header";
import { marketplaceItemPhoto } from "@/lib/marketplace-photos";
import { suitArtwork } from "@/lib/food-suit-artwork";
import { BrandDiscoveryGallery, FavouriteDishRail } from "@/components/order/premium-discovery";
import { WhatsAppBasketHandoff } from "@/components/order/whatsapp-basket-handoff";
import {
  FAVOURITES_STORAGE_KEY, BASKET_STORAGE_KEY,
  decodeFavourites, toggleFavourite, encodeSavedBasket, decodeSavedBasket,
  restoreSavedBasket, type SavedBasket,
} from "@/lib/marketplace-preferences";
import { BROWSE_CATEGORIES, browseBrands, browseMenu, basketSuggestions, type BrowseCategory } from "@/lib/marketplace-discovery";
import { seo } from "@/lib/seo";
import {
  checkoutSnapshotFingerprint, getOrCreateCheckoutAttempt,
  type CheckoutAttempt,
} from "@/lib/mealdeck-checkout-attempt";

type OrderSearch = { brand?: string; fulfilment?: FulfilmentType };

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>): OrderSearch => {
    const next: OrderSearch = {};
    if (typeof search["brand"] === "string") next.brand = search["brand"];
    if (
      search["fulfilment"] === "delivery" ||
      search["fulfilment"] === "pickup" ||
      search["fulfilment"] === "curbside" ||
      search["fulfilment"] === "dinein"
    ) {
      next.fulfilment = search["fulfilment"];
    }
    return next;
  },
  head: () =>
    seo({
      title: "Coming soon — Preview our menu | MealDeck",
      description: "Enter your postcode and build one basket across every MealDeck brand. Delivery, pickup or kerbside in Luton; MealDeck St Albans is delivery only. Café 1 has separate direct ordering.",
      path: "/order",
    }),
  component: () => COMING_SOON ? <OrderingPreview /> : <OrderPage />,
});

const fulfilmentIcons = { delivery: Bike, pickup: Package, curbside: CarFront, dinein: UtensilsCrossed } as const;

const emptyCustomer = {
  name: "",
  phone: "",
  email: "",
  carMake: "",
  vehicleRegistration: "",
  address1: "",
  city: "",
  postcode: "",
  notes: "",
};

function BrandMark({ brand, className = "" }: { brand: Brand; className?: string }) {
  if (brand.logo) {
    return <img src={brand.logo} alt={`${brand.name} logo`} loading="lazy" className={`object-contain ${className}`} />;
  }
  return <span className={`flex items-center justify-center font-display font-bold text-gold ${className}`}>{brand.name}</span>;
}

function OrderPage() {
  const { brand: brandFromSearch, fulfilment: fulfilmentFromSearch } = Route.useSearch();
  const [fulfilment, setFulfilment] = useState<FulfilmentType>(fulfilmentFromSearch ?? "delivery");
  const [postcode, setPostcode] = useState("");
  const [checking, setChecking] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<{ tone: "idle" | "ok" | "error"; text: string }>({
    tone: "idle",
    text: "Browsing the Luton menu. Enter your postcode when you're ready to order.",
  });
  const [location, setLocation] = useState<LocationKey | null>("luton");
  const [activeBrand, setActiveBrand] = useState<string | null>(brandFromSearch ?? null);
  const [activeCategory, setActiveCategory] = useState<BrowseCategory>("all");
  const [menuSearch, setMenuSearch] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [savedBasket, setSavedBasket] = useState<SavedBasket | null>(null);
  // Browser preferences are only read on the client after hydration.
  useEffect(() => {
    try {
      setFavouriteIds(decodeFavourites(window.localStorage.getItem(FAVOURITES_STORAGE_KEY)));
      setSavedBasket(decodeSavedBasket(window.localStorage.getItem(BASKET_STORAGE_KEY)));
    } catch {
      // Private browsing / storage disabled: games and ordering remain usable.
    }
  }, []);
  function toggleSavedFavourite(itemId: string) {
    const next = toggleFavourite(favouriteIds, itemId);
    try {
      window.localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify(next));
      setFavouriteIds(next);
    } catch {
      toast.error("Unable to save favourites on this device.");
    }
  }
  function saveBasketForLater() {
    if (!location || lines.length === 0) return;
    try {
      const json=encodeSavedBasket(location, lines);
      window.localStorage.setItem(BASKET_STORAGE_KEY, json);
      setSavedBasket(decodeSavedBasket(json));
      toast.success("Basket saved on this device", { description: "It isn't an order. Re-add items later at the prices then available." });
    } catch {
      toast.error("This browser couldn't save the basket.");
    }
  }
  function addSavedBasket() {
    if (!location || !savedBasket) return;
    if (catalogue.isLoading || !catalogue.data) {
      toast.message("The menu is still loading. Please try again shortly.");
      return;
    }
    const restored=restoreSavedBasket(savedBasket, location, items, lines);
    if (restored.mismatch) {
      toast.message("Saved for another location", { description: "Choose the original MealDeck location first." });
      return;
    }
    if (restored.added > 0) {
      setLines(restored.cart);
      toast.success(`${restored.added} item(s) added from your saved basket`, {
        description: "We used today's menu and prices. Review the basket before checking out.",
      });
    }
    if (restored.unavailable > 0) {
      toast.message(`${restored.unavailable} saved item(s) are unavailable or have changed options.`);
    }
  }
  const pickBrand = (id: string | null) => {
    setActiveBrand(id);
    setBrandMenuOpen(false);
    requestAnimationFrame(() => {
      const el = document.getElementById("menu-top");
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 205, behavior: "smooth" });
    });
  };
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const [orderReceipt, setOrderReceipt] = useState<{
    orderId: string; handoffCode: string; kind: "pending" | "existing" | "review";
  } | null>(null);
  const [customising, setCustomising] = useState<MenuItem | null>(null);
  const [chosen, setChosen] = useState<SelectedModifier[]>([]);

  const runServiceability = useServerFn(checkServiceability);
  const fetchCatalogue = useServerFn(getCatalogue);
  const submitOrder = useServerFn(placeOrder);
  const fetchDeliveryEstimate = useServerFn(estimateDishbeeDelivery);

  const catalogue = useQuery({
    queryKey: ["catalogue", location],
    queryFn: () => fetchCatalogue({ data: { location: location! } }),
    enabled: location !== null,
  });

  const currentLocation = location ? locations.find((entry) => entry.key === location)! : null;
  const items = catalogue.data?.items ?? [];
  const channelOpen = catalogue.data?.channelOpen ?? true;

  const primaryBrands = useMemo(
    () => (currentLocation ? currentLocation.primaryBrandIds.map(brandById).filter((b): b is Brand => !!b) : []),
    [currentLocation],
  );
  const primaryItems = items.filter((item) => currentLocation?.primaryBrandIds.includes(item.brandId));
  const addonItems = items.filter((item) => currentLocation?.addonBrandIds.includes(item.brandId));
  const searchableItems = [...primaryItems, ...addonItems];
  const availableBrands = [...primaryBrands, ...(currentLocation?.addonBrandIds.map(brandById).filter((b): b is Brand => !!b) ?? [])];
  const filteredBrands = useMemo(
    () => browseBrands(searchableItems, availableBrands, activeCategory, menuSearch),
    [items, currentLocation, activeCategory, menuSearch],
  );
  const visibleItems = browseMenu(searchableItems, activeBrand, activeCategory, menuSearch, availableBrands);
  const suggestions = basketSuggestions(searchableItems, lines, availableBrands);
  const activeBrandObj = activeBrand ? brandById(activeBrand) ?? null : null;

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of visibleItems) {
      const brand = brandById(item.brandId);
      const key = activeBrand ? item.category || "Menu" : brand?.name ?? "MealDeck";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [visibleItems, activeBrand]);

  const goods = subtotal(lines);
  const quoteLines=lines.map(line=>({
    itemId:line.id,quantity:line.quantity,
    modifierIds:line.selectedModifiers.map(option=>option.id),
  }));
  // A postcode or fulfilment change revokes the displayed quote, and each
  // fresh estimate is bound to the exact selected modifiers and kitchen.
  const liveDeliveryEstimate=useQuery({
    queryKey:["mealdeckBasketQuote",location,fulfilment,
      customer.postcode.trim().toUpperCase(),quoteLines],
    queryFn:()=>fetchDeliveryEstimate({data:{
      location:location!,fulfilment:fulfilment as "delivery"|"pickup"|"curbside",
      postcode:customer.postcode.trim(),lines:quoteLines,
    }}),
    enabled:!!location&&lines.length>0&&fulfilment!=="dinein"&&
      customer.postcode.trim().length>=5&&
      serviceMessage.tone==="ok"&&catalogue.data?.source==="live",
    staleTime:0,
    refetchInterval:15_000,
    retry:false,
  });
  const quote=liveDeliveryEstimate.data;
  const quoteFresh=quote?.ready===true&&
    Date.parse(quote.expiresAt)>Date.now()+10_000&&
    !liveDeliveryEstimate.isFetching;
  const quoteReady=quoteFresh;
  const deliveryPence=quoteFresh&&quote.ready?quote.deliveryPence:null;
  const displayGoods=quoteFresh&&quote.ready?quote.goodsPence:goods;
  const total=quoteFresh&&quote.ready?quote.totalPence:null;

  async function checkArea(nextFulfilment: FulfilmentType = fulfilment) {
    if (!postcode.trim()) {
      setServiceMessage({ tone: "error", text: "Enter a postcode to find your nearest MealDeck." });
      return;
    }
    setChecking(true);
    try {
      const result = await runServiceability({
        data: { postcode: postcode.trim(), fulfilment: nextFulfilment },
      });
      if (!result.served) {
        setLocation(null);
        setActiveBrand(null);
        setCheckoutOpen(false);
        setOrderReceipt(null);
        setServiceMessage({ tone: "error", text: result.message });
        return;
      }
      if (location && location !== result.location && lines.length) {
        setLines([]);
        setCheckoutOpen(false);
        toast("Basket cleared", { description: "Your postcode changed the menus available, so we started a fresh basket." });
      }
      setLocation(result.location);
      setCustomer((prev) => ({
        ...prev,
        postcode: postcode.trim().toUpperCase(),
      }));
      setServiceMessage({
        tone: result.channelOpen ? "ok" : "idle",
        text: result.channelOpen
          ? result.message
          : `${result.message} Your local MealDeck is currently closed, but you can still browse.`,
      });
    } catch {
      setLocation(null);
      setServiceMessage({ tone: "error", text: "We couldn't check that postcode right now. Please try again." });
    } finally {
      setChecking(false);
    }
  }

  function changeFulfilment(next: FulfilmentType) {
    setFulfilment(next);
    setOrderReceipt(null);
    if (postcode.trim()) {
      void checkArea(next);
      return;
    }
    if (currentLocation && !currentLocation.allowedFulfilments.includes(next)) {
      setServiceMessage({
        tone: "error",
        text: `${currentLocation.name} offers ${currentLocation.allowedFulfilments.map((f) => fulfilmentLabels[f]).join(", ")} only.`,
      });
    }
  }

  function browseLocation(next: LocationKey) {
    if (location === next) return;
    if (lines.length) {
      setLines([]);
      toast("Basket cleared", { description: "We started a fresh basket for the new location." });
    }
    setLocation(next);
    setActiveBrand(null);
    setActiveCategory("all");
    setMenuSearch("");
    setPostcode("");
    setCustomer(emptyCustomer);
    setCheckoutOpen(false);
    setOrderReceipt(null);
    setServiceMessage({
      tone: "idle",
      text: `Browsing the ${locations.find((entry) => entry.key === next)?.town ?? "local"} menu. Enter your postcode when you're ready to order.`,
    });
  }

  function beginAdd(item: MenuItem) {
    if (modifierGroupsFor(item).length) {
      setCustomising(item);
      setChosen([]);
      return;
    }
    setLines((prev) => addItem(prev, item));
  }

  function toggleModifier(group: ModifierGroup, option: ModifierOption) {
    setChosen((current) => {
      const selected=current.some(
        (modifier)=>modifier.groupId===group.id&&modifier.id===option.id,
      );

      if(selected){
        return current.filter(
          (modifier)=>!(modifier.groupId===group.id&&modifier.id===option.id),
        );
      }

      const sameGroup=current.filter((modifier)=>modifier.groupId===group.id);
      if(group.maxSelect===1){
        return [
          ...current.filter((modifier)=>modifier.groupId!==group.id),
          {...option,groupId:group.id,groupName:group.name},
        ];
      }
      if(sameGroup.length>=group.maxSelect)return current;

      return [
        ...current,
        {...option,groupId:group.id,groupName:group.name},
      ];
    });
  }

  const customiserGroups=customising?modifierGroupsFor(customising):[];
  const customiserValid=customiserGroups.every((group)=>{
    const count=chosen.filter((modifier)=>modifier.groupId===group.id).length;
    return count>=group.minSelect&&count<=group.maxSelect;
  });

  const fulfilmentAllowed = currentLocation?.allowedFulfilments.includes(fulfilment) ?? false;

  const canCheckout =
    !!location &&
    fulfilmentAllowed &&
    channelOpen &&
    catalogue.data?.source==="live" &&
    serviceMessage.tone==="ok" &&
    quoteReady &&
    customer.postcode.trim().length >= 2 &&
    customer.name.trim() &&
    customer.phone.trim().length >= 5 &&
    (fulfilment !== "delivery" ||
      (customer.address1.trim() && customer.city.trim() && customer.postcode.trim().length >= 3)) &&
    (fulfilment !== "curbside" || (customer.carMake.trim() && customer.vehicleRegistration.trim()));

  async function handleCheckout() {
    if (!location || submittingRef.current) return;
    if(catalogue.data?.source!=="live"){
      toast.error("Live ordering connection required",{
        description:"The preview menu is for browsing only. Checkout will be available when live ordering opens.",
      });
      return;
    }
    // Never submit an unbound basket or a stale quote, even if the button
    // state has not yet updated after a postcode or price change.
    if(!quoteReady||!quote?.ready){
      toast.error("Your quote needs refreshing",{
        description:"Recheck your basket and delivery price before checkout.",
      });
      return;
    }
    // Keep a single UUIDv4 for the same checkout inputs across double-taps,
    // timed-out requests and refreshed quotes. Do not persist it in URLs.
    const fingerprint = checkoutSnapshotFingerprint({ location, fulfilment, lines, customer });
    const attempt = getOrCreateCheckoutAttempt(
      checkoutAttemptRef.current, fingerprint, () => window.crypto.randomUUID(),
    );
    if (!attempt) {
      toast.error("Secure checkout unavailable", {
        description: "Please use a secure browser session and try again.",
      });
      return;
    }
    checkoutAttemptRef.current = attempt;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await submitOrder({
        data: {
          location,
          fulfilment,
          attemptId: attempt.id,
          quoteToken: quote.quoteToken,
          lines: lines.map((line) => ({ itemId: line.id, quantity: line.quantity, modifiers: line.selectedModifiers })),
          customer,
        },
      });
      if (result.status === "payment_required") {
        setOrderReceipt({ orderId: result.orderId, handoffCode: result.handoffCode, kind: "pending" });
        setCheckoutOpen(false);
        toast.message(result.reused ? "Existing pending order located" : "Payment pending", {
          description: "The original MealDeck order is awaiting verified payment. No duplicate kitchen order was requested.",
        });
      } else if (result.status === "existing_order" || result.status === "needs_review") {
        setOrderReceipt({
          orderId: result.orderId, handoffCode: result.handoffCode,
          kind: result.status === "existing_order" ? "existing" : "review",
        });
        setCheckoutOpen(false);
        toast.message(result.status === "existing_order" ?
          "Your existing order was found" : "Your order needs a review", {
          description: "We did not create a second order or charge. Check tracking or contact support.",
        });
      } else if (result.status === "unconfigured") {
        toast.error("Secure checkout is not connected yet", {
          description: "Ordering will open after the Dishbee payment and idempotency staging checks are approved.",
        });
      } else {
        toast.error(result.message);
      }
    } catch {
      // Preserve the same attempt UUID. A retry must never silently create
      // a second pending order after an unknown network outcome.
      toast.error("We couldn't verify checkout. Try again with this basket or contact support.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const basketPanel = (
    <>
          <div className="marketplace-basket p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Your basket</h2>
              {lines.length ? (
                <button onClick={() => setLines([])} className="text-xs text-muted-foreground hover:text-primary">
                  Clear all
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {itemCount(lines)} items from {new Set(lines.map((line) => line.brandId)).size} brands
            </p>
            {lines.length > 0 ? (
              <div className="md-premium-basket-brandrow" aria-label="Brands in this basket">
                {[...new Set(lines.map(line => line.brandId))].map(brandId=>{
                  const brand=brandById(brandId);
                  return <span key={brandId} className="md-premium-basket-brand">
                    {brand?.logo ? <img src={brand.logo} alt="" loading="lazy"/> : null}
                    <span>{brand?.name || "MealDeck"}</span>
                  </span>;
                })}
              </div>
            ) : null}
            <div className="md-premium-save-actions">
              {lines.length>0 ? <button type="button" onClick={saveBasketForLater}
                className="md-premium-save-button"><BookmarkPlus size={16}/> Save basket for later</button> : null}
              {savedBasket && savedBasket.location===location ? <button type="button" onClick={addSavedBasket}
                className="md-premium-save-button"><RefreshCcw size={16}/> Add saved basket ({savedBasket.lines.length})</button> : null}
            </div>

            <div className="mt-4 space-y-3">
              {lines.map((line) => (
                <div key={line.lineId} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-accent">{brandById(line.brandId)?.name}</p>
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    {line.selectedModifiers.length ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {line.selectedModifiers.map((m) => m.name).join(", ")}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">{formatPence(lineUnitPrice(line) * line.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="glass"
                      size="icon"
                      className="size-8 rounded-full"
                      aria-label="Remove one"
                      onClick={() => setLines((prev) => setQuantity(prev, line.lineId, line.quantity - 1))}
                    >
                      {line.quantity === 1 ? <Trash2 /> : <Minus />}
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                    <Button
                      variant="glass"
                      size="icon"
                      className="size-8 rounded-full"
                      aria-label="Add one"
                      onClick={() => setLines((prev) => setQuantity(prev, line.lineId, line.quantity + 1))}
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
              ))}
              {lines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                   Add dishes from any restaurant.
                </p>
              ) : null}
            </div>

            {location && lines.length ? (
              <WhatsAppBasketHandoff location={location} fulfilment={fulfilment} lines={lines} />
            ) : null}
            {suggestions.length && lines.length ? (
              <section className="mt-5 border-t border-border pt-4" aria-label="Basket add-on ideas">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold">Complete your meal</h3>
                  <span className="text-[10px] text-muted-foreground">Optional · Same basket</span>
                </div>
                <div className="mt-3 space-y-2">
                  {suggestions.slice(0,2).map(({item,reason})=>(
                    <div key={item.id} className="flex items-center gap-2 rounded-xl border border-border bg-background p-2">
                      <img src={marketplaceItemPhoto(item, brandById(item.brandId)).src} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy"/>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-accent">{reason}</p>
                        <p className="truncate text-xs font-bold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{formatPence(item.pricePence)}</p>
                      </div>
                      <Button size="icon" variant="glass" className="size-9 rounded-full" disabled={!channelOpen}
                        aria-label={`Add ${item.name}`} onClick={()=>beginAdd(item)}><Plus/></Button>
                    </div>
                  ))}
                </div>
              </section>
            ):null}
            {lines.length ? (
              <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Indicative items</span>
                  <span>{formatPence(displayGoods)}</span>
                </div>
                {fulfilment === "delivery" ? (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivery (one estimated fee)</span>
                    <span>{deliveryPence===null
                      ?(liveDeliveryEstimate.isFetching?"Checking…":"Recheck price")
                      :formatPence(deliveryPence)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-display text-lg font-bold">
                  <span>Estimated total</span>
                  <span>{total===null?"—":formatPence(total)}</span>
                </div>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {!quoteReady
                    ?"Check your postcode and refresh the current Dishbee prices before checkout."
                    :"Quote valid for up to two minutes. Dishbee reprices the final order before payment."}
                </p>
                <Button type="button" variant="ghost" size="sm"
                  className="h-8 gap-1.5 rounded-full px-3 text-xs"
                  disabled={!location||!lines.length||liveDeliveryEstimate.isFetching}
                  onClick={()=>void liveDeliveryEstimate.refetch()}>
                  <RefreshCcw className="size-3.5"/> Refresh prices
                </Button>
                <Button
                  variant="hero"
                  size="lg"
                  className="mt-3 w-full rounded-full"
                  disabled={!quoteReady||catalogue.data?.source!=="live"}
                  onClick={() => setCheckoutOpen((open) => !open)}
                >
                  Go to checkout
                </Button>
              </div>
            ) : null}
          </div>

          {checkoutOpen && lines.length ? (
            <div className="card-elevated mt-5 space-y-3 p-5">
              <h3 className="font-display text-lg font-bold">{fulfilmentLabels[fulfilment]} details</h3>
              {!fulfilmentAllowed && currentLocation ? (
                <p className="text-sm text-destructive">
                  {currentLocation.name} offers{" "}
                  {currentLocation.allowedFulfilments.map((f) => fulfilmentLabels[f]).join(", ")} only.
                </p>
              ) : null}
              {(
                [
                  ["name", "Name for handoff", true],
                  ["phone", "Phone", true],
                  ["email", "Email (optional)", true],
                  ["carMake", "Car make", fulfilment === "curbside"],
                  ["vehicleRegistration", "Registration", fulfilment === "curbside"],
                  ["address1", "Address", fulfilment === "delivery"],
                  ["city", "Town / city", fulfilment === "delivery"],
                  ["postcode", "Postcode", fulfilment === "delivery"],
                ] as const
              )
                .filter(([, , show]) => show)
                .map(([field, label]) => (
                  <div key={field} className="space-y-1">
                    <Label htmlFor={field}>{label}</Label>
                    <Input
                      id={field}
                      value={customer[field]}
                      onChange={(event) => setCustomer((prev) => ({ ...prev, [field]: event.target.value }))}
                    />
                  </div>
                ))}
              <div className="space-y-1">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={customer.notes}
                  onChange={(event) => setCustomer((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                You'll get a 4-digit handoff code. Preparation starts once payment is confirmed.
              </p>
              <Button
                variant="gold"
                size="lg"
                className="w-full rounded-full"
                disabled={!canCheckout || submitting}
                onClick={handleCheckout}
              >
                {submitting ? <Loader2 className="animate-spin" /> : null}
                Continue to payment · {total===null?"Quote unavailable":formatPence(total)}
              </Button>
            </div>
          ) : null}
    </>
  );

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-0">
      <SiteHeader
        context={
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm">
            <MapPin className="size-4 text-accent" />
            <span className="font-medium">{currentLocation ? currentLocation.town : "Find your local MealDeck"}</span>
            <span className="text-muted-foreground">· {fulfilmentLabels[fulfilment]}</span>
          </div>
        }
      />

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <section className="order-control-bar">
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="eyebrow hidden sm:block">Order direct</p>
                <h1 className="text-2xl font-extrabold sm:text-3xl">What are you craving?</h1>
              </div>
              <div className="grid grid-cols-2 rounded-lg border border-border bg-background p-1" aria-label="Browse location">
                {locations.map((entry) => (
                  <Button
                    key={entry.key}
                    variant={location === entry.key ? "secondary" : "ghost"}
                    size="sm"
                    className={location === entry.key ? "text-accent" : "text-muted-foreground"}
                    onClick={() => browseLocation(entry.key)}
                  >
                    {entry.town}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="How you'd like your order">
              {(Object.keys(fulfilmentLabels) as FulfilmentType[]).map((key) => {
                const Icon = fulfilmentIcons[key];
                const active = fulfilment === key;
                return (
                  <Button
                    key={key}
                    type="button"
                    variant={active ? "gold" : "glass"}
                    size="sm"
                    role="tab"
                    aria-selected={active}
                    onClick={() => changeFulfilment(key)}
                    className="h-10 shrink-0 rounded-full px-4"
                  >
                    <Icon />
                    {fulfilmentLabels[key]}
                  </Button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="relative flex-1">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={postcode}
                  onChange={(event) => setPostcode(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void checkArea()}
                  placeholder="Enter your postcode"
                  aria-label="Postcode"
                  className="h-11 rounded-full pl-9"
                />
              </div>
              <Button variant="hero" className="h-11 rounded-full px-4 sm:px-6" onClick={() => void checkArea()} disabled={checking}>
                {checking ? <Loader2 className="animate-spin" /> : <Search />}
                <span className="hidden sm:inline">Check area</span>
              </Button>
            </div>
            <p
              className={`mt-3 text-sm ${
                serviceMessage.tone === "error"
                  ? "text-destructive"
                  : serviceMessage.tone === "ok"
                    ? "text-gold"
                    : "text-muted-foreground"
              }`}
            >
              {serviceMessage.text}
            </p>
            {currentLocation ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {currentLocation.name} · {currentLocation.hoursLabel}
              </p>
            ) : null}
          </section>

          {orderReceipt ? (
            <div className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-5">
              <p className="eyebrow">
                {orderReceipt.kind === "pending" ? "Payment required" :
                  orderReceipt.kind === "existing" ? "Existing order" : "Order needs review"}
              </p>
              <p className="mt-2 font-display text-lg font-bold">
                {orderReceipt.kind === "pending" ?
                  "Your order is awaiting verified payment. Preparation has not started." :
                  orderReceipt.kind === "existing" ?
                  "Dishbee has located your original order. No second order was created." :
                  "The previous order needs support review. Do not submit a new payment attempt."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                This screen is not confirmation of payment or a courier booking. Your handoff code is{" "}
                <strong className="text-xl text-gold">
                  {orderReceipt.handoffCode || "----"}
                </strong>.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Order reference {orderReceipt.orderId.slice(0, 8).toUpperCase()}.
              </p>
            </div>
          ) : null}

          {!currentLocation ? null : (
            <>
              {catalogue.data?.notice ? (
                <p className="mt-6 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
                  {catalogue.data.notice}
                </p>
              ) : null}
              {!channelOpen ? (
                <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                  {currentLocation.name} is closed for orders right now.
                </p>
              ) : null}

              <section className="md-discovery-top mt-6" aria-label="Discover food">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="eyebrow">Made for every craving</p><h2 className="font-display text-xl font-black sm:text-2xl">Find your next favourite</h2></div>
                  <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary sm:inline">One basket · Multiple brands</span>
                </div>
                <div className="relative mt-4">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={menuSearch} onChange={(event)=>{setMenuSearch(event.target.value);setActiveBrand(null);}}
                    className="h-12 rounded-2xl bg-card pl-12 pr-4 shadow-sm"
                    placeholder="Search dishes, brands or cuisines" aria-label="Search MealDeck dishes and brands"/>
                </div>
                <div className="md-category-scroller mt-4" role="group" aria-label="Food categories">
                  {BROWSE_CATEGORIES.map(category=>(
                    <button key={category.id} type="button" onClick={()=>{setActiveCategory(category.id);setActiveBrand(null);}}
                      aria-pressed={activeCategory===category.id}
                      className={`md-category-pill ${activeCategory===category.id?"is-selected":""}`}>
                      {category.id==="french-tacos"
                        ? <img src={suitArtwork["french-taco"]} alt="" aria-hidden="true" className="md-category-icon"/>
                        : <span className="text-xl" aria-hidden="true">{category.emoji}</span>}
                      <span>{category.label}</span>
                    </button>
                  ))}
                </div>
                {lines.length>0 ? <div className="md-mix-notice mt-3">
                  <ShoppingBasket className="size-5 shrink-0"/>
                  <span>{itemCount(lines)} items from {new Set(lines.map(line=>line.brandId)).size} brands. Add food from another brand without starting over.</span>
                  <button type="button" className="font-bold underline underline-offset-4" onClick={()=>setBasketOpen(true)}>Basket</button>
                </div>:null}
              </section>

              <div className="mt-7">
                <p className="eyebrow">Restaurants in {currentLocation.town}</p>
                <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">{activeCategory==="all"?"Explore every craving":BROWSE_CATEGORIES.find(c=>c.id===activeCategory)?.label}</h2>
                <p className="mt-1 hidden text-sm text-muted-foreground sm:block">Choose a restaurant or discover dishes across them all.</p>
              </div>

              {catalogue.isLoading ? (
                <div className="md-premium-loading-gallery" role="status" aria-label="Loading restaurants">
                  <div className="md-premium-loading-heading"/>
                  <div className="md-premium-loading-tiles">{[1,2,3].map(n=><span key={n}/>)}</div>
                </div>
              ) : (<>
                <FavouriteDishRail
                  items={searchableItems} brands={availableBrands} favouriteIds={favouriteIds}
                  isOrderingOpen={channelOpen} onAdd={beginAdd} onRemoveFavourite={toggleSavedFavourite}/>
                <BrandDiscoveryGallery
                  brands={filteredBrands}
                  items={browseMenu(searchableItems, null, activeCategory, menuSearch, availableBrands)}
                  selectedBrandId={activeBrand} onSelectBrand={pickBrand}
                  isOrderingOpen={channelOpen && catalogue.data?.source === "live"}/>
                {savedBasket?.location===location ? (
                  <div className="md-premium-reorder-shortcut">
                    <div><strong>Your saved basket</strong><p>{savedBasket.lines.length} saved selection(s) · checked against the current menu when added</p></div>
                    <button type="button" onClick={addSavedBasket}><RefreshCcw size={16}/> Add again</button>
                  </div>
                ) : null}
              </>)}

              <button
                type="button"
                onClick={() => setBrandMenuOpen(true)}
                aria-label="Choose a restaurant"
                className="order-brand-selector mt-4 lg:hidden"
              >
                <span className="order-brand-logo">
                  {activeBrandObj ? (
                    <BrandMark brand={activeBrandObj} className="h-full w-full p-1.5 text-xs" />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-primary text-primary-foreground"><UtensilsCrossed className="size-5" /></span>
                  )}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">Ordering from</span>
                  <span className="block truncate font-display text-base font-extrabold">{activeBrandObj?.name ?? "All restaurants"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                  <PanelLeftOpen className="size-4" /> Menu
                </span>
              </button>

              <div className="mt-4 hidden lg:block">
                <div className="order-brand-rail">
                  <Button
                    variant="ghost"
                    onClick={() => setActiveBrand(null)}
                    className={`order-brand-pill ${activeBrand === null ? "is-active" : ""}`}
                  >
                    <span className="order-brand-logo grid place-items-center bg-primary text-primary-foreground"><UtensilsCrossed className="size-5" /></span>
                    <span className="truncate">All</span>
                  </Button>
                  {filteredBrands.map((brand) => (
                      <Button
                        key={brand.id}
                        variant="ghost"
                        onClick={() => pickBrand(brand.id)}
                        aria-label={brand.name}
                        className={`order-brand-pill ${activeBrand === brand.id ? "is-active" : ""}`}
                      >
                        <span className="order-brand-logo"><BrandMark brand={brand} className="h-full w-full p-1.5 text-xs" /></span>
                        <span className="w-full truncate">{brand.name}</span>
                      </Button>
                  ))}
                </div>
              </div>

              {catalogue.isLoading ? (
                <div className="mt-16 flex justify-center">
                  <Loader2 className="size-8 animate-spin text-accent" />
                </div>
              ) : (
                <div id="menu-top" className="mt-7 space-y-9">
                  {grouped.map(([group, groupItems]) => (
                    <section key={group} className="scroll-mt-32">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-xl font-bold">{group}</h3>
                          {!activeBrand ? <p className="text-xs text-muted-foreground">{brandById(groupItems[0]?.brandId ?? "")?.category}</p> : null}
                        </div>
                        <span className="text-xs font-semibold text-accent">{groupItems.length} {groupItems.length === 1 ? "dish" : "dishes"}</span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {groupItems.map((item) => {
                          const brand = brandById(item.brandId);
                          const directLine = lines.find((line) => line.id === item.id && line.selectedModifiers.length === 0);
                          const itemPhoto = marketplaceItemPhoto(item, brand);
                          return (
                            <article key={item.id} className="marketplace-dish-card relative">
                              <button type="button"
                                className={`md-premium-fav-heart ${favouriteIds.includes(item.id) ? "is-saved" : ""}`}
                                aria-pressed={favouriteIds.includes(item.id)}
                                aria-label={favouriteIds.includes(item.id) ? `Remove ${item.name} from favourites` : `Save ${item.name} to favourites`}
                                title={favouriteIds.includes(item.id) ? "Remove from favourites" : "Save to favourites"}
                                onClick={()=>toggleSavedFavourite(item.id)}>
                                <Heart size={18} fill={favouriteIds.includes(item.id) ? "currentColor" : "none"}/>
                              </button>
                              {itemPhoto.illustrative ? <span className="md-premium-illustrative-caption">Illustrative</span> : null}
                              <img
                                src={itemPhoto.src}
                                alt={itemPhoto.illustrative ? "Illustrative food photography" : item.name}
                                width={816}
                                height={816}
                                loading="lazy"
                                className="marketplace-dish-image"
                              />
                              <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
                                <p className="text-[11px] font-bold uppercase text-accent">{brand?.name ?? "MealDeck"}</p>
                                <p className="mt-0.5 font-display font-bold leading-tight">{item.name}</p>
                                {item.description ? (
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                                ) : null}
                                <div className="mt-auto flex items-center justify-between pt-3">
                                  <span className="font-display font-bold">{formatPence(item.pricePence)}</span>
                                  {directLine ? (
                                    <div className="flex items-center rounded-full bg-primary text-primary-foreground">
                                      <Button variant="ghost" size="icon" className="size-8 rounded-full hover:bg-primary-foreground/15 hover:text-primary-foreground" aria-label={`Remove one ${item.name}`} onClick={() => setLines((prev) => setQuantity(prev, directLine.lineId, directLine.quantity - 1))}><Minus /></Button>
                                      <span className="w-6 text-center text-sm font-bold">{directLine.quantity}</span>
                                      <Button variant="ghost" size="icon" className="size-8 rounded-full hover:bg-primary-foreground/15 hover:text-primary-foreground" aria-label={`Add one ${item.name}`} onClick={() => setLines((prev) => setQuantity(prev, directLine.lineId, directLine.quantity + 1))}><Plus /></Button>
                                    </div>
                                  ) : (
                                    <Button variant="hero" size="icon" className="size-9 rounded-full" disabled={!channelOpen} aria-label={`${item.hasModifiers ? "Choose options for" : "Add"} ${item.name}`} onClick={() => beginAdd(item)}><Plus /></Button>
                                  )}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  {suggestions.length ? (
                    <section className="md-upsell-panel" aria-label="You may also like">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="eyebrow">Build your perfect meal</p><h3 className="font-display text-xl font-extrabold">Good with your basket</h3>
                          <p className="mt-1 text-sm text-muted-foreground">Relevant extras from food available at this MealDeck location. No automatic add-ons.</p></div>
                        <ShoppingBasket className="size-6 text-accent"/>
                      </div>
                      <div className="md-upsell-list mt-4">
                        {suggestions.map(({item,reason})=>(
                          <article key={item.id} className="md-upsell-card">
                            <img src={marketplaceItemPhoto(item, brandById(item.brandId)).src} alt="" loading="lazy"/>
                            <div className="min-w-0 flex-1"><span className="text-xs font-bold text-primary">{reason} · {brandById(item.brandId)?.name}</span>
                              <p className="truncate font-semibold">{item.name}</p>
                              <span className="text-sm">{formatPence(item.pricePence)}</span></div>
                            <Button type="button" variant="hero" size="icon" aria-label={`Add ${item.name}`} disabled={!channelOpen} onClick={()=>beginAdd(item)}><Plus/></Button>
                          </article>
                        ))}
                      </div>
                    </section>
                  ):null}
                  {activeBrand ? (() => {
                    const idx = filteredBrands.findIndex((b) => b.id === activeBrand);
                    const next = filteredBrands[(idx + 1) % filteredBrands.length];
                    if (!next || next.id === activeBrand) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => pickBrand(next.id)}
                        className="next-brand-card"
                      >
                        <span className="order-brand-logo size-14"><BrandMark brand={next} className="h-full w-full p-1.5 text-xs" /></span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block text-[11px] font-bold uppercase tracking-wider opacity-70">Next restaurant</span>
                          <span className="block truncate font-display text-lg font-bold">{next.name}</span>
                          <span className="block truncate text-xs opacity-70">{next.category}</span>
                        </span>
                        <ChevronRight className="size-6 shrink-0" />
                      </button>
                    );
                  })() : null}
                  {grouped.length === 0 ? (
                    <p className="text-muted-foreground">No matching dishes for this category or search. Choose another category or clear your search.</p>
                  ) : null}

                  {addonItems.length ? (
                    <section className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
                      <p className="eyebrow">Add something extra</p>
                      <h3 className="mt-1 font-display text-xl font-bold">Icova + Moktl drinks</h3>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {addonItems.map((item) => {
                          const brand = brandById(item.brandId);
                          return (
                            <button
                              key={item.id}
                              disabled={!channelOpen}
                              onClick={() => beginAdd(item)}
                              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-accent disabled:opacity-50"
                            >
                              {brand ? <BrandMark brand={brand} className="h-12 w-16 shrink-0 rounded-lg bg-ink p-1" /> : null}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold">{item.name}</span>
                                <span className="text-sm text-muted-foreground">{formatPence(item.pricePence)} · customise</span>
                              </span>
                              <Plus className="size-5 text-accent" />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* Basket */}
        <aside id="basket" className="hidden scroll-mt-24 lg:sticky lg:top-28 lg:block lg:self-start">
          {basketPanel}
        </aside>
      </main>

      <Dialog open={customising !== null} onOpenChange={(open) => !open && setCustomising(null)}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto">
          {customising ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{customising.name}</DialogTitle>
                <DialogDescription>{customising.description ?? "Customise your item."}</DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                {customiserGroups.map((group)=>{
                  const selectedCount=chosen.filter(
                    (modifier)=>modifier.groupId===group.id,
                  ).length;
                  return (
                    <section key={group.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display font-bold">{group.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.minSelect>0
                              ? group.maxSelect===1
                                ? "Choose one"
                                : `Choose at least ${group.minSelect} · up to ${group.maxSelect}`
                              : group.maxSelect===1
                                ? "Optional · choose one"
                                : `Optional · choose up to ${group.maxSelect}`}
                          </p>
                        </div>
                        {group.minSelect>0&&selectedCount>=group.minSelect?(
                          <Check className="size-5 text-accent"/>
                        ):null}
                      </div>
                      <div className="mt-3 space-y-2">
                        {group.options.map((option)=>{
                          const selected=chosen.some(
                            (modifier)=>modifier.groupId===group.id&&modifier.id===option.id,
                          );
                          return (
                            <button
                              key={option.id}
                              onClick={()=>toggleModifier(group,option)}
                              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                                selected
                                  ?"border-accent bg-accent/10"
                                  :"border-border hover:border-accent/60"
                              }`}
                            >
                              <span>
                                <span className="font-semibold">{option.name}</span>
                                {option.priceDeltaPence!==0?(
                                  <span className="ml-2 text-sm text-muted-foreground">
                                    {option.priceDeltaPence>0?"+":""}{formatPence(option.priceDeltaPence)}
                                  </span>
                                ):null}
                              </span>
                              {selected
                                ?<Check className="size-4 text-accent"/>
                                :<Plus className="size-4 text-muted-foreground"/>
                              }
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
              <Button
                variant="hero"
                size="lg"
                className="sticky bottom-0 w-full rounded-full shadow-2xl"
                disabled={!customiserValid}
                onClick={() => {
                  if(!customiserValid)return;
                  setLines((prev) => addItem(prev, customising, chosen));
                  setCustomising(null);
                  setChosen([]);
                  toast.success(`${customising.name} added to your hand`);
                }}
              >
                Add to basket · {formatPence(lineUnitPrice({ pricePence: customising.pricePence, selectedModifiers: chosen }))}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {lines.length ? (
        <div className="fixed inset-x-3 bottom-24 z-40 rounded-2xl border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur lg:hidden">
          <Button
            variant="hero"
            size="lg"
            className="grid h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] rounded-xl px-4"
            onClick={() => setBasketOpen(true)}
          >
            <span className="grid size-7 place-items-center rounded-full bg-primary-foreground/15 text-xs font-bold">{itemCount(lines)}</span>
            <span className="flex min-w-0 flex-col items-start">
               <span className="truncate">View basket</span>
               <span className="text-[10px] font-normal opacity-80">{new Set(lines.map(line=>line.brandId)).size} brand(s) · one checkout</span>
             </span>
            <span>{total===null?"Quote required":formatPence(total)}</span>
          </Button>
        </div>
      ) : null}

      <Sheet open={basketOpen} onOpenChange={setBasketOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto z-[80] rounded-t-3xl border-border bg-background p-3 pb-8 lg:hidden">
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted" aria-hidden />
          <SheetTitle className="sr-only">Your basket</SheetTitle>
          {basketPanel}
        </SheetContent>
      </Sheet>

      <Sheet open={brandMenuOpen} onOpenChange={setBrandMenuOpen}>
        <SheetContent side="left" className="z-[80] flex w-[86vw] max-w-sm flex-col gap-0 border-border bg-background p-0 lg:hidden">
          <div className="border-b border-border px-5 pb-4 pt-6">
            <p className="eyebrow">Pick your next card</p>
            <SheetTitle className="font-display text-2xl font-extrabold">Restaurants</SheetTitle>
            <SheetDescription className="text-xs">
              {currentLocation?.town ?? ""} · mix dishes from any restaurant into one basket
            </SheetDescription>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {[{ id: null as string | null }, ...filteredBrands.map((b) => ({ id: b.id as string | null }))].map(({ id }) => {
              const brand = id ? brandById(id) : null;
              const dishCount = browseMenu(searchableItems, id, activeCategory, menuSearch, availableBrands).length;
              const inBasket = lines.filter((l) => (id ? l.brandId === id : true)).reduce((n, l) => n + l.quantity, 0);
              const active = activeBrand === id;
              return (
                <button
                  key={id ?? "all"}
                  type="button"
                  onClick={() => pickBrand(id)}
                  className={`brand-drawer-row ${active ? "is-active" : ""}`}
                >
                  <span className="order-brand-logo size-14">
                    {brand ? (
                      <BrandMark brand={brand} className="h-full w-full p-1.5 text-xs" />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-primary text-primary-foreground"><UtensilsCrossed className="size-5" /></span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-display font-bold">{brand?.name ?? "All restaurants"}</span>
                    <span className="block truncate text-xs opacity-70">{brand?.category ?? "Browse everything"} · {dishCount} {dishCount === 1 ? "dish" : "dishes"}</span>
                  </span>
                  {inBasket && id ? (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{inBasket}</span>
                  ) : (
                    <ChevronRight className="size-4 shrink-0 opacity-50" />
                  )}
                </button>
              );
            })}
          </div>
          {lines.length ? (
            <div className="border-t border-border p-3">
              <Button variant="hero" size="lg" className="w-full rounded-xl" onClick={() => { setBrandMenuOpen(false); setBasketOpen(true); }}>
                View your hand · {itemCount(lines)} · {total===null?"Quote required":formatPence(total)}
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <SiteFooter />
    </div>
  );
}
