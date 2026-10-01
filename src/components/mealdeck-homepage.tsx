import { useState, useRef, type CSSProperties, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Coffee,
  Flame,
  Gift,
  Layers3,
  Leaf,
  MapPin,
  Menu,
  ShoppingBag,
  Sparkles,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PromoPreview } from "@/components/promo-preview";
import {
  brands,
  formatPence,
  locations,
  sampleMenu,
  type Brand,
  type LocationKey,
} from "@/lib/mealdeck";
import { featuredOffers, promoOffers, type OfferCategory, type PromoOffer } from "@/lib/promotions";

const brandOrder = [
  "paratique",
  "taconelle",
  "tavo-chicken",
  "fyrra",
  "skorch-burgers",
  "tarka-box",
  "loadd",
  "sabzora",
  "icova",
  "vyta",
  "moktl",
  "cafe1",
];
const drinkIds = ["icova", "vyta", "moktl"];
const brandNames: Record<string, string> = {
  "tarka-box": "TarkaBox",
  loadd: "Load’d Fries",
  cafe1: "Café 1",
};
const brandCategories: Record<string, string> = {
  vyta: "Fresh bowls & drinks",
  icova: "Iced coffee & chai",
  moktl: "Alcohol-free mocktails",
  "tarka-box": "Indian comfort food",
  fyrra: "Flame-grilled favourites",
};
const brandAccents: Record<string, string> = {
  paratique: "oklch(0.63 0.14 67)",
  taconelle: "oklch(0.56 0.2 29)",
  "tavo-chicken": "oklch(0.61 0.19 42)",
  fyrra: "oklch(0.35 0.04 37)",
  icova: "oklch(0.48 0.1 48)",
  vyta: "oklch(0.45 0.13 146)",
  moktl: "oklch(0.48 0.18 352)",
};
const brandLabel = (brand: Brand) => brandNames[brand.id] ?? brand.name;
const navigation = [
  { label: "Our brands", href: "#brands" },
  { label: "The offers deck", href: "#offers" },
  { label: "How it works", href: "#how-it-works" },
];
const offerCategories: { id: OfferCategory | "all"; label: string }[] = [
  { id: "all", label: "The whole deck" },
  { id: "bundles", label: "Everyday combinations" },
  { id: "sharing", label: "Better together" },
  { id: "rewards", label: "A little extra" },
];

