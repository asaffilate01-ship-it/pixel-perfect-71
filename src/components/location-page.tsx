import { Link } from "@tanstack/react-router";
import { ArrowRight, Bike, Clock3, MapPin, Package, Store } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useOwnDriverAvailability } from "@/components/own-driver-offer-banner";
import { BrandLogoGrid } from "@/components/marketing/brand-logo-grid";
import { LocalMenuDiscovery } from "@/components/marketing/local-menu-discovery";
import { marketingBrands, cafe1Brand } from "@/lib/marketing-brands";
import { getLaunchMenuBrand } from "@/lib/launch-menu-catalogue";
import cafe1Logo from "@/assets/cafe1-logo.png";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import heroLuton from "@/assets/hero-luton.jpg";
import heroStAlbans from "@/assets/hero-stalbans.jpg";
import heroTable from "@/assets/hero-table.jpg";
import { MEALDECK_BUSINESS } from "@/lib/business-identity";

type Props = {
  town: string;
  intro: string;
  hours: string;
  fulfilment: string;
  areas: string[];
  includeCafe1: boolean;
  faqs: { q: string; a: string }[];
};

export function LocationPage({ town, intro, hours, fulfilment, areas, includeCafe1, faqs }: Props) {
  const isLuton = town.toLowerCase() === "luton";
  const deliveryLive = useOwnDriverAvailability() && isLuton;
  const isStAlbans = town.toLowerCase() === "st albans";
  const heroImage = isLuton ? heroLuton : isStAlbans ? heroStAlbans : heroTable;
  const displayedBrands = isLuton
    ? marketingBrands.filter((brand) => !!getLaunchMenuBrand(brand.id))
    : includeCafe1
      ? [...marketingBrands, cafe1Brand]
      : marketingBrands;

  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main>
        <section
          className="md-location-hero"
          style={{ ["--md-location-hero-img" as string]: `url(${heroImage})` }}
        >
          <div className="md-location-hero-shade" aria-hidden="true" />
          <div>
            <p className="md-kicker">
              MealDeck {town} · {isLuton ? "Our first launch kitchen" : "Coming soon"}
            </p>
            <h1>
              {isLuton ? "Food in Luton." : "Different cuisines."}
              <br />
              <span>{isLuton ? "Every craving." : `One ${town} order.`}</span>
            </h1>
            <p>{intro}</p>
            <div className="md-location-meta">
              <span>
                <Clock3 /> {isLuton ? "Opening weekend:" : "Planned hours:"} {hours}
              </span>
              <span>
                <Bike />{" "}
                {deliveryLive ? "Collection · Kerbside · Free own-driver delivery" : fulfilment}
              </span>
            </div>
            <div className="md-hero-actions">
              <Link to="/menus" className="md-btn md-btn-yellow">
                {isLuton ? "Browse Luton’s launch menus" : "Preview the Luton launch deck"}{" "}
                <ArrowRight />
              </Link>
              <Link to="/" hash="brands" className="md-btn md-btn-outline-light">
                See the full brand deck
              </Link>
            </div>
          </div>
          <div className="md-location-hero-card">
            <span className="md-location-card-corner md-location-card-corner-tl">
              {town[0]}
              <i>♦</i>
            </span>
            <span className="md-location-card-corner md-location-card-corner-br">
              {town[0]}
              <i>♦</i>
            </span>
            <MealDeckLogo decorative className="md-location-card-emblem" />
            <strong>{town}</strong>
            <span>{MEALDECK_BUSINESS.tagline}</span>
          </div>
        </section>

        <section className="md-section md-section-cream">
          <div className="md-section-heading md-section-heading-split">
            <div>
              <p className="md-kicker md-kicker-red">
                {isLuton ? "The Luton launch deck" : "The future MealDeck collection"}
              </p>
              <h2>{isLuton ? "Five brands. One kitchen." : "More flavours to come."}</h2>
              <p>
                {isLuton
                  ? `Order Skorch smash burgers, Tavo chicken wings and tenders, Souvano Greek and Turkish food, Load’d loaded fries and mac and cheese, and Moktl mocktails for Luton ${deliveryLive ? "free delivery, collection or kerbside" : "collection or kerbside"}. More brands join a future deck.`
                  : `Luton launches first. The ${town} line-up and opening date will be confirmed separately; this is the wider brand collection.`}
              </p>
            </div>
          </div>
          {isLuton ? <LocalMenuDiscovery /> : null}
          <BrandLogoGrid brands={displayedBrands} />

          {includeCafe1 ? (
            <div className="md-cafe1-callout">
              <img src={cafe1Logo} alt="Café1" />
              <div>
                <p className="md-kicker md-kicker-red">A future St Albans deck</p>
                <h3>Café1 classics, planned for later.</h3>
                <p>
                  The St Albans MealDeck launch will be confirmed separately. Café1’s own counter
                  and dine-in services remain independent.
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="md-location-info-grid">
          <article className="md-location-info-panel md-location-info-panel-dark">
            <MapPin />
            <p className="md-kicker">{isLuton ? "Collection location" : "Planned service areas"}</p>
            <h2>Local first.</h2>
            <p>
              {deliveryLive
                ? "Collection and kerbside at 314–318 Selbourne Road · Free delivery within 3 km of LU4 8NU on £15+ after discounts"
                : areas.join(" · ")}
            </p>
          </article>
          <article className="md-location-info-panel md-location-info-panel-red">
            <Store />
            <p className="md-kicker md-kicker-light">{isLuton ? "Order online" : "Coming soon"}</p>
            <h2>{deliveryLive ? "Collection · Kerbside · Free delivery" : fulfilment}</h2>
            <p>
              {isLuton
                ? deliveryLive
                  ? "Order from the five Luton menus for free local delivery, collection or kerbside. Our own driver delivers within a 3 km radius of LU4 8NU, for orders of £15 or more after discounts, normally within 60 minutes. Guest ordering needs only a name and WhatsApp number, with no registration."
                  : "Order from the five Luton menus for collection or kerbside during kitchen opening hours. Guest ordering is available with your name and WhatsApp number; no account is required."
                : `${town} is coming in a future deck. MealDeck is launching in Luton first, with no orders accepted here yet.`}
            </p>
          </article>
        </section>

        {isLuton ? (
          <section className="md-collection-location">
            <div>
              <p className="md-kicker md-kicker-light">
                Luton · Walk-in pickup / kerbside collection
              </p>
              <h2>314–318 Selbourne Road, Luton, LU4 8NU</h2>
              <p>
                {deliveryLive
                  ? "Due to popular demand: free delivery within 3 km of LU4 8NU, for orders of £15 or more after discounts. Our own driver brings food within an estimated hour of payment. Collection and kerbside remain available."
                  : "Collection and kerbside pickup are available during kitchen opening hours. Check your order and choose cutlery or numbered bags before payment."}
              </p>
            </div>
            <div className="md-collection-icons">
              <span>
                <Package /> Pickup
              </span>
              <span>
                <MapPin /> Kerbside
              </span>
              {deliveryLive && (
                <span>
                  <Bike /> Free delivery · 3 km
                </span>
              )}
            </div>
          </section>
        ) : isStAlbans ? (
          <section className="md-collection-location">
            <div>
              <p className="md-kicker md-kicker-light">St Albans</p>
              <h2>Café1 · St Albans Crown Court, 6 Bricket Road, St Albans, AL1 3JU</h2>
              <p>
                St Albans is a future MealDeck location, planned for delivery only. Luton launches
                first. Café1’s own counter and dine-in services are separate; MealDeck orders are
                not being accepted here.
              </p>
            </div>
            <div className="md-collection-icons">
              <span>
                <Bike /> MealDeck delivery coming soon
              </span>
            </div>
          </section>
        ) : null}

        <section className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">{town} FAQs</p>
            <h2>Useful before you order.</h2>
          </div>
          <div className="md-faq-list">
            {faqs.map((faq) => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
