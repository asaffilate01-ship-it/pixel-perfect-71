import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Youtube, Music2 } from "lucide-react";
import logo from "@/assets/mealdeck-card-deck.png.asset.json";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <img src={logo.url} alt="MealDeck — One Order. Every Craving." className="size-28 object-contain" width={112} height={112} loading="lazy" />
        </div>

        <nav className="flex flex-wrap gap-6 text-sm font-medium text-muted-foreground">
          <Link to="/" className="hover:text-accent">Home</Link>
          <Link to="/" hash="brands" className="hover:text-accent">Brands</Link>
          <Link to="/" hash="how" className="hover:text-accent">How It Works</Link>
          <Link to="/" hash="offers" className="hover:text-accent">Offers</Link>
          <Link to="/order" className="hover:text-accent">Order Now</Link>
        </nav>

        <div className="flex items-center gap-4 text-muted-foreground">
          <Instagram className="size-5 transition-colors hover:text-accent" />
          <Facebook className="size-5 transition-colors hover:text-accent" />
          <Music2 className="size-5 transition-colors hover:text-accent" />
          <Youtube className="size-5 transition-colors hover:text-accent" />
        </div>

        <p className="font-display text-xl font-black leading-tight text-accent">A full house<br />of flavour.</p>
      </div>

      <div className="border-t border-border/60 py-5 text-center text-xs text-muted-foreground">
        One Order. Every Craving. · © {new Date().getFullYear()} MealDeck. All rights reserved.
      </div>
    </footer>
  );
}
