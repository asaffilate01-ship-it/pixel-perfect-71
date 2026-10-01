import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, MapPin, Menu, Newspaper, ShoppingBasket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import logo from "@/assets/mealdeck-fan-logo.png";

const sectionLinks = [
  { label: "Brands", hash: "brands" },
  { label: "How It Works", hash: "how" },
  { label: "Offers", hash: "offers" },
] as const;

const locationLinks = [
  { label: "Luton", to: "/luton", hint: "Delivery, pickup & kerbside" },
  { label: "St Albans", to: "/st-albans", hint: "Café1 · Delivery, pickup & dine-in" },
] as const;

const moreLinks = [
  { label: "Blog", to: "/blog", icon: Newspaper },
  { label: "Track Order", to: "/track", icon: MapPin },
] as const;

function NavDropdown({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`${navLinkClass} inline-flex items-center gap-1`}
      >
        {label}
        <ChevronDown className={`size-3.5 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          onMouseEnter={() => setOpen(true)}
          className="absolute top-full left-1/2 z-50 w-60 -translate-x-1/2 pt-3"
        >
          <div className="overflow-hidden rounded-xl border border-border/80 bg-popover p-1.5 shadow-xl shadow-black/10">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

const navLinkClass =
  "font-display text-sm font-semibold text-foreground/85 transition-colors hover:text-accent data-[status=active]:text-accent";

export function SiteHeader({ context, nav = true }: { context?: ReactNode; nav?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-20 sm:h-24 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="shrink-0" aria-label="MealDeck home">
          <img
            src={logo}
            alt="MealDeck — One Order. Every Craving."
            className="size-18 object-contain sm:size-22"
            width={88}
            height={88}
          />
        </Link>

        {nav && (
          <nav className="hidden items-center gap-6 lg:flex">
            <Link to="/" className={navLinkClass}>
              Home
            </Link>
            {sectionLinks.map((item) => (
              <Link key={item.label} to="/" hash={item.hash} className={navLinkClass}>
                {item.label}
              </Link>
            ))}
            <NavDropdown label="Locations">
              {locationLinks.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/10"
                >
                  <span className="font-display text-sm font-semibold text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </Link>
              ))}
            </NavDropdown>
            <NavDropdown label="More">
              {moreLinks.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/10"
                >
                  <item.icon className="size-4 text-accent" />
                  <span className="font-display text-sm font-semibold text-foreground">{item.label}</span>
                </Link>
              ))}
            </NavDropdown>
            <Link to="/order" className={navLinkClass}>
              Order Now
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          {context ?? (
            <>
              <Button variant="glass" size="default" className="hidden rounded-full sm:inline-flex" asChild>
                <Link to="/order" hash="basket">
                  <ShoppingBasket />
                  Basket
                </Link>
              </Button>
              <Button variant="hero" size="default" className="hidden rounded-full sm:inline-flex" asChild>
                <Link to="/order">
                  Deal Me In
                  <ArrowRight />
                </Link>
              </Button>
            </>
          )}
          {nav && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground lg:hidden"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          )}
          <ThemeToggle compact className="sm:hidden" />
        </div>
      </div>

      {nav && open && (
        <nav className="border-t border-border/70 bg-background/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            <Link to="/" onClick={() => setOpen(false)} className={`${navLinkClass} rounded-lg px-3 py-3 text-base`}>
              Home
            </Link>
            {sectionLinks.map((item) => (
              <Link
                key={item.label}
                to="/"
                hash={item.hash}
                onClick={() => setOpen(false)}
                className={`${navLinkClass} rounded-lg px-3 py-3 text-base`}
              >
                {item.label}
              </Link>
            ))}
            <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Locations
            </p>
            {locationLinks.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`${navLinkClass} rounded-lg px-3 py-3 text-base`}
              >
                {item.label}
              </Link>
            ))}
            <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              More
            </p>
            {moreLinks.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`${navLinkClass} rounded-lg px-3 py-3 text-base`}
              >
                {item.label}
              </Link>
            ))}
            <Button variant="hero" size="default" className="mt-2 rounded-full" asChild>
              <Link to="/order" onClick={() => setOpen(false)}>
                Order Now
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
