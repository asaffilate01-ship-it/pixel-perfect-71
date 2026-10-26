import { Link } from "@tanstack/react-router";
import { marketingBrands, type MarketingBrand } from "@/lib/marketing-brands";

function BrandTile({ brand }: { brand: MarketingBrand }) {
  return (
    <Link
      to="/order"
      search={{ brand: brand.id }}
      className="md-brand-tile"
      aria-label={`Preview ${brand.name} — ordering coming soon`}
    >
      <div className="md-brand-logo-wrap">
        <img src={brand.logo} alt={`${brand.name} logo`} loading="lazy" />
      </div>
      <div className="md-brand-tile-meta">
        <strong>{brand.name}</strong>
        <span>{brand.category}</span>
      </div>
    </Link>
  );
}

export function BrandLogoGrid({ brands = marketingBrands }: { brands?: MarketingBrand[] }) {
  return (
    <div className="md-brand-grid">
      {brands.map((brand) => <BrandTile key={brand.id} brand={brand} />)}
    </div>
  );
}

