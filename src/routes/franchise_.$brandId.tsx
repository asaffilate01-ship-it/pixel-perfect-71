import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  ClipboardList,
  Layers,
  MapPin,
  Plus,
  Store,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FranchiseBrandLogo } from "@/components/franchise/brand-logo";
import { getFranchiseBrand } from "@/lib/franchise-brands";
import {
  franchiseSearchForSelection,
  franchiseSelectionFromSearch,
  normaliseFranchiseBrandIds,
  parseFranchiseSearch,
} from "@/lib/franchise-selection";
import { seo, SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/franchise_/$brandId")({
  validateSearch: parseFranchiseSearch,
  loader: ({ params }) => {
    const brand = getFranchiseBrand(params.brandId);
    if (!brand) throw notFound();
    return brand;
  },
  head: ({ loaderData }) =>
    loaderData
      ? seo({
          title: `${loaderData.name} Franchise | MealDeck`,
          description: `${loaderData.tagline} Explore a ${loaderData.name} franchise on its own or with other MealDeck brands. New entrants and existing kitchens welcome. Pricing POA.`,
          path: `/franchise/${loaderData.id}`,
          image: new URL(loaderData.image, SITE_URL).toString(),
          keywords: `${loaderData.name} franchise, ${loaderData.category} franchise, MealDeck individual brands, food franchise UK`,
        })
      : {},
  notFoundComponent: () => (
    <div className="md-marketing-shell md-franchise-page md-franchise-brand-page">
      <SiteHeader />
      <main className="md-franchise-brand-not-found">
        <p className="md-kicker md-kicker-red">MealDeck franchises</p>
        <h1>That brand isn’t in this deck.</h1>
        <p>Explore the current collection to find your next food business.</p>
        <Link
          to="/franchise"
          search={{ package: "brands" }}
          hash="brands"
          className="md-btn md-btn-yellow"
        >
          Explore franchise brands <ArrowRight aria-hidden="true" />
        </Link>
      </main>
      <SiteFooter />
    </div>
  ),
  component: BrandFranchisePage,
});

const proposalScope = [
  "Brand rights, menu standards and operating guidance",
  "Training, launch support and ongoing service scope",
  "Existing equipment assessment and required additions",
  "Technology, ordering channels and marketing arrangements",
  "Opening stock, packaging and supply requirements",
  "Upfront investment, ongoing charges and your responsibilities",
];

