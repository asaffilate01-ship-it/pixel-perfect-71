import { ArrowRight, Check, ChefHat, Layers3, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_PROGRAMME, money } from "@/lib/franchise-offer";
import { marketingBrands } from "@/lib/marketing-brands";
import type { FranchiseBrandId, FranchisePackage } from "@/lib/franchise-selection";

type ChoiceProps = {
  franchisePackage: FranchisePackage;
  selectedBrandIds: readonly FranchiseBrandId[];
  onChoose: (value: FranchisePackage) => void;
  disabled?: boolean;
};

export function FranchisePackageChooser({
  franchisePackage,
  selectedBrandIds,
  onChoose,
  disabled,
}: ChoiceProps) {
  const full = franchisePackage === "full_mealdeck";
  return (
    <section id="franchise-options" className="md-section md-section-cream md-franchise-choices">
      <div className="md-section-heading">
        <p className="md-kicker md-kicker-red">Choose your franchise</p>
        <h2>
          The whole deck.
          <br />
          Or your own hand.
        </h2>
        <p>
          Choose the complete MealDeck concept or build a package of one, two, three or more
          individual brands.
        </p>
      </div>
      <div className="md-franchise-choice-grid">
        <article className={"md-franchise-choice" + (full ? " is-chosen" : "")}>
          <div className="md-franchise-choice-top">
            <Layers3 aria-hidden="true" />
            <span>The complete concept</span>
            {full && (
              <span className="md-franchise-choice-selected">
                <Check aria-hidden="true" /> Selected
              </span>
            )}
          </div>
          <h3>Full MealDeck</h3>
          <p>
            The shared brand portfolio, an agreed location and territory, premises rent deposit,
            equipment, opening supplies, technology, training and coordinated support.
          </p>
          <div className="md-franchise-choice-price">
            <strong>
              {money(DEFAULT_PROGRAMME.upfrontFeeMin)}–{money(DEFAULT_PROGRAMME.upfrontFeeMax)}
            </strong>
            <span>Indicative all-inclusive launch range · ongoing fees POA</span>
          </div>
          <p className="md-franchise-choice-terms">
            Includes a two-month rent deposit allowance. Your final quote depends on the premises,
            actual deposit and launch scope and may fall outside this range. Excludes VAT where
            applicable; rent, running costs and working capital are funded separately.
          </p>
          <button
            type="button"
            className="md-btn md-btn-red"
            aria-pressed={full}
            disabled={disabled}
            onClick={() => onChoose("full_mealdeck")}
          >
            Explore full MealDeck <ArrowRight aria-hidden="true" />
          </button>
        </article>
        <article className={"md-franchise-choice" + (!full ? " is-chosen" : "")}>
          <div className="md-franchise-choice-top">
            <Plus aria-hidden="true" />
            <span>Build your combination</span>
            {!full && (
              <span className="md-franchise-choice-selected">
                <Check aria-hidden="true" /> Selected
              </span>
            )}
          </div>
          <h3>Choose your brands</h3>
          <p>
            Start with Skorch, pair two favourites or choose a wider selection. Explore a focused
            new business or add brands to a suitable existing kitchen.
          </p>
          <div className="md-franchise-choice-price">
            <strong>1, 2, 3… your choice.</strong>
            <span>Individual franchises & custom packages · POA</span>
          </div>
          <p className="md-franchise-choice-terms">
            Your proposal sets out the selected brand rights, equipment requirements, services and
            charges. Each location and brand combination is assessed before approval.
          </p>
          <button
            type="button"
            className="md-btn md-btn-red"
            aria-pressed={!full}
            disabled={disabled}
            onClick={() => onChoose("selected_brands")}
          >
            {selectedBrandIds.length ? "Continue choosing brands" : "Build my brand package"}{" "}
            <ArrowRight aria-hidden="true" />
          </button>
        </article>
      </div>
    </section>
  );
}