function OfferCard({
  offer,
  onSelect,
  compact = false,
}: {
  offer: PromoOffer;
  onSelect: (offer: PromoOffer) => void;
  compact?: boolean;
}) {
  const brand = brands.find((item) => item.id === offer.imageBrandId);
  const Icon = offer.id === "house-offer" ? Coffee : offer.id === "snap" ? Users : Layers3;
  return (
    <article className={`md-offer-card md-offer-${offer.id}${compact ? " md-offer-compact" : ""}`}>
      <div className="md-offer-top">
        <span>
          <Icon size={17} aria-hidden="true" /> {offer.name}
        </span>
        <span className="md-card-index" aria-hidden="true">
          M
        </span>
      </div>
      <h3>{offer.headline}</h3>
      <p>{offer.description}</p>
      {!compact && brand && (
        <img
          src={brand.image}
          alt=""
          loading="lazy"
          width={816}
          height={816}
          className="md-offer-food"
        />
      )}
      <div className="md-offer-bottom">
        <span className="md-limit">
          {formatPence(offer.minimumPence).replace(".00", "")} minimum
          {offer.maximumSavingPence !== undefined &&
            ` · Save up to ${formatPence(offer.maximumSavingPence).replace(".00", "")}`}
        </span>
        <button type="button" className="md-button md-button-red" onClick={() => onSelect(offer)}>
          {offer.id === "build-your-deck" ? "Try your combination" : "Explore this offer"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function MealDeckHomepage() {
  const openerRef = useRef<HTMLElement | null>(null);
  function rememberOpener() {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  function restoreOpener(event: Event) {
    event.preventDefault();
    openerRef.current?.focus();
  }
  function openLocation() {
    rememberOpener();
    setLocationOpen(true);
  }
  function openBrand(brand: Brand) {
    rememberOpener();
    setSelectedBrand(brand);
  }
  function openOffer(offer: PromoOffer | null) {
    rememberOpener();
    setSelectedOffer(offer);
  }
  const [mobileMenu, setMobileMenu] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationKey, setLocationKey] = useState<LocationKey | null>(null);
  const [postcode, setPostcode] = useState("");
  const [postcodeError, setPostcodeError] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<PromoOffer | null>(null);
  const [showCatalogue, setShowCatalogue] = useState(false);
  const [offerFilter, setOfferFilter] = useState<OfferCategory | "all">("all");
  const selectedLocation = locations.find((location) => location.key === locationKey);
  const visibleBrands = brandOrder.flatMap((id) => {
    const brand = brands.find((item) => item.id === id);
    if (!brand || (id === "cafe1" && locationKey !== "stalbans")) return [];
    if (brandFilter === "drinks" && !drinkIds.includes(id)) return [];
    if (brandFilter === "food" && drinkIds.includes(id)) return [];
    if (brandFilter === "vegetarian" && id !== "sabzora") return [];
    return [brand];
  });
  const catalogue = promoOffers.filter(
    (offer) => !offer.featured && (offerFilter === "all" || offer.category === offerFilter),
  );
  function previewPostcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = postcode.toUpperCase().replace(/\s/g, "");
    if (!/^(GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(normalized)) {
      setPostcodeError("Enter a full UK postcode, for example LU1 2AB.");
      return;
    }
    setPostcodeError("");
    const key = normalized.startsWith("LU")
      ? "luton"
      : normalized.startsWith("AL")
        ? "stalbans"
        : null;
    setLocationKey(key);
    setLocationMessage(
      key
        ? `Showing the ${key === "luton" ? "Luton" : "St Albans"} brand preview. Delivery availability will be confirmed when ordering opens.`
        : "Explore the full brand preview. Delivery availability for your postcode will be confirmed when ordering opens.",
    );
    document.getElementById("brands")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
  return (
    <div className="md-home">
      <a href="#main-content" className="md-skip">
        Skip to content
      </a>
      <div className="md-announcement">
        <Sparkles size={14} aria-hidden="true" />
        <span>Your next favourite is in the deck.</span>
        <span className="md-announcement-preview">A taste of what’s coming</span>
      </div>
      <header className="md-header">
        <div className="md-container md-header-inner">
          <a href="/" aria-label="MealDeck home" className="md-logo">
            <img
              src="/mealdeck-deck-logo.webp"
              alt="MealDeck — One order. Every craving."
              width={1254}
              height={1254}
            />
          </a>
          <nav aria-label="Main navigation" className="md-desktop-nav">
            {navigation.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="md-header-actions">
            <button type="button" className="md-location-button" onClick={openLocation}>
              <MapPin size={16} aria-hidden="true" />
              <span>{selectedLocation?.town ?? "Choose location"}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            <a href="#brands" className="md-button md-button-red md-header-browse">
              Explore the menu <ArrowRight size={16} aria-hidden="true" />
            </a>
            <button
              type="button"
              className="md-menu-toggle"
              aria-label={mobileMenu ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenu}
              aria-controls="md-mobile-nav"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              {mobileMenu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <nav id="md-mobile-nav" className="md-mobile-nav" aria-label="Mobile navigation">
            {navigation.map((item) => (
              <a href={item.href} key={item.href} onClick={() => setMobileMenu(false)}>
                {item.label}
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            ))}
          </nav>
        )}
      </header>
      <main id="main-content">
        <section className="md-hero" aria-labelledby="hero-title">
          <div className="md-container md-hero-layout">
            <div className="md-hero-copy">
              <span className="md-kicker md-kicker-light">
                <span aria-hidden="true" />
                MANY BRANDS. ONE VERY GOOD IDEA.
              </span>
              <h1 id="hero-title">
                One order.
                <br />
                <em>Every craving.</em>
              </h1>
              <p>
                Something loaded. Something grilled. Something over ice. Pick your favourites from
                across the deck.
              </p>
              <form className="md-postcode-form" onSubmit={previewPostcode} noValidate>
                <label htmlFor="md-postcode" className="sr-only">
                  Your UK postcode
                </label>
                <div>
                  <MapPin size={19} aria-hidden="true" />
                  <input
                    id="md-postcode"
                    name="postcode"
                    autoComplete="postal-code"
                    value={postcode}
                    onChange={(event) => {
                      setPostcode(event.target.value);
                      setPostcodeError("");
                    }}
                    placeholder="Enter your postcode"
                    aria-invalid={Boolean(postcodeError)}
                    aria-describedby={postcodeError ? "md-postcode-error" : "md-preview-status"}
                  />
                </div>
                <button className="md-button md-button-red" type="submit">
                  Explore the menu <ArrowRight size={17} aria-hidden="true" />
                </button>
              </form>
              {postcodeError && (
                <p id="md-postcode-error" className="md-form-error" role="alert">
                  {postcodeError}
                </p>
              )}
              <p id="md-preview-status" className="md-hero-note">
                <span />
                Menu preview · Online ordering coming soon
              </p>
              <a href="#offers" className="md-hero-link">
                Take a look at the offers deck <ArrowDown size={15} aria-hidden="true" />
              </a>
            </div>
            <div className="md-hero-art">
              <img
                src="/mealdeck-deck-hero.webp"
                alt="The MealDeck card reveals Paratique, Taconelle, Tavo Chicken, Fyrra, Icova, Vyta and Moktl food and drink cards."
                width={1536}
                height={1024}
                fetchPriority="high"
              />
              <span className="md-hero-sticker">
                GOOD FOOD.
                <br />
                GREAT COMPANY.
              </span>
            </div>
          </div>
          <div className="md-hero-bottom md-container">
            <span>
              <Layers3 size={17} aria-hidden="true" />
              Mix your favourite brands
            </span>
            <span>
              <ShoppingBag size={17} aria-hidden="true" />
              Bring it all into one basket
            </span>
            <span>
              <Users size={17} aria-hidden="true" />
              Every taste at the table
            </span>
          </div>
        </section>
        <section id="brands" className="md-section md-brands" aria-labelledby="brands-heading">
          <div className="md-container">
            <div className="md-section-heading">
              <div>
                <span className="md-kicker">A WHOLE DECK OF FLAVOUR</span>
                <h2 id="brands-heading">
                  Pick your deck<span>.</span>
                </h2>
                <p>Different favourites. Same order. What are you craving?</p>
              </div>
              <button type="button" className="md-text-button" onClick={openLocation}>
                <MapPin size={16} aria-hidden="true" />
                {selectedLocation ? `${selectedLocation.town} preview` : "Explore our locations"}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
            {locationMessage && (
              <p className="md-location-message" role="status">
                {locationMessage}
              </p>
            )}
            <div className="md-filter-row">
              <div className="md-filters" role="group" aria-label="Filter brands">
                {[
                  { id: "all", label: "The whole deck", icon: Layers3 },
                  { id: "food", label: "Something delicious", icon: Flame },
                  { id: "drinks", label: "Something refreshing", icon: Coffee },
                  { id: "vegetarian", label: "Vegetarian", icon: Leaf },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={brandFilter === id}
                    className={brandFilter === id ? "is-active" : ""}
                    onClick={() => setBrandFilter(id)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
              <span className="md-brand-count" aria-live="polite">
                {visibleBrands.length} decks to explore
              </span>
            </div>
            <div className="md-brand-grid">
              {visibleBrands.map((brand, index) => (
                <button
                  type="button"
                  className="md-brand-card"
                  key={brand.id}
                  onClick={() => openBrand(brand)}
                  style={
                    {
                      "--brand-accent": brandAccents[brand.id] ?? "oklch(0.46 0.17 25)",
                      "--card-tilt": `${index % 3 === 0 ? -1.3 : index % 3 === 1 ? 1.1 : -0.4}deg`,
                    } as CSSProperties
                  }
                  aria-label={`Explore ${brandLabel(brand)}`}
                >
                  <div className="md-brand-card-top">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <UtensilsCrossed size={14} aria-hidden="true" />
                  </div>
                  <h3>{brandLabel(brand)}</h3>
                  <p className="md-brand-category">{brandCategories[brand.id] ?? brand.category}</p>
                  <div className="md-brand-image">
                    <img src={brand.image} alt="" width={816} height={816} loading="lazy" />
                  </div>
                  <span className="md-brand-link">
                    Explore the menu <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
            <p className="md-section-footnote">
              Menus and images are a preview. Brand availability varies by location. Icova and Moktl
              can be added across the menu. Café 1 is part of the St Albans deck.
            </p>
          </div>
        </section>
        <section id="offers" className="md-section md-offers" aria-labelledby="offers-heading">
          <div className="md-container">
            <div className="md-section-heading">
              <div>
                <span className="md-kicker">A LITTLE EXTRA TO LOOK FORWARD TO</span>
                <h2 id="offers-heading">
                  Good food.
                  <br className="md-mobile-break" /> Great offers.
                </h2>
                <p>Your choice, your combination. Take a peek at what’s coming.</p>
              </div>
              <span className="md-status-pill">
                <Gift size={15} aria-hidden="true" />
                Offers preview
              </span>
            </div>
            <div className="md-featured-offers">
              {featuredOffers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} onSelect={openOffer} />
              ))}
            </div>
            <div className="md-offer-rules">
              <Check size={16} aria-hidden="true" />
              <span>One offer per order</span>
              <span>Once per customer per day</span>
              <span>Selected items only</span>
              <span>No offer stacking</span>
            </div>
            <p className="md-section-footnote">
              Proposed offers, not yet redeemable. Minimum spends exclude delivery, service fees and
              paid upgrades. Final items, dates and participating locations will be confirmed at
              launch.
            </p>
            <div className="md-catalogue-toggle">
              <button
                type="button"
                className="md-button md-button-outline"
                aria-expanded={showCatalogue}
                aria-controls="md-offer-catalogue"
                onClick={() => setShowCatalogue(!showCatalogue)}
              >
                {showCatalogue ? "Close the offers deck" : "Discover more offer ideas"}
                <ChevronDown
                  size={17}
                  className={showCatalogue ? "md-rotate" : ""}
                  aria-hidden="true"
                />
              </button>
            </div>
            {showCatalogue && (
              <div id="md-offer-catalogue" className="md-catalogue">
                <h3>There’s more in the deck.</h3>
                <p>
                  Family feasts, weekday favourites and little thank-yous. These are future offer
                  concepts, with full details on every card.
                </p>
                <div className="md-filters" role="group" aria-label="Filter offer ideas">
                  {offerCategories.map(({ id, label }) => (
                    <button
                      type="button"
                      key={id}
                      aria-pressed={offerFilter === id}
                      className={offerFilter === id ? "is-active" : ""}
                      onClick={() => setOfferFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="md-catalogue-grid">
                  {catalogue.map((offer) => (
                    <OfferCard compact key={offer.id} offer={offer} onSelect={openOffer} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
        <section id="how-it-works" className="md-section md-how" aria-labelledby="how-heading">
          <div className="md-container">
            <div className="md-section-heading">
              <div>
                <span className="md-kicker">THE IDEA IS SIMPLE</span>
                <h2 id="how-heading">
                  Different tastes.
                  <br />
                  One happy table.
                </h2>
              </div>
              <p className="md-how-intro">
                No more choosing between everyone’s favourites. MealDeck brings the brands together,
                so you can bring the people.
              </p>
            </div>
            <div className="md-steps">
              {[
                {
                  icon: MapPin,
                  title: "Find your kitchen",
                  text: "Choose your location to discover its collection of food and drink brands.",
                },
                {
                  icon: Layers3,
                  title: "Pick from the deck",
                  text: "Mix a paratha with fries, a French taco with a mocktail. Make it your own.",
                },
                {
                  icon: ShoppingBag,
                  title: "Bring it together",
                  text: "One basket across brands. Online ordering and checkout are coming soon.",
                },
              ].map(({ icon: Icon, title, text }, index) => (
                <article key={title}>
                  <span className="md-step-number">0{index + 1}</span>
                  <Icon size={28} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="md-sharing" aria-labelledby="sharing-heading">
          <div className="md-container md-sharing-inner">
            <div className="md-sharing-art" aria-hidden="true">
              <div>
                <Users size={37} />
                <span>YOUR PEOPLE.</span>
              </div>
              <div>
                <UtensilsCrossed size={37} />
                <span>THEIR FAVOURITES.</span>
              </div>
            </div>
            <div>
              <span className="md-kicker md-kicker-light">MAKE ROOM FOR EVERYONE</span>
              <h2 id="sharing-heading">
                Share the table.
                <br />
                Mix the deck.
              </h2>
              <p>
                Lunch with the team. A night in with friends. A family with four very different
                cravings.
              </p>
              <button
                type="button"
                className="md-button md-button-cream"
                onClick={() =>
                  openOffer(promoOffers.find((offer) => offer.id === "share-the-deck") ?? null)
                }
              >
                Explore group-order offers <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      </main>
      <footer className="md-footer">
        <div className="md-container">
          <div className="md-footer-top">
            <a href="/" className="md-logo" aria-label="MealDeck home">
              <img
                src="/mealdeck-deck-logo.webp"
                alt="MealDeck"
                width={1254}
                height={1254}
                loading="lazy"
              />
            </a>
            <p>
              Many brands.
              <br />
              <strong>One very good order.</strong>
            </p>
            <nav aria-label="Footer navigation">
              {navigation.map((item) => (
                <a href={item.href} key={item.href}>
                  {item.label}
                </a>
              ))}
              <button type="button" onClick={openLocation}>
                Our locations
              </button>
            </nav>
          </div>
          <div className="md-footer-bottom">
            <span>© {new Date().getFullYear()} MealDeck · 313 Brands Ltd</span>
            <span>One order. Every craving.</span>
            <span>Online ordering coming soon</span>
          </div>
        </div>
      </footer>
      <PromoPreview
        offer={selectedOffer}
        onCloseAutoFocus={restoreOpener}
        onClose={() => setSelectedOffer(null)}
      />
      <Dialog
        open={selectedBrand !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedBrand(null);
        }}
      >
        <DialogContent className="md-modal md-brand-modal" onCloseAutoFocus={restoreOpener}>
          {selectedBrand && (
            <>
              <span className="md-kicker">YOUR BRAND CARD · MENU PREVIEW</span>
              <DialogTitle className="md-modal-title">{brandLabel(selectedBrand)}</DialogTitle>
              <DialogDescription className="md-modal-description">
                {selectedBrand.tagline}
              </DialogDescription>
              <img
                className="md-brand-modal-image"
                src={selectedBrand.image}
                alt={`${brandLabel(selectedBrand)} food inspiration`}
                width={816}
                height={816}
              />
              <div className="md-sample-menu">
                {sampleMenu(locationKey ?? "luton")
                  .filter((item) => item.brandId === selectedBrand.id)
                  .map((item) => (
                    <article key={item.id}>
                      <div>
                        <h3>{item.name}</h3>
                        <p>{item.description}</p>
                      </div>
                      <span>{formatPence(item.pricePence)}</span>
                    </article>
                  ))}
              </div>
              <p className="md-preview-note">
                Illustrative menu and prices. Final dishes, ingredients, allergen information and
                availability will be confirmed when ordering opens. No orders or payments are taken
                in this preview.
              </p>
              <button
                type="button"
                className="md-button md-button-red"
                onClick={() => setSelectedBrand(null)}
              >
                Keep exploring <ArrowRight size={17} aria-hidden="true" />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent className="md-modal" onCloseAutoFocus={restoreOpener}>
          <span className="md-kicker">FIND YOUR DECK</span>
          <DialogTitle className="md-modal-title">A taste of your town.</DialogTitle>
          <DialogDescription className="md-modal-description">
            Choose a location to explore its brand preview. Live delivery areas and ordering will be
            confirmed at launch.
          </DialogDescription>
          <div className="md-location-options">
            {locations.map((location) => (
              <button
                type="button"
                key={location.key}
                onClick={() => {
                  setLocationKey(location.key);
                  setLocationMessage(
                    `Showing the ${location.town} brand preview. Online ordering is coming soon.`,
                  );
                  setLocationOpen(false);
                }}
              >
                <MapPin size={22} aria-hidden="true" />
                <span>
                  <strong>{location.town}</strong>
                  <small>
                    {location.key === "stalbans"
                      ? "The MealDeck collection, plus Café 1"
                      : "Your favourite food and drink brands"}
                  </small>
                </span>
                {locationKey === location.key ? (
                  <Check size={20} aria-hidden="true" />
                ) : (
                  <ArrowRight size={20} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
