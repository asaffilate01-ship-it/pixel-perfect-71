import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowRight, MapPin, Menu, X } from "lucide-react";
import mealDeckLogo from "@/assets/mealdeck-main-logo.png.asset.json";

const navItems = [
  { label: "Brands", to: "/", hash: "brands" },
  { label: "Offers", to: "/", hash: "offers" },
  { label: "How it works", to: "/", hash: "how" },
  { label: "Locations", to: "/", hash: "locations" },
] as const;

export function SiteHeader({ context, nav = true }: { context?: ReactNode; nav?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="md-site-header">
      <div className="md-header-inner">
        <Link to="/" className="md-header-logo" aria-label="MealDeck home">
          <img src={mealDeckLogo.url} alt="MealDeck — One Order. Every Craving." />
        </Link>

        {nav ? (
          <nav className="md-desktop-nav" aria-label="Main navigation">
            <Link to="/">Home</Link>
            {navItems.map((item) => (
              <Link key={item.label} to={item.to} hash={item.hash}>{item.label}</Link>
            ))}
            <Link to="/play">Play &amp; Rewards</Link>
            <Link to="/franchise">Franchises</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/track">Track</Link>
          </nav>
        ) : null}

        <div className="md-header-actions">
          {context ?? (
            <>
              <Link to="/luton" className="md-header-location"><MapPin /> Luton</Link>
              <Link to="/order" className="md-btn md-btn-yellow">Coming soon <ArrowRight /></Link>
            </>
          )}
          {nav ? (
            <button
              type="button"
              className="md-mobile-menu-button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X /> : <Menu />}
            </button>
          ) : null}
        </div>
      </div>

      {nav && open ? (
        <nav className="md-mobile-nav" aria-label="Mobile navigation">
          <Link to="/" onClick={() => setOpen(false)}>Home</Link>
          {navItems.map((item) => (
            <Link key={item.label} to={item.to} hash={item.hash} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
          <Link to="/luton" onClick={() => setOpen(false)}>Luton</Link>
          <Link to="/st-albans" onClick={() => setOpen(false)}>St Albans</Link>
          <Link to="/play" onClick={() => setOpen(false)}>Play &amp; Rewards</Link>
          <Link to="/franchise" onClick={() => setOpen(false)}>Franchises</Link>
          <Link to="/blog" onClick={() => setOpen(false)}>Blog</Link>
          <Link to="/track" onClick={() => setOpen(false)}>Track order</Link>
          <Link to="/order" className="md-btn md-btn-yellow" onClick={() => setOpen(false)}>Coming soon <ArrowRight /></Link>
        </nav>
      ) : null}
    </header>
  );
}