function BrandFranchisePage() {
  const brand = Route.useLoaderData();
  const search = Route.useSearch();
  const { selectedBrandIds } = franchiseSelectionFromSearch(search);
  const proposedBrandIds = normaliseFranchiseBrandIds([...selectedBrandIds, brand.id]);
  const proposalSearch = franchiseSearchForSelection("selected_brands", proposedBrandIds, search);
  const existingSearch = franchiseSearchForSelection("selected_brands", selectedBrandIds, search);
  const selected = selectedBrandIds.includes(brand.id);
  const proposedNames = proposedBrandIds
    .map((id) => getFranchiseBrand(id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="md-marketing-shell md-franchise-page md-franchise-brand-page">
      <SiteHeader
        context={
          <Link
            to="/franchise"
            search={existingSearch}
            hash="brands"
            className="md-btn md-btn-yellow"
          >
            Franchises <Layers aria-hidden="true" />
          </Link>
        }
      />
      <main>
        <section className="md-franchise-brand-hero" aria-labelledby="brand-franchise-title">
          <div className="md-franchise-brand-hero-inner">
            <Link
              to="/franchise"
              search={existingSearch}
              hash="brands"
              className="md-franchise-brand-back"
            >
              <ArrowLeft aria-hidden="true" /> All franchise brands
            </Link>
            <div className="md-franchise-brand-hero-grid">
              <div className="md-franchise-brand-hero-copy">
                <p className="md-kicker">Individual brand franchise · {brand.category}</p>
                <h1 id="brand-franchise-title">
                  {brand.name}
                  <span>Franchise</span>
                </h1>
                <h2>{brand.tagline}</h2>
                <p className="md-franchise-brand-hero-lead">{brand.pitch}</p>
                <div className="md-franchise-brand-hero-tags">
                  <span>
                    <Store aria-hidden="true" /> Existing kitchens
                  </span>
                  <span>
                    <ChefHat aria-hidden="true" /> New entrants
                  </span>
                </div>
                <div className="md-franchise-brand-hero-actions">
                  <Link
                    to="/franchise"
                    search={proposalSearch}
                    hash="apply"
                    className="md-btn md-btn-yellow"
                  >
                    Enquire about {brand.name} <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link
                    to="/franchise"
                    search={proposalSearch}
                    hash="brands"
                    className="md-btn md-btn-outline-light"
                  >
                    {selected ? "Choose more brands" : "Add brand & choose more"}{" "}
                    <Plus aria-hidden="true" />
                  </Link>
                </div>
                <div className="md-franchise-brand-hero-price">
                  <span>Individual franchise & custom combinations</span>
                  <strong>Price on application</strong>
                  <p>Your investment reflects the agreed brands, site, equipment and support.</p>
                </div>
              </div>
              <div className="md-franchise-brand-promo-card">
                <div className="md-franchise-brand-promo-logo">
                  <FranchiseBrandLogo key={brand.id} src={brand.logo} name={brand.name} />
                </div>
                <div className="md-franchise-brand-promo-food">
                  <img
                    src={brand.image}
                    alt={`${brand.name} — ${brand.category}`}
                    width={768}
                    height={512}
                    fetchPriority="high"
                  />
                </div>
                <div className="md-franchise-brand-promo-caption">
                  <span>{brand.category}</span>
                  <strong>
                    {brand.rank}
                    {brand.suit}
                  </strong>
                </div>
                {selected && (
                  <div className="md-franchise-brand-promo-status">
                    <Check aria-hidden="true" /> In your selection
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          className="md-franchise-brand-fit md-franchise-brands-inner"
          aria-labelledby="brand-franchise-fit"
        >
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">A route for your starting point</p>
            <h2 id="brand-franchise-fit">
              Your kitchen.
              <br />
              Your next chapter.
            </h2>
            <p>
              Tell us where you are starting. We’ll assess the right operating setup for{" "}
              {brand.name} and your chosen location.
            </p>
          </div>
          <div className="md-franchise-brand-fit-grid">
            <article>
              <Store aria-hidden="true" />
              <p className="md-franchise-brand-eyebrow">Existing operator</p>
              <h3>Make more of your kitchen.</h3>
              <p>{brand.existingKitchen}</p>
              <p>
                Suitable existing equipment can form part of your setup. The assessment identifies
                what can be reused and which additions your proposed menu requires.
              </p>
            </article>
            <article>
              <ChefHat aria-hidden="true" />
              <p className="md-franchise-brand-eyebrow">New entrant</p>
              <h3>Start with a clear plan.</h3>
              <p>{brand.newEntrant}</p>
              <p>
                Your proposal sets out the setup, training and support scope, alongside the
                staffing, working capital and day-to-day responsibilities you need to plan for.
              </p>
            </article>
          </div>
        </section>

        <section className="md-franchise-brand-proposal" aria-labelledby="brand-franchise-proposal">
          <div className="md-franchise-brands-inner md-franchise-brand-proposal-grid">
            <div className="md-section-heading">
              <p className="md-kicker md-kicker-red">Know what you are taking on</p>
              <h2 id="brand-franchise-proposal">
                One proposal.
                <br />
                An agreed scope.
              </h2>
              <p>
                Choose {brand.name} on its own or request a combination. We review the kitchen,
                location and brand fit before confirming a package.
              </p>
              <Link
                to="/franchise"
                search={proposalSearch}
                hash="apply"
                className="md-franchise-brand-text-link"
              >
                Request my proposal <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="md-franchise-brand-scope">
              <ClipboardList aria-hidden="true" />
              <h3>What your proposal will cover</h3>
              <ul>
                {proposalScope.map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p>
                Individual brand packages have their own agreed terms. Full MealDeck services and
                territory rights apply only where expressly included in your agreement.
              </p>
            </div>
          </div>
        </section>

        <section
          className="md-franchise-brand-next md-franchise-brands-inner"
          aria-labelledby="brand-franchise-next"
        >
          <div>
            <p className="md-kicker md-kicker-red">Your next move</p>
            <h2 id="brand-franchise-next">
              Start with {brand.name}.<br />
              Choose your own combination.
            </h2>
            <p>
              Select one, two, three or more brands, or explore the complete MealDeck concept. All
              proposals are subject to applicant, kitchen and location approval.
            </p>
            <p className="md-franchise-brand-selection-summary">
              <Check aria-hidden="true" />
              <span>
                <strong>This enquiry will include:</strong> {proposedNames}.
              </span>
            </p>
          </div>
          <div className="md-franchise-brand-next-actions">
            <Link
              to="/franchise"
              search={proposalSearch}
              hash="apply"
              className="md-btn md-btn-yellow"
            >
              Request my proposal <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              to="/franchise"
              search={proposalSearch}
              hash="brands"
              className="md-franchise-brand-text-link"
            >
              Add more brands <Plus aria-hidden="true" />
            </Link>
            <Link
              to="/franchise"
              search={franchiseSearchForSelection("full_mealdeck", [], search)}
              className="md-franchise-brand-text-link"
            >
              Explore full MealDeck <MapPin aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
