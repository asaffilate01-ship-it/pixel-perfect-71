import { Link } from "@tanstack/react-router";
import { marketingBrands, type MarketingBrand } from "@/lib/marketing-brands";
import { getLaunchMenuBrand } from "@/lib/launch-menu-catalogue";

function BrandTile({ brand }: { brand: MarketingBrand }) {
  const hasMenu = !!getLaunchMenuBrand(brand.id);
  return (
    <Link
      to="/menus"
      search={{ brand: brand.id }}
      className="md-brand-tile"
      aria-label={
        hasMenu
          ? `View ${brand.name} menu — ordering coming soon`
          : `${brand.name} — coming in the next deck`
      }
    >
      <div className="md-brand-logo-wrap">
        <img src={brand.logo} alt={`${brand.name} logo`} loading="lazy" />
      </div>
      <div className="md-brand-tile-meta">
        <strong>{brand.name}</strong>
        <span>{brand.category}</span>
        <small className={hasMenu ? "md-brand-menu-status" : "md-brand-menu-status is-next"}>
          {hasMenu ? "View menu · Ordering soon" : "Next deck"}
        </small>
      </div>
    </Link>
  );
}

export function BrandLogoGrid({ brands = marketingBrands }: { brands?: MarketingBrand[] }) {
  const launchBrands = brands.filter((brand) => getLaunchMenuBrand(brand.id));
  const nextBrands = brands.filter((brand) => !getLaunchMenuBrand(brand.id));
  return (
    <>
      <div className="md-brand-grid md-brand-grid-launch" aria-label="Five launch menus to browse">
        {launchBrands.map((brand) => (
          <BrandTile key={brand.id} brand={brand} />
        ))}
      </div>
      {nextBrands.length > 0 && (
        <section className="md-next-deck" aria-labelledby="next-deck-title">
          <h3 id="next-deck-title">Coming in the next deck.</h3>
          <p>More brands. More cravings. More menus to come.</p>
          <div className="md-brand-grid md-brand-grid-launch">
            {nextBrands.map((brand) => (
              <BrandTile key={brand.id} brand={brand} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
