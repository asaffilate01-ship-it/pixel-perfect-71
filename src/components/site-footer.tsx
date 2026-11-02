import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Music2, Youtube } from "lucide-react";
import mealDeckLogo from "@/assets/mealdeck-main-logo.png.asset.json";
import deliverooLogo from "@/assets/deliveroo-app.png.asset.json";
import uberEatsLogo from "@/assets/ubereats-app.png.asset.json";
import justEatLogo from "@/assets/justeat-app.png.asset.json";

export function SiteFooter() {
  return (
    <footer className="md-site-footer">
      <div className="md-footer-main">
        <div className="md-footer-brand">
          <img src={mealDeckLogo.url} alt="MealDeck" />
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
            <Link to="/play">Play &amp; Rewards</Link>
            <Link to="/franchise">Franchises</Link>
            <Link to="/ops">Staff sign-in</Link>
          </div>
          <div>
            <h3>Locations</h3>
            <Link to="/luton">Luton</Link>
            <Link to="/st-albans">St Albans</Link>
            <Link to="/order">Coming soon · Menu preview</Link>
          </div>
          <div>
            <h3>Luton collection</h3>
            <p>314–318 Selbourne Road</p>
            <p>Luton · LU4 8NU</p>
            <p>MealDeck ordering coming soon.</p>
          </div>
        </div>
      </div>

      <div className="md-footer-apps">
        <p className="md-footer-apps-copy">
          <strong>MealDeck is coming soon.</strong> Registration, ordering, payments and purchase rewards are not open yet. Browse the brands and play our free games.
        </p>
        <div className="md-footer-apps-row" aria-label="Ordering channels and social links">
          <div className="md-footer-social" aria-label="Social links">
            <a href="https://www.instagram.com/mealdeckofficial/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><Instagram /></a>
            <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><Facebook /></a>
            <a href="https://www.tiktok.com/@mealdeckofficial" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><Music2 /></a>
            <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><Youtube /></a>
          </div>
          <span className="md-footer-apps-divider" aria-hidden="true" />
          <div className="md-footer-apps-logos">
            <div className="md-app-logo" aria-label="Deliveroo platform website — coming soon">
              <img src={deliverooLogo.url} alt="Deliveroo" />
            </div>
            <div className="md-app-logo" aria-label="Uber Eats platform website — coming soon">
              <img src={uberEatsLogo.url} alt="Uber Eats" />
            </div>
            <div className="md-app-logo" aria-label="Just Eat platform website — coming soon">
              <img src={justEatLogo.url} alt="Just Eat" />
            </div>
          </div>
        </div>
      </div>

      <div className="md-footer-bottom">
        <span>© {new Date().getFullYear()} MealDeck.</span>
        <span>Good food brings people together.</span>
      </div>
    </footer>
  );
}