export function CustomFranchiseSetup() {
  return (
    <section id="custom-package" className="md-section md-section-cream md-franchise-divider">
      <div className="md-section-heading">
        <p className="md-kicker md-kicker-red">A package around your plans</p>
        <h2>
          Your starting point.
          <br />
          Your next step.
        </h2>
        <p>
          Your selected brands shape the proposal. We assess the location, kitchen capacity and
          launch requirements, then confirm the brand rights, equipment, training and ongoing
          services in writing.
        </p>
      </div>
      <div className="md-franchise-model-grid md-franchise-custom-models">
        <article>
          <ChefHat aria-hidden="true" />
          <h3>Already have a kitchen?</h3>
          <p>
            Use suitable equipment you already own, subject to assessment. We identify the changes,
            additional equipment and training needed for your chosen brands, with itemised setup
            requirements in your proposal. A new premises deposit is included only where MealDeck
            supplies premises and the landlord requires one.
          </p>
        </article>
        <article>
          <Layers3 aria-hidden="true" />
          <h3>Starting a new business?</h3>
          <p>
            Tell us your preferred brands and location. We discuss premises, equipment, training and
            your launch plan, so you can assess the setup costs and working capital before
            committing.
          </p>
        </article>
      </div>
      <div className="md-franchise-custom-quote">
        <div>
          <p className="md-kicker md-kicker-red">Individual brands & combinations</p>
          <h3>Price on application.</h3>
        </div>
        <p>
          The quote covers your agreed brand selection and service scope. Adding brands does not
          automatically grant the full MealDeck identity or territory rights. Activation follows
          kitchen, supply and training readiness.
        </p>
      </div>
    </section>
  );
}

type SummaryProps = {
  selectedBrandIds: readonly FranchiseBrandId[];
  onRemove: (id: FranchiseBrandId) => void;
  disabled?: boolean;
};

export function FranchiseBrandSelection({ selectedBrandIds, onRemove, disabled }: SummaryProps) {
  const selected = marketingBrands.filter((brand) =>
    selectedBrandIds.includes(brand.id as FranchiseBrandId),
  );
  return (
    <div className="md-franchise-bundle-list">
      <p className="md-franchise-bundle-count" role="status" aria-live="polite">
        {selected.length
          ? `${selected.length} ${selected.length === 1 ? "brand" : "brands"} in your enquiry`
          : "Choose at least one brand to continue."}
      </p>
      {selected.length > 0 && (
        <ul aria-label="Selected franchise brands">
          {selected.map((brand) => (
            <li key={brand.id}>
              <span>{brand.name}</span>
              <button
                type="button"
                onClick={() => onRemove(brand.id as FranchiseBrandId)}
                aria-label={`Remove ${brand.name} from enquiry`}
                disabled={disabled}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <a href="#brands" className="md-franchise-text-link">
        {selected.length ? "Explore or add more brands" : "Choose your brands"}{" "}
        <ArrowRight aria-hidden="true" />
      </a>
    </div>
  );
}

export function FranchiseSelectionBar({
  selectedBrandIds,
}: {
  selectedBrandIds: readonly FranchiseBrandId[];
}) {
  const [atEnquiry, setAtEnquiry] = useState(false);
  useEffect(() => {
    const form = document.getElementById("apply");
    if (!form) return;
    const observer = new IntersectionObserver(([entry]) => setAtEnquiry(entry?.isIntersecting ?? false), {
      rootMargin: "0px 0px -80px 0px",
    });
    observer.observe(form);
    return () => observer.disconnect();
  }, []);
  if (selectedBrandIds.length === 0 || atEnquiry) return null;
  return (
    <aside className="md-franchise-bundle-bar" aria-label="Your brand enquiry">
      <div>
        <strong>
          {selectedBrandIds.length} {selectedBrandIds.length === 1 ? "brand" : "brands"} selected
        </strong>
        <span>Tailored proposal · POA</span>
      </div>
      <a href="#apply" className="md-btn md-btn-yellow">
        Review & enquire <ArrowRight aria-hidden="true" />
      </a>
    </aside>
  );
}
