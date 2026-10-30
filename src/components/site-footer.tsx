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
          </div>
          <div>
            <h3>Locations</h3>
            <Link to="/luton">Luton</Link>
            <Link to="/st-albans">St Albans</Link>
            <Link to="/bedford">Bedford</Link>
            <Link to="/order">Coming soon</Link>
          </div>
          <div>
            <h3>Luton collection</h3>
            <p>314–318 Selbourne Road</p>
            <p>Luton · LU4 8NU</p>
            <p>Please bring your order reference.</p>
          </div>
        </div>
      </div>

      <div className="md-footer-apps">
        <p className="md-footer-apps-copy">
          <strong>Prefer the big apps?</strong> We're on{" "}
          <a href="https://deliveroo.co.uk" target="_blank" rel="noopener noreferrer">Deliveroo</a>,{" "}
          <a href="https://www.ubereats.com" target="_blank" rel="noopener noreferrer">Uber Eats</a> &{" "}
          <a href="https://www.just-eat.co.uk" target="_blank" rel="noopener noreferrer">Just Eat</a> — but ordering direct
          costs you less, and our offers &amp; loyalty points aren't available through them.
        </p>
        <div className="md-footer-apps-row" aria-label="Ordering channels and social links">
          <div className="md-footer-social" aria-label="Social links">
            <a href="https://www.instagram.com/mealdeckofficial" target="_blank" rel="noopener noreferrer" aria-label="MealDeck on Instagram"><Instagram /></a>
            <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><Facebook /></a>
            <a href="https://www.tiktok.com/@mealdeckofficial" target="_blank" rel="noopener noreferrer" aria-label="MealDeck on TikTok"><Music2 /></a>
            <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><Youtube /></a>
          </div>
          <span className="md-footer-apps-divider" aria-hidden="true" />
          <div className="md-footer-apps-logos">
            <a className="md-app-logo" href="https://deliveroo.co.uk" target="_blank" rel="noopener noreferrer" aria-label="Order MealDeck on Deliveroo">
              <img src={deliverooLogo.url} alt="Deliveroo" />
            </a>
            <a className="md-app-logo" href="https://www.ubereats.com" target="_blank" rel="noopener noreferrer" aria-label="Order MealDeck on Uber Eats">
              <img src={uberEatsLogo.url} alt="Uber Eats" />
            </a>
            <a className="md-app-logo" href="https://www.just-eat.co.uk" target="_blank" rel="noopener noreferrer" aria-label="Order MealDeck on Just Eat">
              <img src={justEatLogo.url} alt="Just Eat" />
            </a>
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
