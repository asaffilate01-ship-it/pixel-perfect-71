import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bike,
  CarFront,
  Check,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteFooter } from "@/components/site-footer";
import {
  getCatalogue,
  placeOrder,
  resolveServiceArea,
  type ServiceabilityResult,
} from "@/lib/dishbee.functions";
import {
  addItem,
  addonBrandsForLocation,
  brandById,
  brands,
  formatPence,
  fulfilmentFeePence,
  fulfilmentLabels,
  itemCount,
  lineUnitPrice,
  locationByKey,
  primaryBrandsForLocation,
  setQuantity,
  subtotal,
  type CartLine,
  type FulfilmentType,
  type MenuItem,
  type SelectedModifier,
} from "@/lib/mealdeck";
import logo from "@/assets/mealdeck-logo.png.asset.json";

type OrderSearch = {
  brand?: string | undefined;
  fulfilment?: FulfilmentType | undefined;
};

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>): OrderSearch => ({
    brand: typeof search["brand"] === "string" ? search["brand"] : undefined,
    fulfilment:
      search["fulfilment"] === "pickup" ||
      search["fulfilment"] === "curbside" ||
      search["fulfilment"] === "delivery"
        ? search["fulfilment"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Order — MealDeck" },
      {
        name: "description",
        content:
          "Enter your postcode, choose delivery, pickup or kerbside, then mix MealDeck brands in one basket.",
      },
      { property: "og:title", content: "Order — MealDeck" },
      {
        property: "og:description",
        content:
          "One postcode check, one basket across brands, one checkout and one fulfilment experience.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrderPage,
});

const emptyCustomer = {
  name: "",
  phone: "",
  email: "",
  address1: "",
  city: "",
  postcode: "",
  vehicleRegistration: "",
  notes: "",
};

const fulfilmentOptions: Array<{
  key: FulfilmentType;
  label: string;
  copy: string;
  Icon: typeof Bike;
}> = [
  {
    key: "delivery",
    label: "Delivery",
    copy: "Delivered to your door",
    Icon: Bike,
  },
  {
    key: "pickup",
    label: "Pickup",
    copy: "Collect at the kitchen",
    Icon: Store,
  },
  {
    key: "curbside",
    label: "Kerbside",
    copy: "We bring it to your car",
    Icon: CarFront,
  },
];

function OrderPage() {
  const { brand: brandFromSearch, fulfilment: fulfilmentFromSearch } = Route.useSearch();
  const [fulfilment, setFulfilment] = useState<FulfilmentType>(
    fulfilmentFromSearch ?? "delivery",
  );
  const [postcode, setPostcode] = useState("");
  const [service, setService] = useState<ServiceabilityResult | null>(null);
  const [resolving, setResolving] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string | null>(brandFromSearch ?? null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentPending, setPaymentPending] = useState<{
    orderId: string;
    handoffCode?: string;
  } | null>(null);
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});

  const resolveArea = useServerFn(resolveServiceArea);
  const fetchCatalogue = useServerFn(getCatalogue);
  const submitOrder = useServerFn(placeOrder);

  const resolvedLocation = service?.served ? service.location : undefined;

  const catalogue = useQuery({
    queryKey: [
      "catalogue",
      resolvedLocation,
      service?.tenantId,
      service?.locationId,
    ],
    enabled: Boolean(resolvedLocation),
    queryFn: async () => {
      if (!resolvedLocation) throw new Error("Location is not resolved");
      return fetchCatalogue({
        data: {
          location: resolvedLocation,
          tenantId: service?.tenantId,
          locationId: service?.locationId,
        },
      });
    },
  });

  const currentLocation = resolvedLocation ? locationByKey(resolvedLocation) : null;
  const items = catalogue.data?.items ?? [];

  const primaryBrandIds = service?.served
    ? service.primaryBrandIds
    : currentLocation?.primaryBrandIds ?? [];
  const addonBrandIds = service?.served
    ? service.addonBrandIds
    : currentLocation?.addonBrandIds ?? [];

  const itemBrandIds = useMemo(() => new Set(items.map((item) => item.brandId)), [items]);

  const availablePrimaryBrands = useMemo(() => {
    if (!resolvedLocation) return [];
    const ids = new Set(primaryBrandIds);
    return primaryBrandsForLocation(resolvedLocation).filter(
      (brand) => ids.has(brand.id) && itemBrandIds.has(brand.id),
    );
  }, [resolvedLocation, primaryBrandIds, itemBrandIds]);

  const availableAddonBrands = useMemo(() => {
    if (!resolvedLocation) return [];
    const ids = new Set(addonBrandIds);
    return addonBrandsForLocation(resolvedLocation).filter(
      (brand) => ids.has(brand.id) && itemBrandIds.has(brand.id),
    );
  }, [resolvedLocation, addonBrandIds, itemBrandIds]);

  const mainItems = useMemo(() => {
    if (activeBrand) return items.filter((item) => item.brandId === activeBrand);
    const primary = new Set(primaryBrandIds);
    return items.filter((item) => primary.has(item.brandId));
  }, [items, activeBrand, primaryBrandIds]);

  const addonItems = useMemo(() => {
    const addons = new Set(addonBrandIds);
    return items.filter((item) => addons.has(item.brandId));
  }, [items, addonBrandIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of mainItems) {
      const key = item.category || "Menu";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [mainItems]);

  const goods = subtotal(lines);
  const fulfilmentFee = fulfilmentFeePence(fulfilment);
  const total = lines.length ? goods + fulfilmentFee : 0;

  async function findService(nextFulfilment = fulfilment) {
    if (postcode.trim().length < 2) {
      toast.error("Enter your postcode first.");
      return;
    }

    setResolving(true);
    try {
      const result = await resolveArea({
        data: { postcode: postcode.trim(), fulfilment: nextFulfilment },
      });

      if (
        lines.length &&
        service?.served &&
        result.served &&
        service.location !== result.location
      ) {
        setLines([]);
        setCheckoutOpen(false);
        toast.info("Basket cleared because your serving kitchen changed.");
      }

      setService(result);
      setActiveBrand(null);
      setCustomer((prev) => ({ ...prev, postcode: postcode.trim().toUpperCase() }));

      if (result.served) {
        toast.success(result.message);
      }
    } catch {
      toast.error("We couldn't check that postcode. Please try again.");
    } finally {
      setResolving(false);
    }
  }

  async function chooseFulfilment(next: FulfilmentType) {
    setFulfilment(next);
    setPaymentPending(null);
    if (postcode.trim()) await findService(next);
  }

  function startCustomising(item: MenuItem) {
    if (!item.modifierGroups?.length) {
      setLines((prev) => addItem(prev, item));
      toast.success(`${item.name} added to your basket`);
      return;
    }
    setModifierSelections({});
    setCustomizing(item);
  }

  function toggleModifier(groupId: string, optionId: string, maxSelect: number) {
    setModifierSelections((prev) => {
      const current = prev[groupId] ?? [];
      if (maxSelect === 1) return { ...prev, [groupId]: [optionId] };
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  }

  const selectedModifiers = useMemo<SelectedModifier[]>(() => {
    if (!customizing?.modifierGroups) return [];
    return customizing.modifierGroups.flatMap((group) =>
      (modifierSelections[group.id] ?? []).flatMap((optionId) => {
        const option = group.options.find((entry) => entry.id === optionId);
        return option
          ? [
              {
                ...option,
                groupId: group.id,
                groupName: group.name,
              },
            ]
          : [];
      }),
    );
  }, [customizing, modifierSelections]);

  const customizerValid =
    customizing?.modifierGroups?.every(
      (group) => (modifierSelections[group.id] ?? []).length >= group.minSelect,
    ) ?? true;

  const customizerPrice =
    (customizing?.pricePence ?? 0) +
    selectedModifiers.reduce((sum, modifier) => sum + modifier.priceDeltaPence, 0);

  function addCustomisedItem() {
    if (!customizing || !customizerValid) return;
    setLines((prev) => addItem(prev, customizing, selectedModifiers));
    toast.success(`${customizing.name} added to your basket`);
    setCustomizing(null);
    setModifierSelections({});
  }

  async function handleCheckout() {
    if (!resolvedLocation) return;
    setSubmitting(true);
    try {
      const result = await submitOrder({
        data: {
          location: resolvedLocation,
          tenantId: service?.tenantId,
          locationId: service?.locationId,
          fulfilment,
          lines: lines.map((line) => ({
            itemId: line.id,
            quantity: line.quantity,
            modifiers: line.selectedModifiers,
          })),
          deliveryPence: fulfilmentFee,
          customer,
        },
      });

      if (result.status === "payment_required") {
        setPaymentPending({
          orderId: result.orderId,
          handoffCode: result.handoffCode,
        });
        setCheckoutOpen(false);
        toast.success("Order created — payment is required before kitchen release.");
      } else if (result.status === "unconfigured") {
        toast.error("Kitchen service not connected yet", {
          description: "Add the Dishbee connection details to take live orders.",
        });
      } else {
        toast.error("We couldn't create that order", { description: result.message });
      }
    } catch {
      toast.error("We couldn't create that order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canCheckout =
    customer.name.trim() &&
    customer.phone.trim().length >= 5 &&
    customer.postcode.trim().length >= 2 &&
    (fulfilment !== "delivery" ||
      (customer.address1.trim() && customer.city.trim())) &&
    (fulfilment !== "curbside" || customer.vehicleRegistration.trim());

  const noServiceYet = !service?.served || !resolvedLocation;

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-0">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo.url} alt="MealDeck" className="h-12 w-auto" width={220} height={160} />
            <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <ArrowLeft className="size-4" /> Back home
            </span>
          </Link>

          {service?.served && currentLocation ? (
            <button
              onClick={() => {
                setService(null);
                setActiveBrand(null);
              }}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <MapPin className="size-4 text-accent" />
              <span className="hidden sm:inline">{currentLocation.town}</span>
              <span className="font-semibold text-foreground">{postcode.toUpperCase()}</span>
              <span className="text-xs">Change</span>
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="card-elevated overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1fr_1.1fr]">
            <div className="ember-surface p-6 sm:p-8 lg:p-10">
              <p className="eyebrow">Start your MealDeck order</p>
              <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
                One postcode.
                <br />
                <span className="text-gold">Every available brand.</span>
              </h1>
              <p className="mt-4 max-w-xl text-muted-foreground">
                Choose how you want your food, enter your postcode and we will show the exact
                MealDeck kitchen, brands and opening status available to you.
              </p>

              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                {fulfilmentOptions.map(({ key, label, copy, Icon }) => (
                  <button
                    key={key}
                    onClick={() => void chooseFulfilment(key)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      fulfilment === key
                        ? "border-accent bg-accent/10 shadow-[0_0_0_1px_hsl(var(--accent))]"
                        : "border-border bg-card/50 hover:border-accent/40"
                    }`}
                  >
                    <Icon className={`size-5 ${fulfilment === key ? "text-accent" : "text-muted-foreground"}`} />
                    <p className="mt-2 font-display font-bold">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{copy}</p>
                  </button>
                ))}
              </div>

              <div className="mt-5 flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={postcode}
                    onChange={(event) => setPostcode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void findService();
                    }}
                    placeholder="Enter postcode e.g. LU1 2AA"
                    className="h-12 pl-10 uppercase"
                  />
                </div>
                <Button
                  variant="hero"
                  size="lg"
                  className="h-12 rounded-xl"
                  disabled={resolving}
                  onClick={() => void findService()}
                >
                  {resolving ? <Loader2 className="animate-spin" /> : <Search />}
                  Check
                </Button>
              </div>
            </div>

            <div className="p-6 sm:p-8 lg:p-10">
              {!service ? (
                <div className="flex h-full min-h-52 flex-col justify-center">
                  <p className="font-display text-2xl font-bold">We will route you automatically.</p>
                  <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                    LU postcodes route to MealDeck Luton. AL postcodes route to St Albans.
                    Unsupported areas get a clear coming-soon message rather than an empty menu.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-3 py-1.5">Luton · 9 primary brands</span>
                    <span className="rounded-full border border-border px-3 py-1.5">St Albans · 10 primary brands incl. Café1</span>
                    <span className="rounded-full border border-border px-3 py-1.5">Icova + Moktl add-ons</span>
                  </div>
                </div>
              ) : service.served && currentLocation ? (
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow">Your serving kitchen</p>
                      <h2 className="mt-2 text-3xl font-extrabold">{currentLocation.name}</h2>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        service.channelOpen
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {service.channelOpen ? "Open for orders" : "Currently closed"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{service.message}</p>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="size-4 text-accent" />
                    {service.hoursLabel ?? currentLocation.hoursLabel}
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-border bg-card/60 p-4">
                      <p className="text-3xl font-extrabold text-accent">
                        {service.primaryBrandIds.length}
                      </p>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        Primary brands
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/60 p-4">
                      <p className="text-3xl font-extrabold text-accent">
                        {service.addonBrandIds.length}
                      </p>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        Add-on brands
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-52 flex-col justify-center">
                  <p className="font-display text-2xl font-bold">Not quite there yet.</p>
                  <p className="mt-3 max-w-lg text-muted-foreground">{service.message}</p>
                  {service.alternativeFulfilments?.includes("delivery") ? (
                    <Button
                      variant="gold"
                      className="mt-5 w-fit rounded-full"
                      onClick={() => void chooseFulfilment("delivery")}
                    >
                      Switch to Delivery
                      <ChevronRight />
                    </Button>
                  ) : (
                    <p className="mt-5 text-sm text-accent">
                      We are expanding the MealDeck kitchen network and will be coming to more areas.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {!noServiceYet && currentLocation ? (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
            <div className="min-w-0">
              <div className="sticky top-20 z-30 -mx-4 border-y border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  <button
                    onClick={() => setActiveBrand(null)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      activeBrand === null
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All brands
                  </button>
                  {availablePrimaryBrands.map((brand) => (
                    <button
                      key={brand.id}
                      onClick={() => setActiveBrand(brand.id)}
                      className={`flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-semibold transition-colors ${
                        activeBrand === brand.id
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <img src={brand.image} alt="" className="size-8 rounded-full object-cover" />
                      {brand.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-7">
                <p className="eyebrow">{currentLocation.name}</p>
                <h2 className="mt-2 text-4xl font-extrabold">
                  {activeBrand ? brandById(activeBrand)?.name : "Mix your favourites."}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Move between brands without losing your basket. {fulfilmentLabels[fulfilment]}{" "}
                  {fulfilmentFee ? `· one fee of ${formatPence(fulfilmentFee)}` : "· no delivery fee"}.
                </p>
              </div>

              {catalogue.data?.notice ? (
                <p className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
                  {catalogue.data.notice}
                </p>
              ) : null}

              {!service.channelOpen || catalogue.data?.channelOpen === false ? (
                <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  This kitchen is currently closed. You can browse, but checkout will reopen during service hours.
                </p>
              ) : null}

              {catalogue.isLoading ? (
                <div className="mt-16 flex justify-center">
                  <Loader2 className="size-8 animate-spin text-accent" />
                </div>
              ) : (
                <div className="mt-8 space-y-10">
                  {grouped.map(([category, categoryItems]) => (
                    <section key={category}>
                      <h3 className="font-display text-xl font-bold">{category}</h3>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {categoryItems.map((item) => {
                          const brand = brandById(item.brandId);
                          return (
                            <article
                              key={item.id}
                              className="card-elevated group flex gap-4 p-4 transition-transform hover:-translate-y-0.5"
                            >
                              <button
                                onClick={() => startCustomising(item)}
                                className="shrink-0 overflow-hidden rounded-xl"
                                aria-label={`Customise ${item.name}`}
                              >
                                <img
                                  src={item.imageUrl || brand?.image}
                                  alt={item.name}
                                  width={816}
                                  height={816}
                                  loading="lazy"
                                  className="size-24 object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              </button>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <p className="text-xs uppercase tracking-[0.14em] text-accent">
                                  {brand?.name ?? "MealDeck"}
                                </p>
                                <p className="font-display font-bold">{item.name}</p>
                                {item.description ? (
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                    {item.description}
                                  </p>
                                ) : null}
                                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                                  <span className="font-display font-bold">
                                    {formatPence(item.pricePence)}
                                  </span>
                                  <Button
                                    variant="hero"
                                    size="sm"
                                    className="rounded-full"
                                    onClick={() => startCustomising(item)}
                                  >
                                    {item.modifierGroups?.length ? <SlidersHorizontal /> : <Plus />}
                                    {item.modifierGroups?.length ? "Customise" : "Add"}
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
                    <p className="text-muted-foreground">No dishes available right now.</p>
                  ) : null}
                </div>
              )}

              {availableAddonBrands.length && addonItems.length ? (
                <section className="mt-12 rounded-3xl border border-accent/30 bg-accent/5 p-5 sm:p-6">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="eyebrow">Complete your order</p>
                      <h3 className="mt-2 text-2xl font-extrabold">Icova & Moktl add-ons.</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Drinks and coffee sit across the MealDeck menus, so you can add them without leaving your current brand.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {availableAddonBrands.map((brand) => (
                        <img
                          key={brand.id}
                          src={brand.image}
                          alt={brand.name}
                          className="size-12 rounded-xl object-cover"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {addonItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => startCustomising(item)}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 text-left transition-colors hover:border-accent/50"
                      >
                        <img
                          src={item.imageUrl || brandById(item.brandId)?.image}
                          alt=""
                          className="size-14 rounded-xl object-cover"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs uppercase tracking-[0.12em] text-accent">
                            {brandById(item.brandId)?.name}
                          </span>
                          <span className="block truncate font-display font-bold">{item.name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {formatPence(item.pricePence)}
                          </span>
                        </span>
                        <Plus className="size-5 text-accent" />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside id="basket" className="scroll-mt-28 lg:sticky lg:top-28 lg:self-start">
              <div className="card-elevated p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Your Basket</h2>
                  {lines.length ? (
                    <button
                      onClick={() => setLines([])}
                      className="text-xs text-muted-foreground hover:text-primary"
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {itemCount(lines)} items from{" "}
                  {new Set(lines.map((line) => line.brandId)).size} brands
                </p>

                <div className="mt-4 max-h-[42vh] space-y-3 overflow-y-auto pr-1">
                  {lines.map((line) => (
                    <div key={line.lineId} className="rounded-2xl border border-border bg-card/60 p-3">
                      <div className="flex gap-3">
                        <img
                          src={line.imageUrl || brandById(line.brandId)?.image}
                          alt=""
                          className="size-12 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-accent">
                            {brandById(line.brandId)?.name}
                          </p>
                          <p className="truncate text-sm font-medium">{line.name}</p>
                          {line.selectedModifiers.length ? (
                            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                              {line.selectedModifiers.map((modifier) => modifier.name).join(" · ")}
                            </p>
                          ) : null}
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatPence(lineUnitPrice(line) * line.quantity)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="glass"
                            size="icon"
                            className="size-8 rounded-full"
                            onClick={() =>
                              setLines((prev) =>
                                setQuantity(prev, line.lineId, line.quantity - 1),
                              )
                            }
                          >
                            {line.quantity === 1 ? <Trash2 /> : <Minus />}
                          </Button>
                          <span className="w-5 text-center text-sm font-semibold">
                            {line.quantity}
                          </span>
                          <Button
                            variant="glass"
                            size="icon"
                            className="size-8 rounded-full"
                            onClick={() =>
                              setLines((prev) =>
                                setQuantity(prev, line.lineId, line.quantity + 1),
                              )
                            }
                          >
                            <Plus />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {lines.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Your basket stays with you as you move between MealDeck brands.
                    </p>
                  ) : null}
                </div>

                {lines.length ? (
                  <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Food</span>
                      <span>{formatPence(goods)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{fulfilmentLabels[fulfilment]}</span>
                      <span>{fulfilmentFee ? formatPence(fulfilmentFee) : "Free"}</span>
                    </div>
                    <div className="flex justify-between font-display text-lg font-bold">
                      <span>Total</span>
                      <span>{formatPence(total)}</span>
                    </div>
                    <Button
                      variant="hero"
                      size="lg"
                      className="mt-3 w-full rounded-full"
                      disabled={!service.channelOpen || catalogue.data?.channelOpen === false}
                      onClick={() => setCheckoutOpen((open) => !open)}
                    >
                      Checkout Once
                    </Button>
                  </div>
                ) : null}
              </div>

              {checkoutOpen && lines.length ? (
                <div className="card-elevated mt-5 space-y-3 p-5">
                  <div>
                    <p className="eyebrow">{fulfilmentLabels[fulfilment]}</p>
                    <h3 className="mt-1 font-display text-lg font-bold">Handoff details</h3>
                  </div>

                  {(
                    [
                      ["name", "Full name"],
                      ["phone", "Phone"],
                      ["email", "Email (optional)"],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="space-y-1">
                      <Label htmlFor={field}>{label}</Label>
                      <Input
                        id={field}
                        value={customer[field]}
                        onChange={(event) =>
                          setCustomer((prev) => ({ ...prev, [field]: event.target.value }))
                        }
                      />
                    </div>
                  ))}

                  {fulfilment === "delivery" ? (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="address1">Delivery address</Label>
                        <Input
                          id="address1"
                          value={customer.address1}
                          onChange={(event) =>
                            setCustomer((prev) => ({ ...prev, address1: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="city">Town / city</Label>
                        <Input
                          id="city"
                          value={customer.city}
                          onChange={(event) =>
                            setCustomer((prev) => ({ ...prev, city: event.target.value }))
                          }
                        />
                      </div>
                    </>
                  ) : null}

                  {fulfilment === "curbside" ? (
                    <div className="space-y-1">
                      <Label htmlFor="vehicleRegistration">Vehicle registration</Label>
                      <Input
                        id="vehicleRegistration"
                        value={customer.vehicleRegistration}
                        onChange={(event) =>
                          setCustomer((prev) => ({
                            ...prev,
                            vehicleRegistration: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="AB12 CDE"
                        className="uppercase"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Label htmlFor="checkout-postcode">Postcode</Label>
                    <Input
                      id="checkout-postcode"
                      value={customer.postcode}
                      readOnly
                      className="uppercase opacity-80"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="notes">Order notes (optional)</Label>
                    <Textarea
                      id="notes"
                      value={customer.notes}
                      onChange={(event) =>
                        setCustomer((prev) => ({ ...prev, notes: event.target.value }))
                      }
                    />
                  </div>

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
                  <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                    Your kitchen ticket is released only after payment confirmation.
                  </p>
                </div>
              ) : null}

              {paymentPending ? (
                <div className="mt-5 rounded-3xl border border-accent/40 bg-accent/10 p-5">
                  <p className="eyebrow">Payment required</p>
                  <h3 className="mt-2 font-display text-xl font-bold">
                    Your order is reserved.
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Complete payment to send it to the kitchen. Until payment confirms,
                    it will not appear on the KDS.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-background/50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Order
                      </p>
                      <p className="mt-1 truncate font-mono text-sm font-bold">
                        {paymentPending.orderId.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background/50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Handoff code
                      </p>
                      <p className="mt-1 font-mono text-xl font-black tracking-[0.2em]">
                        {paymentPending.handoffCode ?? "----"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}
      </main>

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

      {customizing ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={() => setCustomizing(null)}
        >
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <img
                src={customizing.imageUrl || brandById(customizing.brandId)?.image}
                alt={customizing.name}
                className="size-20 rounded-2xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.14em] text-accent">
                  {brandById(customizing.brandId)?.name}
                </p>
                <h2 className="font-display text-2xl font-bold">{customizing.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {customizing.description}
                </p>
              </div>
              <button
                onClick={() => setCustomizing(null)}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {customizing.modifierGroups?.map((group) => {
                const selected = modifierSelections[group.id] ?? [];
                return (
                  <section key={group.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display font-bold">{group.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {group.minSelect
                            ? group.maxSelect === 1
                              ? "Choose one"
                              : `Choose at least ${group.minSelect}`
                            : group.maxSelect > 1
                              ? `Optional · choose up to ${group.maxSelect}`
                              : "Optional"}
                        </p>
                      </div>
                      {selected.length >= group.minSelect && group.minSelect > 0 ? (
                        <Check className="size-5 text-emerald-400" />
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2">
                      {group.options.map((option) => {
                        const active = selected.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() =>
                              toggleModifier(group.id, option.id, group.maxSelect)
                            }
                            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                              active
                                ? "border-accent bg-accent/10"
                                : "border-border bg-card/60 hover:border-accent/40"
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <span
                                className={`grid size-5 place-items-center rounded-full border ${
                                  active
                                    ? "border-accent bg-accent text-accent-foreground"
                                    : "border-border"
                                }`}
                              >
                                {active ? <Check className="size-3" /> : null}
                              </span>
                              <span className="font-medium">{option.name}</span>
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {option.priceDeltaPence
                                ? `+${formatPence(option.priceDeltaPence)}`
                                : "Included"}
                            </span>
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
              size="xl"
              className="mt-7 w-full rounded-full"
              disabled={!customizerValid}
              onClick={addCustomisedItem}
            >
              Add to basket · {formatPence(customizerPrice)}
            </Button>
          </div>
        </div>
      ) : null}

      <SiteFooter />
    </div>
  );
}
