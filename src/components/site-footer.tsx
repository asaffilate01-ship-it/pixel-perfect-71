import { Link } from "@tanstack/react-router";
import { Instagram, Music2 } from "lucide-react";
import { WhatsAppOrderLink } from "@/components/whatsapp-order-link";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { MEALDECK_BUSINESS } from "@/lib/business-identity";
import { MEALDECK_LUTON_WEEKLY_HOURS } from "@/lib/mealdeck-launch-schedule";
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
          <strong>{MEALDECK_BUSINESS.tagline}</strong>
        </div>

        <div className="md-footer-links">
          <div>
            <h3>MealDeck</h3>
            <Link to="/" hash="brands">
              Brands
            </Link>
            <Link to="/offers">Offers</Link>
            <Link to="/account">My account &amp; preferences</Link>
            <Link to="/opening-offer">Opening weekend offer</Link>
            <Link to="/meta-ad">Your first order</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/" hash="how">
              How it works
            </Link>
            <Link to="/track">Track order · Coming soon</Link>
            <Link to="/play">Play &amp; Rewards</Link>
            <Link to="/franchise">Franchises</Link>
            <Link to="/ops">Staff sign-in</Link>
          </div>
          <div>
            <h3>Locations</h3>
            <Link to="/luton">Luton</Link>
            <Link to="/st-albans">St Albans · Coming soon</Link>
            <Link to="/bedford">Bedford · Coming soon</Link>
            <Link to="/menus">Order Now</Link>
          </div>
          <div>
            <h3>Luton collection</h3>
            <p>314–318 Selbourne Road</p>
            <p>Luton · LU4 8NU</p>
            <p>Opening hours</p>
            {MEALDECK_LUTON_WEEKLY_HOURS.map((row) => (
              <p key={row.shortDays}>
                {row.shortDays} · {row.hoursLabel}
              </p>
            ))}
            <p>All times are UK local time.</p>
            <p>Order online for collection or kerbside during opening hours.</p>
            <p>Delivery · Coming soon</p>
            <WhatsAppOrderLink className="md-whatsapp-soon" />
          </div>
        </div>
      </div>

      <div className="md-footer-apps">
        <p className="md-footer-apps-copy">
          <strong>Luton launches first.</strong> Verified members earn loyalty points on eligible
          paid orders; guest orders earn none. <Link to="/account">See member benefits</Link>.
          Offer emails and app alerts are optional, separate choices.
        </p>
        <div className="md-footer-apps-row" aria-label="Ordering channels and social links">
          <div className="md-footer-social" aria-label="Social links">
            <span>{MEALDECK_BUSINESS.socialHandle}</span>
            <a
              href={`https://www.instagram.com/${MEALDECK_BUSINESS.socialHandle.slice(1)}/`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`MealDeck ${MEALDECK_BUSINESS.socialHandle} on Instagram`}
            >
              <Instagram />
            </a>
            <a
              href={`https://www.tiktok.com/${MEALDECK_BUSINESS.socialHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`MealDeck ${MEALDECK_BUSINESS.socialHandle} on TikTok`}
            >
              <Music2 />
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
