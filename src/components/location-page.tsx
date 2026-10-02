import { Link } from "@tanstack/react-router";
import { ArrowRight, Bike, Clock3, MapPin, Package, Store, UtensilsCrossed } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BrandLogoGrid } from "@/components/marketing/brand-logo-grid";
import { marketingBrands, cafe1Brand } from "@/lib/marketing-brands";
import cafe1Logo from "@/assets/cafe1-logo.png";
import backEmblem from "@/assets/mealdeck-back-emblem.png";

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

  return (
    <div className="md-marketing-shell">
      <SiteHeader />
      <main>
        <section className="md-location-hero">
          <div>
            <p className="md-kicker">MealDeck {town}</p>
            <h1>Different cuisines.<br /><span>One {town} order.</span></h1>
            <p>{intro}</p>
            <div className="md-location-meta">
              <span><Clock3 /> {hours}</span>
              <span><Bike /> {fulfilment}</span>
            </div>
            <div className="md-hero-actions">
              <Link to="/order" className="md-btn md-btn-yellow">Order in {town} <ArrowRight /></Link>
              <Link to="/" hash="brands" className="md-btn md-btn-outline-light">See the full brand deck</Link>
            </div>
          </div>
          <div className="md-location-hero-card">
            <span className="md-location-card-corner md-location-card-corner-tl">{town[0]}<i>♦</i></span>
            <span className="md-location-card-corner md-location-card-corner-br">{town[0]}<i>♦</i></span>
            <img src={backEmblem} alt="" className="md-location-card-emblem" />
            <strong>{town}</strong>
            <span>One Order. Every Craving.</span>
          </div>
        </section>

        <section className="md-section md-section-cream">
          <div className="md-section-heading md-section-heading-split">
            <div>
              <p className="md-kicker md-kicker-red">The {town} deck</p>
              <h2>Pick your flavours.</h2>
              <p>Marketing brand collection shown independently of menu availability.</p>
            </div>
          </div>
          <BrandLogoGrid brands={includeCafe1 ? [...marketingBrands, cafe1Brand] : marketingBrands} />

          {includeCafe1 ? (
            <div className="md-cafe1-callout">
              <img src={cafe1Logo} alt="Café1" />
              <div>
                <p className="md-kicker md-kicker-red">St Albans exclusive</p>
                <h3>Café1 classics join the MealDeck hand.</h3>
                <p>Breakfast, lunch and café favourites alongside the MealDeck collection.</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="md-location-info-grid">
          <article className="md-location-info-panel md-location-info-panel-dark">
            <MapPin />
            <p className="md-kicker">Areas we serve</p>
            <h2>Local first.</h2>
            <p>{areas.join(" · ")}</p>
          </article>
          <article className="md-location-info-panel md-location-info-panel-red">
            <Store />
            <p className="md-kicker md-kicker-light">Ways to order</p>
            <h2>{fulfilment}</h2>
            <p>Choose your fulfilment method when you start your MealDeck order.</p>
          </article>
        </section>

        {isLuton ? (
          <section className="md-collection-location">
            <div>
              <p className="md-kicker md-kicker-light">Pickup / kerbside collection</p>
              <h2>314–318 Selbourne Road, Luton, LU4 8NU</h2>
              <p>Please bring your order reference.</p>
            </div>
            <div className="md-collection-icons">
              <span><Package /> Pickup</span>
              <span><MapPin /> Kerbside</span>
            </div>
          </section>
        ) : (
          <section className="md-collection-location">
            <div>
              <p className="md-kicker md-kicker-light">St Albans</p>
              <h2>Café1 · St Albans Crown Court, 6 Bricket Road, St Albans, AL1 3JU</h2>
              <p>Delivery, pickup, kerbside and dine-in options can be presented here.</p>
            </div>
            <div className="md-collection-icons">
              <span><UtensilsCrossed /> Dine in</span>
              <span><Package /> Pickup</span>
            </div>
          </section>
        )}

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
