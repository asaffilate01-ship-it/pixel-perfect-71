import { Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/mealdeck-logo.png.asset.json";

const navItems = [
  { label: "Home", to: "/", hash: undefined },
  { label: "Brands", to: "/", hash: "brands" },
  { label: "How It Works", to: "/", hash: "how" },
  { label: "Offers", to: "/", hash: "offers" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="shrink-0">
          <img src={logo.url} alt="MealDeck" className="h-14 w-auto" width={220} height={160} />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
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
              Start Ordering
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
