import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Music2, Youtube } from "lucide-react";
import mealDeckLogo from "@/assets/mealdeck-card-logo.png";

export function SiteFooter() {
  return (
    <footer className="md-site-footer">
      <div className="md-footer-main">
        <div className="md-footer-brand">
          <img src={mealDeckLogo} alt="MealDeck" />
          <p>Different cuisines. One basket. One delivery fee.</p>
          <strong>One Order. Every Craving.</strong>
        </div>

        <div className="md-footer-links">
          <div>
            <h3>MealDeck</h3>
            <Link to="/" hash="brands">Brands</Link>
            <Link to="/" hash="offers">Offers</Link>
            <Link to="/" hash="how">How it works</Link>
            <Link to="/track">Track order</Link>
          </div>
          <div>
            <h3>Locations</h3>
            <Link to="/luton">Luton</Link>
            <Link to="/st-albans">St Albans</Link>
            <Link to="/order">Order direct</Link>
          </div>
          <div>
            <h3>Luton collection</h3>
            <p>314–318 Selbourne Road</p>
            <p>Luton · LU4 8NU</p>
            <p>Please bring your order reference.</p>
          </div>
        </div>

        <div className="md-footer-social" aria-label="Social links">
          <Instagram />
          <Facebook />
          <Music2 />
          <Youtube />
        </div>
      </div>
      <div className="md-footer-bottom">
        <span>© {new Date().getFullYear()} MealDeck.</span>
        <span>Good food brings people together.</span>
      </div>
    </footer>
  );
}
