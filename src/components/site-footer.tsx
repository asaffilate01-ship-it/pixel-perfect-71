import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, MessageCircle, Music2, Youtube } from "lucide-react";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { MEALDECK_BUSINESS } from "@/lib/business-identity";
import { MEALDECK_LAUNCH_DAYS } from "@/lib/mealdeck-launch-schedule";
import deliverooLogo from "@/assets/deliveroo-app.png.asset.json";
import uberEatsLogo from "@/assets/ubereats-app.png.asset.json";
import justEatLogo from "@/assets/justeat-app.png.asset.json";

export function SiteFooter() {
  return (
    <footer className="md-site-footer">
      <div className="md-footer-main">
        <div className="md-footer-brand">
          <MealDeckLogo loading="lazy" />
          <p>Different cuisines. One basket. One collection.</p>
          <strong>One Order. Every Craving.</strong>
        </div>

        <div className="md-footer-links">
          <div>
            <h3>MealDeck</h3>
            <Link to="/" hash="brands">
              Brands
            </Link>
            <Link to="/" hash="offers">
              Offers
            </Link>
            <Link to="/account">My account &amp; preferences</Link>
            <Link to="/opening-offer">Opening weekend offer</Link>
            <Link to="/meta-ad">Your first order</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/" hash="how">
              How it works
            </Link>
            <Link to="/track">Track order</Link>
            <Link to="/play">Play &amp; Rewards</Link>
            <Link to="/franchise">Franchises</Link>
            <Link to="/ops">Staff sign-in</Link>
          </div>
          <div>
            <h3>Locations</h3>
            <Link to="/luton">Luton</Link>
            <Link to="/st-albans">St Albans · Coming soon</Link>
            <Link to="/bedford">Bedford · Coming soon</Link>
            <Link to="/menus">Browse menus</Link>
          </div>
          <div>
            <h3>Luton collection</h3>
            <p>314–318 Selbourne Road</p>
            <p>Luton · LU4 8NU</p>
            <p>Opening weekend · 6–8 November 2026</p>
            {MEALDECK_LAUNCH_DAYS.map((day) => (
              <p key={day.date}>
                <time dateTime={day.date}>{day.shortLabel}</time> · {day.hoursLabel}
              </p>
            ))}
            <p>All times are UK local time.</p>
            <p>MealDeck ordering coming soon.</p>
            <p className="md-whatsapp-soon">
              <MessageCircle size={16} aria-hidden="true" /> WhatsApp ordering — coming soon
            </p>
          </div>
        </div>
      </div>

      <div className="md-footer-apps">
        <p className="md-footer-apps-copy">
          <strong>Luton launches first.</strong> Order as a guest during our opening hours on 6–8
          November, with no loyalty points on guest orders. Register for member offers and choose
          whether to receive offer emails and app alerts. Loyalty earning is coming soon.
        </p>
        <div className="md-footer-apps-row" aria-label="Ordering channels and social links">
          <div className="md-footer-social" aria-label="Social links">
            <a
              href="https://www.instagram.com/mealdeckofficial/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="MealDeck on Instagram"
            >
              <Instagram />
            </a>
            <a
              href="https://www.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
            >
              <Facebook />
            </a>
            <a
              href="https://www.tiktok.com/@mealdeckofficial"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="MealDeck on TikTok"
            >
              <Music2 />
            </a>
            <a
              href="https://www.youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
            >
              <Youtube />
            </a>
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
        <span>
          © {new Date().getFullYear()} {MEALDECK_BUSINESS.legalName}.
        </span>
        <span>{MEALDECK_BUSINESS.tradingStatement}</span>
        <span>{MEALDECK_BUSINESS.technologyCredit}</span>
      </div>
    </footer>
  );
}
