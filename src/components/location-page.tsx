import { Link } from "@tanstack/react-router";
import { ArrowRight, Bike, Clock3, MapPin, Package, Store } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BrandLogoGrid } from "@/components/marketing/brand-logo-grid";
import { marketingBrands, cafe1Brand } from "@/lib/marketing-brands";
import { getLaunchMenuBrand } from "@/lib/launch-menu-catalogue";
import cafe1Logo from "@/assets/cafe1-logo.png";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import heroLuton from "@/assets/hero-luton.jpg";
import heroStAlbans from "@/assets/hero-stalbans.jpg";
import heroTable from "@/assets/hero-table.jpg";

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
  const isStAlbans = town.toLowerCase() === "st albans";
  const heroImage = isLuton ? heroLuton : isStAlbans ? heroStAlbans : heroTable;
  const displayedBrands = isLuton
    ? marketingBrands.filter((brand) => !!getLaunchMenuBrand(brand.id))
    : includeCafe1 ? [...marketingBrands, cafe1Brand] : marketingBrands;

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
            <p className="md-kicker">MealDeck {town} · {isLuton ? "Our first launch kitchen" : "Coming soon"}</p>
            <h1>Different cuisines.<br /><span>One {town} order.</span></h1>
            <p>{intro}</p>
            <div className="md-location-meta">
              <span><Clock3 /> Planned hours: {hours}</span>
              <span><Bike /> {fulfilment}</span>
            </div>
            <div className="md-hero-actions">
              <Link to="/menus" className="md-btn md-btn-yellow">{isLuton ? "Browse Luton’s launch menus" : "Preview the Luton launch deck"} <ArrowRight /></Link>
              <Link to="/" hash="brands" className="md-btn md-btn-outline-light">See the full brand deck</Link>
            </div>
          </div>
          <div className="md-location-hero-card">
            <span className="md-location-card-corner md-location-card-corner-tl">{town[0]}<i>♦</i></span>
            <span className="md-location-card-corner md-location-card-corner-br">{town[0]}<i>♦</i></span>
            <MealDeckLogo decorative className="md-location-card-emblem" />
            <strong>{town}</strong>
            <span>One Order. Every Craving.</span>
          </div>
        </section>

        <section className="md-section md-section-cream">
          <div className="md-section-heading md-section-heading-split">
            <div>
              <p className="md-kicker md-kicker-red">{isLuton ? "The Luton launch deck" : "The future MealDeck collection"}</p>
              <h2>{isLuton ? "Five brands. One kitchen." : "More flavours to come."}</h2>
              <p>{isLuton
                ? "Skorch, Tavo Chicken, Souvano, Load’d and Moktl launch in Luton first. Ordering is coming soon; more brands join a future deck."
                : `Luton launches first. The ${town} line-up and opening date will be confirmed separately; this is the wider brand collection.`}</p>
            </div>
          </div>
          <BrandLogoGrid brands={displayedBrands} />

          {includeCafe1 ? (
            <div className="md-cafe1-callout">
              <img src={cafe1Logo} alt="Café1" />
              <div>
                <p className="md-kicker md-kicker-red">A future St Albans deck</p>
                <h3>Café1 classics, planned for later.</h3>
                <p>The St Albans MealDeck launch will be confirmed separately. Café1’s own counter and dine-in services remain independent.</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="md-location-info-grid">
          <article className="md-location-info-panel md-location-info-panel-dark">
            <MapPin />
            <p className="md-kicker">Planned service areas</p>
            <h2>Local first.</h2>
            <p>{areas.join(" · ")}</p>
          </article>
          <article className="md-location-info-panel md-location-info-panel-red">
            <Store />
            <p className="md-kicker md-kicker-light">Coming soon</p>
            <h2>{fulfilment}</h2>
            <p>{isLuton
              ? "Luton is the first launch kitchen. Ordering and registration are not open yet; browse the five launch menus now."
              : `${town} is coming in a future deck. MealDeck is launching in Luton first, with no orders accepted here yet.`}</p>
          </article>
        </section>

        {isLuton ? (
          <section className="md-collection-location">
            <div>
              <p className="md-kicker md-kicker-light">Luton · Walk-in pickup / kerbside collection</p>
              <h2>314–318 Selbourne Road, Luton, LU4 8NU</h2>
              <p>Pickup and kerbside collection are part of the Luton launch plan. Ordering is not open yet; collection details will be confirmed before launch.</p>
            </div>
            <div className="md-collection-icons">
              <span><Package /> Pickup</span>
              <span><MapPin /> Kerbside</span>
            </div>
          </section>
        ) : isStAlbans ? (
          <section className="md-collection-location">
            <div>
              <p className="md-kicker md-kicker-light">St Albans</p>
              <h2>Café1 · St Albans Crown Court, 6 Bricket Road, St Albans, AL1 3JU</h2>
              <p>St Albans is a future MealDeck location, planned for delivery only. Luton launches first. Café1’s own counter and dine-in services are separate; MealDeck orders are not being accepted here.</p>
            </div>
            <div className="md-collection-icons">
              <span><Bike /> MealDeck delivery coming soon</span>
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

