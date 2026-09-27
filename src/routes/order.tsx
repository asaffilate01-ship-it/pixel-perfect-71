import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteFooter } from "@/components/site-footer";
import { getCatalogue, placeOrder } from "@/lib/dishbee.functions";
import {
  DELIVERY_FEE_PENCE,
  addItem,
  brandById,
  brands,
  formatPence,
  itemCount,
  locations,
  setQuantity,
  subtotal,
  type CartLine,
  type LocationKey,
  type MenuItem,
} from "@/lib/mealdeck";
import logo from "@/assets/mealdeck-logo.png.asset.json";

type OrderSearch = { brand?: string };

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>): OrderSearch => ({
    brand: typeof search["brand"] === "string" ? search["brand"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Order — MealDeck" },
      {
        name: "description",
        content:
          "Build one MealDeck basket across every brand in Luton and St Albans, then check out once with a single delivery fee.",
      },
      { property: "og:title", content: "Order — MealDeck" },
      {
        property: "og:description",
        content: "One basket across every MealDeck brand. One delivery fee. One checkout.",
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
  notes: "",
};

function OrderPage() {
  const { brand: brandFromSearch } = Route.useSearch();
  const [location, setLocation] = useState<LocationKey>("luton");
  const [activeBrand, setActiveBrand] = useState<string | null>(brandFromSearch ?? null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  const fetchCatalogue = useServerFn(getCatalogue);
  const submitOrder = useServerFn(placeOrder);

  const catalogue = useQuery({
    queryKey: ["catalogue", location],
    queryFn: () => fetchCatalogue({ data: { location } }),
  });

  const items = catalogue.data?.items ?? [];
  const availableBrands = useMemo(() => {
    const ids = new Set(items.map((item) => item.brandId));
    return brands.filter((brand) => ids.has(brand.id));
  }, [items]);

  const visibleItems = activeBrand
    ? items.filter((item) => item.brandId === activeBrand)
    : items;

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of visibleItems) {
      const key = item.category || "Menu";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [visibleItems]);

  const goods = subtotal(lines);
  const total = lines.length ? goods + DELIVERY_FEE_PENCE : 0;
  const currentLocation = locations.find((entry) => entry.key === location)!;

  async function handleCheckout() {
    setSubmitting(true);
    try {
      const result = await submitOrder({
        data: {
          location,
          lines: lines.map((line) => ({ itemId: line.id, quantity: line.quantity })),
          deliveryPence: DELIVERY_FEE_PENCE,
          customer,
        },
      });

      if (result.status === "placed") {
        setPlacedOrderId(result.orderId);
        setLines([]);
        setCheckoutOpen(false);
        toast.success("Order placed", { description: `Reference ${result.orderId}` });
      } else if (result.status === "unconfigured") {
        toast.error("Kitchen service not connected yet", {
          description: "Add the kitchen service details to take live orders.",
        });
      } else {
        toast.error("We couldn't place that order", { description: result.message });
      }
    } catch {
      toast.error("We couldn't place that order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canCheckout =
    customer.name.trim() &&
    customer.phone.trim().length >= 5 &&
    customer.address1.trim() &&
    customer.city.trim() &&
    customer.postcode.trim().length >= 3;

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

          <div className="flex items-center gap-2 rounded-full border border-border bg-card p-1">
            {locations.map((entry) => (
              <button
                key={entry.key}
                onClick={() => {
                  setLocation(entry.key);
                  setActiveBrand(null);
                }}
                className={`rounded-full px-4 py-2 font-display text-sm font-semibold transition-colors ${
                  location === entry.key
                    ? "bg-[image:var(--gradient-flame)] text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {entry.town}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="eyebrow">{currentLocation.name}</p>
          <h1 className="mt-2 text-4xl font-extrabold">Build your basket.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {currentLocation.hoursLabel} · One delivery fee of {formatPence(DELIVERY_FEE_PENCE)}.
          </p>

          {catalogue.data?.notice ? (
            <p className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
              {catalogue.data.notice}
            </p>
          ) : null}

          {placedOrderId ? (
            <p className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
              Order confirmed. Reference <strong>{placedOrderId}</strong>.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveBrand(null)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                activeBrand === null
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              All brands
            </button>
            {availableBrands.map((brand) => (
              <button
                key={brand.id}
                onClick={() => setActiveBrand(brand.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  activeBrand === brand.id
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {brand.name}
              </button>
            ))}
          </div>

          {catalogue.isLoading ? (
            <div className="mt-16 flex justify-center">
              <Loader2 className="size-8 animate-spin text-accent" />
            </div>
          ) : (
            <div className="mt-8 space-y-10">
              {grouped.map(([category, categoryItems]) => (
                <section key={category}>
                  <h2 className="font-display text-xl font-bold">{category}</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {categoryItems.map((item) => {
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
                            <p className="text-xs uppercase tracking-[0.14em] text-accent">
                              {brand?.name ?? "MealDeck"}
                            </p>
                            <p className="font-display font-bold">{item.name}</p>
                            {item.description ? (
                              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {item.description}
                              </p>
                            ) : null}
                            <div className="mt-auto flex items-center justify-between pt-3">
                              <span className="font-display font-bold">
                                {formatPence(item.pricePence)}
                              </span>
                              <Button
                                variant="hero"
                                size="sm"
                                className="rounded-full"
                                onClick={() => setLines((prev) => addItem(prev, item))}
                              >
                                <Plus /> Add
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
        </div>

        {/* Basket */}
        <aside id="basket" className="scroll-mt-24 lg:sticky lg:top-28 lg:self-start">
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

            <div className="mt-4 space-y-3">
              {lines.map((line) => (
                <div key={line.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-accent">
                      {brandById(line.brandId)?.name}
                    </p>
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPence(line.pricePence * line.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="glass"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() =>
                        setLines((prev) => setQuantity(prev, line.id, line.quantity - 1))
                      }
                    >
                      {line.quantity === 1 ? <Trash2 /> : <Minus />}
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                    <Button
                      variant="glass"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() =>
                        setLines((prev) => setQuantity(prev, line.id, line.quantity + 1))
                      }
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
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery (one fee)</span>
                  <span>{formatPence(DELIVERY_FEE_PENCE)}</span>
                </div>
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
              <h3 className="font-display text-lg font-bold">Delivery details</h3>
              {(
                [
                  ["name", "Full name"],
                  ["phone", "Phone"],
                  ["email", "Email (optional)"],
                  ["address1", "Address"],
                  ["city", "Town / city"],
                  ["postcode", "Postcode"],
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
              <div className="space-y-1">
                <Label htmlFor="notes">Delivery notes</Label>
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
                Place order · {formatPence(total)}
              </Button>
            </div>
          ) : null}
        </aside>
      </main>

      {/* Mobile sticky basket */}
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
