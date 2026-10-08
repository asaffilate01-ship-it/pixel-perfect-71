import { Link, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, Check, Plus, Search } from "lucide-react";
import { franchiseBrands } from "@/lib/franchise-brands";
import { FranchiseBrandLogo } from "./brand-logo";
import { franchiseSearchForSelection, type FranchiseBrandId } from "@/lib/franchise-selection";

type BrandFilter = "all" | "food" | "drinks-desserts" | "selected";

type BrandFranchiseCatalogueProps = {
  selectedBrandIds: readonly FranchiseBrandId[];
  onToggle: (id: FranchiseBrandId) => void;
  disabled?: boolean;
};

export function BrandFranchiseCatalogue({
  selectedBrandIds,
  onToggle,
  disabled = false,
}: BrandFranchiseCatalogueProps) {
  const currentSearch = useSearch({ strict: false });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BrandFilter>("all");
  const selection = useMemo(() => new Set(selectedBrandIds), [selectedBrandIds]);
  const visibleBrands = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("en-GB");
    return franchiseBrands.filter((brand) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "selected" ? selection.has(brand.id) : brand.collection === filter);
      return (
        matchesFilter &&
        `${brand.name} ${brand.category} ${brand.tagline}`.toLocaleLowerCase("en-GB").includes(term)
      );
    });
  }, [filter, query, selection]);
  const brandSearch = franchiseSearchForSelection(
    "selected_brands",
    selectedBrandIds,
    currentSearch,
  );
  const filters: { value: BrandFilter; label: string; count: number }[] = [
    { value: "all", label: "All brands", count: franchiseBrands.length },
    {
      value: "food",
      label: "Food",
      count: franchiseBrands.filter((brand) => brand.collection === "food").length,
    },
    {
      value: "drinks-desserts",
      label: "Drinks & desserts",
      count: franchiseBrands.filter((brand) => brand.collection === "drinks-desserts").length,
    },
    { value: "selected", label: "Selected", count: selection.size },
  ];

  return (
    <section
      id="brands"
      className="md-franchise-brands-section"
      aria-labelledby="franchise-brands-title"
    >
      <div className="md-franchise-brands-inner">
        <div className="md-franchise-brands-heading">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">Individual brand franchises</p>
            <h2 id="franchise-brands-title">
              Pick your brands.
              <br />
              Build your business.
            </h2>
            <p>
              Choose one, two, three or more. Explore each brand, build your selection and request a
              proposal for your kitchen and location.
            </p>
          </div>
          <div className="md-franchise-brands-pricing">
            <span>Individual brands & custom combinations</span>
            <strong>POA</strong>
            <p>One tailored proposal. Clear scope and costs.</p>
          </div>
        </div>

        <div className="md-franchise-brands-toolbar">
          <fieldset className="md-franchise-brands-filters">
            <legend className="md-franchise-sr-only">Filter franchise brands</legend>
            {filters.map(({ value, label, count }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </fieldset>
          <label className="md-franchise-brands-search">
            <span className="md-franchise-sr-only">Search franchise brands or cuisines</span>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a brand or cuisine"
            />
          </label>
        </div>
        <p className="md-franchise-brands-result" role="status" aria-live="polite">
          Showing {visibleBrands.length} {visibleBrands.length === 1 ? "brand" : "brands"}
          {query.trim() ? ` for “${query.trim()}”` : ""}
        </p>

        {visibleBrands.length > 0 ? (
          <div className="md-franchise-brands-grid">
            {visibleBrands.map((brand) => {
              const selected = selection.has(brand.id);
              return (
                <article
                  className={`md-franchise-brand-card${selected ? " is-selected" : ""}`}
                  key={brand.id}
                  aria-labelledby={`franchise-brand-${brand.id}`}
                >
                  <div className="md-franchise-brand-card-photo">
                    <img
                      src={brand.image}
                      alt={`${brand.name} — ${brand.category}`}
                      loading="lazy"
                      width={768}
                      height={512}
                    />
                    <span className="md-franchise-brand-card-suit" aria-hidden="true">
                      {brand.rank}
                      <span>{brand.suit}</span>
                    </span>
                    {selected && (
                      <span className="md-franchise-brand-card-selected">
                        <Check aria-hidden="true" /> Selected
                      </span>
                    )}
                  </div>
                  <div className="md-franchise-brand-card-body">
                    <div className="md-franchise-brand-card-identity">
                      <div className="md-franchise-brand-card-logo">
                        <FranchiseBrandLogo src={brand.logo} name={brand.name} decorative lazy />
                      </div>
                      <div>
                        <h3 id={`franchise-brand-${brand.id}`}>{brand.name}</h3>
                        <p>{brand.category}</p>
                      </div>
                    </div>
                    <h4>{brand.tagline}</h4>
                    <p className="md-franchise-brand-card-pitch">{brand.pitch}</p>
                    <div className="md-franchise-brand-card-price">
                      <span>Franchise pricing</span>
                      <strong>POA</strong>
                    </div>
                    <div className="md-franchise-brand-card-actions">
                      <Link
                        to="/franchise/$brandId"
                        params={{ brandId: brand.id }}
                        search={brandSearch}
                        className="md-franchise-brand-explore"
                        aria-label={`Explore the ${brand.name} franchise`}
                      >
                        Explore brand <ArrowUpRight aria-hidden="true" />
                      </Link>
                      <button
                        type="button"
                        className="md-franchise-brand-toggle"
                        onClick={() => onToggle(brand.id)}
                        aria-pressed={selected}
                        aria-label={`${selected ? "Remove" : "Add"} ${brand.name} ${selected ? "from" : "to"} your enquiry`}
                        disabled={disabled}
                      >
                        {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                        {selected ? "Selected" : "Select brand"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="md-franchise-brands-empty">
            <span aria-hidden="true">♣</span>
            <h3>
              {filter === "selected" && selection.size === 0
                ? "Your selection starts here."
                : "No brands match this search."}
            </h3>
            <p>
              {filter === "selected" && selection.size === 0
                ? "Explore the collection and select the brands you would like to discuss."
                : "Try another brand name or cuisine, or return to the full collection."}
            </p>
            <button
              type="button"
              className="md-btn md-btn-yellow"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
            >
              Show all brands
            </button>
          </div>
        )}
        <p className="md-franchise-brands-note">
          All selections are subject to applicant, kitchen and location approval. Your proposal
          confirms the permitted brands, support, equipment requirements and fees. A custom
          combination does not automatically include the full MealDeck package or territory rights.
        </p>
      </div>
    </section>
  );
}
