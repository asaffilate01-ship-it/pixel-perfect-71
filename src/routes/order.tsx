import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  ArrowLeft,
  ArrowRight,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SiteFooter } from "@/components/site-footer";
import { checkServiceability, getCatalogue, placeOrder } from "@/lib/dishbee.functions";
import {
  DELIVERY_FEE_PENCE,
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
import { ORDER_CATEGORIES, categoryCounts, searchCatalogue, suggestedAdditions, type OrderCategory } from "@/lib/order-discovery";
import { suitArtwork } from "@/lib/food-suit-artwork";
import { seo } from "@/lib/seo";

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
      title: "Order Food Online — Luton & St Albans | MealDeck",
      description: "Enter your postcode and build one basket across every MealDeck brand. Delivery, pickup or kerbside in Luton; delivery, kerbside, pickup or dine in at Café 1, St Albans Crown Court.",
      path: "/order",
    }),
  component: OrderPage,
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
  const [activeCategory, setActiveCategory] = useState<OrderCategory>("all");
  const [searchText, setSearchText] = useState("");
  const [showAllDishes, setShowAllDishes] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const pickBrand = (id: string | null) => {
    setActiveBrand(id);
    setShowAllDishes(id === null);
    setBrandMenuOpen(false);
    requestAnimationFrame(() => {
      const el = document.getElementById("menu-top");
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 170, behavior: "smooth" });
    });
  };
  const selectCategory = (id: OrderCategory) => {
    setActiveCategory(id);
    setActiveBrand(null);
    setShowAllDishes(false);
  };
  const changeSearch = (value: string) => {
    setSearchText(value);
    if (value.trim()) {
      setActiveCategory("all");
      setActiveBrand(null);
      setShowAllDishes(true);
    }
  };
  const [submitting, setSubmitting] = useState(false);
  const [paymentPending, setPaymentPending] = useState<{ orderId: string; handoffCode: string } | null>(null);
  const [customising, setCustomising] = useState<MenuItem | null>(null);
  const [chosen, setChosen] = useState<SelectedModifier[]>([]);

  const runServiceability = useServerFn(checkServiceability);
  const fetchCatalogue = useServerFn(getCatalogue);
  const submitOrder = useServerFn(placeOrder);

  const catalogue = useQuery({
    queryKey: ["catalogue", location],
    queryFn: () => fetchCatalogue({ data: { location: location! } }),
    enabled: location !== null,
  });

  const currentLocation = location ? locations.find((entry) => entry.key === location)! : null;
  const items = catalogue.data?.items ?? [];
  const channelOpen = catalogue.data?.channelOpen ?? true;

  // The same single basket accepts menus from every participating brand in
  // this location, including the drinks brands Icova and Moktl.
  const primaryBrands = useMemo(() => (currentLocation
    ? [...new Set([...currentLocation.primaryBrandIds, ...currentLocation.addonBrandIds])]
      .map(brandById).filter((b): b is Brand => !!b)
    : []), [currentLocation]);
  const primaryItems = useMemo(() => items.filter(item =>
    primaryBrands.some(brand => brand.id === item.brandId)), [items, primaryBrands]);
  const categoryTotals = useMemo(() => categoryCounts(primaryItems), [primaryItems]);
  const filteredItems = useMemo(() => searchCatalogue(primaryItems, {
    category: activeCategory, search: searchText,
    brandName: id => brandById(id)?.name ?? id,
  }), [primaryItems, activeCategory, searchText]);
  const availableBrands = useMemo(() => primaryBrands.filter(brand =>
    filteredItems.some(item => item.brandId === brand.id)), [primaryBrands, filteredItems]);
  const visibleItems = useMemo(() => activeBrand
    ? filteredItems.filter(item => item.brandId === activeBrand)
    : showAllDishes || !!searchText.trim() ? filteredItems : [],
  [filteredItems, activeBrand, showAllDishes, searchText]);
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
  const suggestions = useMemo(() => suggestedAdditions(primaryItems, lines), [primaryItems, lines]);
  const basketGroups = useMemo(() => {
    const groups = new Map<string, CartLine[]>();
    for (const line of lines) groups.set(line.brandId, [...(groups.get(line.brandId) ?? []), line]);
    return [...groups.entries()];
  }, [lines]);

  const goods = subtotal(lines);
  const deliveryPence = lines.length && fulfilment === "delivery" ? DELIVERY_FEE_PENCE : 0;
  const total = goods + deliveryPence;

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
        setActiveCategory("all");
        setShowAllDishes(false);
        setCheckoutOpen(false);
        setPaymentPending(null);
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
    setPaymentPending(null);
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
    setSearchText("");
    setShowAllDishes(false);
    setPostcode("");
    setCustomer(emptyCustomer);
    setCheckoutOpen(false);
    setPaymentPending(null);
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
    customer.postcode.trim().length >= 2 &&
    customer.name.trim() &&
    customer.phone.trim().length >= 5 &&
    (fulfilment !== "delivery" ||
      (customer.address1.trim() && customer.city.trim() && customer.postcode.trim().length >= 3)) &&
    (fulfilment !== "curbside" || (customer.carMake.trim() && customer.vehicleRegistration.trim()));

  async function handleCheckout() {
    if (!location) return;
    if(catalogue.data?.source!=="live"){
      toast.error("Live ordering connection required",{
        description:"The preview menu is for browsing only. Checkout will be available when live ordering opens.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitOrder({
        data: {
          location,
          fulfilment,
          lines: lines.map((line) => ({ itemId: line.id, quantity: line.quantity, modifiers: line.selectedModifiers })),
          deliveryPence,
          customer,
        },
      });
      if (result.status === "payment_required") {
        setPaymentPending({ orderId: result.orderId, handoffCode: result.handoffCode });
        setCheckoutOpen(false);
        toast.success("Order created", {
          description: "Complete payment to send your order for preparation.",
        });
      } else if (result.status === "unconfigured") {
        toast.error("Ordering service not connected yet", {
          description: "This is a preview — live orders start once the ordering service is connected.",
        });
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("We couldn't place that order. Please check your details and try again.");
    } finally {
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

            {lines.length ? (
              <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatPence(goods)}</span>
                </div>
                {fulfilment === "delivery" ? (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivery (one fee)</span>
                    <span>{formatPence(deliveryPence)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-display text-lg font-bold">
                  <span>Total</span>
                  <span>{formatPence(total)}</span>
                </div>
                <Button
                  variant="hero"
                  size="lg"
                  className="mt-3 w-full rounded-full"
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
                Continue to payment · {formatPence(total)}
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

          {paymentPending ? (
            <div className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-5">
              <p className="eyebrow">Payment required</p>
              <p className="mt-2 font-display text-lg font-bold">
                Your order is reserved, but preparation has not started yet.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete payment to release it for preparation. Your handoff code is{" "}
                <strong className="text-xl text-gold">
                  {paymentPending.handoffCode || "----"}
                </strong>.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Order reference {paymentPending.orderId.slice(0, 8).toUpperCase()}.
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

              <section id="discovery-top" className="md-order-discovery mt-7" aria-label="Explore MealDeck food">
                <div className="md-order-intro">
                  <div>
                    <p className="eyebrow">From every MealDeck kitchen</p>
                    <h2>What are you craving today?</h2>
                    <p>Choose a food category, explore its brands, and add dishes to one basket.</p>
                  </div>
                  <div className="md-order-step-guide" aria-label="Ordering steps">
                    <span>1 · Food</span><ChevronRight className="size-4"/><span>2 · Brand</span><ChevronRight className="size-4"/><span>3 · Basket</span>
                  </div>
                </div>
                <div className="md-order-search-wrap">
                  <Search className="size-5" aria-hidden="true"/>
                  <Input
                    value={searchText}
                    onChange={(event) => changeSearch(event.target.value)}
                    placeholder="Search burgers, French tacos, brands or dishes"
                    aria-label="Search MealDeck dishes and brands"
                    className="md-order-search-field"
                  />
                  {searchText && <button type="button" aria-label="Clear search" className="md-order-search-clear" onClick={() => changeSearch("")}><X className="size-4"/></button>}
                </div>
                <div className="md-order-categories-head">
                  <h3>Browse food categories</h3>
                  <span>Choose what you're in the mood for</span>
                </div>
                <div className="md-order-categories" role="group" aria-label="Food categories">
                  {ORDER_CATEGORIES.filter(category => category.id === "all" || categoryTotals[category.id] > 0).map(category => (
                    <button key={category.id} type="button"
                      className={`md-order-category ${activeCategory === category.id ? "is-active" : ""}`}
                      aria-pressed={activeCategory === category.id}
                      onClick={() => selectCategory(category.id)}>
                      <span className="md-order-category-icon">
                        {category.id === "french-tacos" ? <img src={suitArtwork["french-taco"]} alt=""/> : category.symbol}
                      </span>
                      <span className="md-order-category-label">{category.label}</span>
                      <span className="md-order-category-count">{categoryTotals[category.id]}</span>
                    </button>
                  ))}
                </div>
                <div className="md-order-brand-heading" id="brand-grid">
                  <div>
                    <p className="eyebrow">{activeCategory === "all" ? "A kitchen for every craving" : "Kitchens serving this category"}</p>
                    <h3>{searchText ? "Search your favourite food" : activeBrandObj ? activeBrandObj.name : "Choose your next brand"}</h3>
                    <p>{activeBrandObj
                      ? "Add your favourites and keep exploring other brands without losing your basket."
                      : `${availableBrands.length} participating ${availableBrands.length === 1 ? "brand" : "brands"} · one combined order`}</p>
                  </div>
                  <div className="md-order-brand-actions">
                    <button type="button" className="md-order-subtle-action" onClick={() => setBrandMenuOpen(true)}>
                      <PanelLeftOpen className="size-4"/> All brands
                    </button>
                    {activeBrandObj || showAllDishes
                      ? <button type="button" className="md-order-subtle-action" onClick={() => { setActiveBrand(null); setShowAllDishes(false); }}>
                          <ArrowLeft className="size-4"/> Back to brands
                        </button>
                      : <button type="button" className="md-order-subtle-action" onClick={() => pickBrand(null)}>
                          Browse all dishes <ArrowRight className="size-4"/>
                        </button>}
                  </div>
                </div>
                {!activeBrand && !showAllDishes && !searchText.trim() ? (
                  <div className="md-order-brand-grid">
                    {availableBrands.map(brand => {
                      const count = filteredItems.filter(item => item.brandId === brand.id).length;
                      const inBasket = lines.filter(line => line.brandId === brand.id).reduce((n, line) => n + line.quantity, 0);
                      return <button type="button" key={brand.id} className="md-order-brand-tile" onClick={() => pickBrand(brand.id)}>
                        <span className="md-order-brand-cover"><img src={brand.image} alt="" loading="lazy" /></span>
                        <span className="md-order-brand-content">
                          <span className="md-order-brand-mark"><BrandMark brand={brand} className="h-full w-full p-1" /></span>
                          <strong>{brand.name}</strong>
                          <small>{brand.category}</small>
                          <span className="md-order-brand-bottom">
                            <span>{count} {count === 1 ? "dish" : "dishes"}</span>
                            {inBasket > 0 ? <span>{inBasket} in basket</span> : <ArrowRight className="size-4" />}
                          </span>
                        </span>
                      </button>;
                    })}
                  </div>
                ) : activeBrandObj ? (
                  <div className="md-order-selected-brand">
                    <span className="md-order-selected-brand-logo"><BrandMark brand={activeBrandObj} className="h-full w-full p-2" /></span>
                    <div>
                      <p className="eyebrow">Now viewing</p><strong>{activeBrandObj.name}</strong>
                      <span>{activeBrandObj.tagline}</span>
                    </div>
                    {activeCategory !== "all" ? (
                      <button type="button" onClick={() => setActiveCategory("all")}>Full menu <ArrowRight className="size-4"/></button>
                    ) : null}
                  </div>
                ) : null}
                {!activeBrand && !showAllDishes && !searchText && availableBrands.length === 0 && !catalogue.isLoading ? (
                  <p className="md-order-empty">No participating brands currently have dishes in this category. Try a different category.</p>
                ) : null}
              </section>

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
                          return (
                            <article key={item.id} className="marketplace-dish-card">
                              <img
                                src={item.imageUrl || brand?.image}
                                alt={item.name}
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
                  {activeBrand ? (() => {
                    const idx = primaryBrands.findIndex((b) => b.id === activeBrand);
                    const next = primaryBrands[(idx + 1) % primaryBrands.length];
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
                    <p className="text-muted-foreground">No dishes available from this brand right now.</p>
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
            <span className="truncate text-left">View your hand</span>
            <span>{formatPence(total)}</span>
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
            {[{ id: null as string | null }, ...primaryBrands.map((b) => ({ id: b.id as string | null }))].map(({ id }) => {
              const brand = id ? brandById(id) : null;
              const dishCount = id ? primaryItems.filter((i) => i.brandId === id).length : primaryItems.length;
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
                View your hand · {itemCount(lines)} · {formatPence(total)}
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <SiteFooter />
    </div>
  );
}
