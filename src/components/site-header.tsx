import { Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/mealdeck-card-deck.png.asset.json";

const navItems = [
  { label: "Brands", hash: "brands" },
  { label: "How It Works", hash: "how" },
  { label: "Offers", hash: "offers" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="shrink-0">
          <span className="flex items-center gap-2">
            <img src={logo.url} alt="" className="size-12 object-contain" width={48} height={48} />
            <span className="hidden font-display text-lg font-black sm:inline">MEAL<span className="text-accent">DECK</span></span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          <Link
            to="/"
            className="font-display text-sm font-semibold text-foreground/85 transition-colors hover:text-accent"
          >
            Home
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.label}
              to="/"
              hash={item.hash}
              className="font-display text-sm font-semibold text-foreground/85 transition-colors hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/order"
            className="font-display text-sm font-semibold text-foreground/85 transition-colors hover:text-accent"
          >
            Order Now
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="glass" size="default" className="hidden rounded-full sm:inline-flex" asChild>
            <Link to="/order" hash="basket">
              <ShoppingBasket />
              Basket
            </Link>
          </Button>
          <Button variant="hero" size="default" className="rounded-full" asChild>
            <Link to="/order">
              Deal Me In
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
