import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bike,
  CarFront,
  Check,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  modifierOptionsFor,
  setQuantity,
  subtotal,
  type Brand,
  type CartLine,
  type FulfilmentType,
  type LocationKey,
  type MenuItem,
  type SelectedModifier,
} from "@/lib/mealdeck";
import logo from "@/assets/mealdeck-logo.png.asset.json";

type OrderSearch = { brand?: string };

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>): OrderSearch =>
    typeof search["brand"] === "string" ? { brand: search["brand"] } : {},
  head: () => ({
    meta: [
      { title: "Order — MealDeck" },
      {
        name: "description",
        content:
          "Choose delivery, pickup or kerbside, enter your postcode and build one MealDeck basket across every brand.",
      },
      { property: "og:title", content: "Order — MealDeck" },
      {
        property: "og:description",
        content: "One basket across every MealDeck brand. Delivery, pickup or kerbside. One checkout.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrderPage,
});

const fulfilmentIcons = { delivery: Bike, pickup: Package, curbside: CarFront } as const;

const emptyCustomer = {
  name: "",
  phone: "",
  email: "",
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
  const { brand: brandFromSearch } = Route.useSearch();
  const [fulfilment, setFulfilment] = useState<FulfilmentType>("delivery");
  const [postcode, setPostcode] = useState("");
  const [checking, setChecking] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<{ tone: "idle" | "ok" | "error"; text: string }>({
    tone: "idle",
    text: "Choose how you'd like your order and enter your postcode to see your MealDeck kitchen.",
  });
  const [location, setLocation] = useState<LocationKey | null>(null);
  const [activeBrand, setActiveBrand] = useState<string | null>(brandFromSearch ?? null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<{ orderId: string; handoffCode: string } | null>(null);
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

  const primaryBrands = useMemo(
    () => (currentLocation ? currentLocation.primaryBrandIds.map(brandById).filter((b): b is Brand => !!b) : []),
    [currentLocation],
  );
  const primaryItems = items.filter((item) => currentLocation?.primaryBrandIds.includes(item.brandId));
  const addonItems = items.filter((item) => currentLocation?.addonBrandIds.includes(item.brandId));
  const visibleItems = activeBrand ? primaryItems.filter((item) => item.brandId === activeBrand) : primaryItems;

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
  const deliveryPence = lines.length && fulfilment === "delivery" ? DELIVERY_FEE_PENCE : 0;
  const total = goods + deliveryPence;

  async function checkArea() {
    if (!postcode.trim()) {
      setServiceMessage({ tone: "error", text: "Enter a postcode to find your nearest MealDeck." });
      return;
    }
    setChecking(true);
    try {
      const result = await runServiceability({ data: { postcode: postcode.trim(), fulfilment } });
      if (!result.served) {
        setServiceMessage({ tone: "error", text: result.message });
        return;
      }
      if (location && location !== result.location && lines.length) {
        setLines([]);
        toast("Basket cleared", { description: "Your postcode moved you to a different MealDeck kitchen." });
      }
      setLocation(result.location);
      setCustomer((prev) => ({ ...prev, postcode: prev.postcode || postcode.trim().toUpperCase() }));
      setServiceMessage({ tone: "ok", text: result.message });
    } catch {
      setServiceMessage({ tone: "error", text: "We couldn't check that postcode right now. Please try again." });
    } finally {
      setChecking(false);
    }
  }

  function changeFulfilment(next: FulfilmentType) {
    setFulfilment(next);
    if (currentLocation && !currentLocation.allowedFulfilments.includes(next)) {
      setServiceMessage({
        tone: "error",
        text: `${currentLocation.name} offers ${currentLocation.allowedFulfilments.map((f) => fulfilmentLabels[f]).join(", ")} only.`,
      });
    }
  }

  function beginAdd(item: MenuItem) {
    if (item.hasModifiers) {
      setCustomising(item);
      setChosen([]);
      return;
    }
    setLines((prev) => addItem(prev, item));
  }

  function toggleModifier(modifier: SelectedModifier) {
    setChosen((current) =>
      current.some((m) => m.name === modifier.name)
        ? current.filter((m) => m.name !== modifier.name)
        : [...current, modifier],
    );
  }

  const fulfilmentAllowed = currentLocation?.allowedFulfilments.includes(fulfilment) ?? false;

  const canCheckout =
    !!location &&
    fulfilmentAllowed &&
    channelOpen &&
    customer.name.trim() &&
    customer.phone.trim().length >= 5 &&
    (fulfilment !== "delivery" ||
      (customer.address1.trim() && customer.city.trim() && customer.postcode.trim().length >= 3)) &&
    (fulfilment !== "curbside" || customer.vehicleRegistration.trim());

  async function handleCheckout() {
    if (!location) return;
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
      if (result.status === "placed") {
        setPlaced({ orderId: result.orderId, handoffCode: result.handoffCode });
        setLines([]);
        setCheckoutOpen(false);
        toast.success("Order created", { description: `Your handoff code is ${result.handoffCode}` });
      } else if (result.status === "unconfigured") {
        toast.error("Kitchen service not connected yet", {
          description: "This is a preview — live orders start once the kitchen service is connected.",
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

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo.url} alt="MealDeck" className="h-12 w-auto" width={220} height={160} />
            <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <ArrowLeft className="size-4" /> Back home
            </span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm">
            <MapPin className="size-4 text-accent" />
            <span className="font-medium">{currentLocation ? currentLocation.town : "Find your kitchen"}</span>
            <span className="text-muted-foreground">· {fulfilmentLabels[fulfilment]}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          {/* Step 1: fulfilment + postcode */}
          <section className="card-elevated p-5 sm:p-6">
            <p className="eyebrow">Find your MealDeck</p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">How would you like your order?</h1>
            <div className="mt-5 grid grid-cols-3 gap-2" role="tablist" aria-label="How you'd like your order">
              {(Object.keys(fulfilmentLabels) as FulfilmentType[]).map((key) => {
                const Icon = fulfilmentIcons[key];
                const active = fulfilment === key;
                return (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => changeFulfilment(key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                      active
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-5" />
                    {fulfilmentLabels[key]}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={postcode}
                  onChange={(event) => setPostcode(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void checkArea()}
                  placeholder="Enter postcode, e.g. LU1 2AA"
                  aria-label="Postcode"
                  className="h-12 pl-9"
                />
              </div>
              <Button variant="hero" size="lg" className="h-12 rounded-full" onClick={() => void checkArea()} disabled={checking}>
                {checking ? <Loader2 className="animate-spin" /> : <Search />}
                Check area
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

          {placed ? (
            <div className="mt-6 rounded-xl border border-primary/40 bg-primary/10 p-5">
              <p className="font-display text-lg font-bold">Order received</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your handoff code is <strong className="text-2xl text-gold">{placed.handoffCode}</strong>. Give your name
                {fulfilment === "curbside" ? ", car registration" : ""} and this code when you collect or receive your food.
                The kitchen starts cooking once payment is confirmed.
              </p>
            </div>
          ) : null}

          {!currentLocation ? (
            <p className="mt-10 text-center text-muted-foreground">
              Tip: try a Luton (LU…) or St Albans (AL…) postcode.
            </p>
          ) : (
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

              <div className="mt-8">
                <p className="eyebrow">
                  {currentLocation.town} · {primaryBrands.length} brands
                </p>
                <h2 className="mt-2 text-3xl font-extrabold">Move between brands. Keep one basket.</h2>
              </div>

              <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
                <button
                  onClick={() => setActiveBrand(null)}
                  className={`flex h-20 w-24 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                    activeBrand === null ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  All brands
                </button>
                {primaryBrands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => setActiveBrand(brand.id)}
                    aria-label={brand.name}
                    className={`flex h-20 w-24 shrink-0 items-center justify-center rounded-xl border bg-card p-2 transition-colors ${
                      activeBrand === brand.id ? "border-accent ring-2 ring-accent" : "border-border hover:border-accent/60"
                    }`}
                  >
                    <BrandMark brand={brand} className="h-full w-full text-sm" />
                  </button>
                ))}
              </div>

              {catalogue.isLoading ? (
                <div className="mt-16 flex justify-center">
                  <Loader2 className="size-8 animate-spin text-accent" />
                </div>
              ) : (
                <div className="mt-8 space-y-10">
                  {grouped.map(([group, groupItems]) => (
                    <section key={group}>
                      <h3 className="font-display text-xl font-bold">{group}</h3>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {groupItems.map((item) => {
                          const brand = brandById(item.brandId);
                          return (
                            <article key={item.id} className="card-elevated flex gap-4 p-4">
                              <img
                                src={item.imageUrl || brand?.image}
                                alt={item.name}
                                width={816}
                                height={816}
                                loading="lazy"
                                className="size-20 shrink-0 rounded-lg object-cover"
                              />
                              <div className="flex min-w-0 flex-1 flex-col">
                                <p className="text-xs uppercase tracking-[0.14em] text-accent">{brand?.name ?? "MealDeck"}</p>
                                <p className="font-display font-bold">{item.name}</p>
                                {item.description ? (
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                                ) : null}
                                <div className="mt-auto flex items-center justify-between pt-3">
                                  <span className="font-display font-bold">{formatPence(item.pricePence)}</span>
                                  <Button
                                    variant="hero"
                                    size="sm"
                                    className="rounded-full"
                                    disabled={!channelOpen}
                                    onClick={() => beginAdd(item)}
                                  >
                                    <Plus /> {item.hasModifiers ? "Choose" : "Add"}
                                  </Button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
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
                              {brand ? <BrandMark brand={brand} className="h-12 w-16 shrink-0" /> : null}
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
        <aside id="basket" className="scroll-mt-24 lg:sticky lg:top-28 lg:self-start">
          <div className="card-elevated p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Your Basket</h2>
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
                  Your basket is empty. Mix brands to your heart's content.
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
                  Checkout Once
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
                  ["vehicleRegistration", "Car registration", fulfilment === "curbside"],
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
                You'll get a 4-digit handoff code. The kitchen starts once payment is confirmed.
              </p>
              <Button
                variant="gold"
                size="lg"
                className="w-full rounded-full"
                disabled={!canCheckout || submitting}
                onClick={handleCheckout}
              >
                {submitting ? <Loader2 className="animate-spin" /> : null}
                Place order · {formatPence(total)}
              </Button>
            </div>
          ) : null}
        </aside>
      </main>

      <Dialog open={customising !== null} onOpenChange={(open) => !open && setCustomising(null)}>
        <DialogContent>
          {customising ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{customising.name}</DialogTitle>
                <DialogDescription>{customising.description ?? "Customise your item."}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {modifierOptionsFor(customising).map((modifier) => {
                  const selected = chosen.some((m) => m.name === modifier.name);
                  return (
                    <button
                      key={modifier.name}
                      onClick={() => toggleModifier(modifier)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                        selected ? "border-accent bg-accent/10" : "border-border hover:border-accent/60"
                      }`}
                    >
                      <span>
                        <span className="font-semibold">{modifier.name}</span>
                        {modifier.priceDeltaPence > 0 ? (
                          <span className="ml-2 text-sm text-muted-foreground">+{formatPence(modifier.priceDeltaPence)}</span>
                        ) : null}
                      </span>
                      {selected ? <Check className="size-4 text-accent" /> : <Plus className="size-4 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="hero"
                size="lg"
                className="w-full rounded-full"
                onClick={() => {
                  setLines((prev) => addItem(prev, customising, chosen));
                  setCustomising(null);
                }}
              >
                Add to basket · {formatPence(lineUnitPrice({ pricePence: customising.pricePence, selectedModifiers: chosen }))}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {lines.length ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
          <Button variant="hero" size="lg" className="w-full rounded-full" asChild>
            <a href="#basket">
              <ShoppingBasket />
              {itemCount(lines)} items · {formatPence(total)}
            </a>
          </Button>
        </div>
      ) : null}

      <SiteFooter />
    </div>
  );
}
