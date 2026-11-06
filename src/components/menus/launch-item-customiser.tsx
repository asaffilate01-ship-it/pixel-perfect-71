import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, ShoppingBag } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LaunchQuantityControl } from "@/components/menus/launch-basket";
import { approvedBrandLogos, type ApprovedBrandId } from "@/lib/brand-logos";
import type {
  LaunchMenuBrand,
  LaunchMenuItem,
  LaunchMenuOptionGroup,
  LaunchMenuSection,
} from "@/lib/launch-menu-catalogue";
import {
  isLaunchGroupActive,
  launchItemGroups,
  launchSelectionLabels,
  missingLaunchChoices,
  toggleLaunchOption,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "@/lib/launch-menu-picks";
import {
  cleanLaunchCrossConfiguration,
  getLaunchCrossOffers,
  isMappedLaunchUpgradeOption,
  launchCrossSelectionSummaries,
  setLaunchCrossChoice,
  type LaunchCrossOffer,
  type LaunchCrossSelection,
} from "@/lib/launch-menu-upsells";
import {
  formatLaunchMenuPrice,
  launchMenuCrossChoicePrice,
  launchMenuPickDisplayPrice,
} from "@/lib/launch-menu-display-prices";

export type LaunchMenuEntry = {
  brand: LaunchMenuBrand;
  section: LaunchMenuSection;
  item: LaunchMenuItem;
};
export type LaunchItemDraft = LaunchMenuEntry & { existing?: LaunchMenuPick };
type Step = "food" | "extras" | "review";

function logoFor(id: string) {
  return approvedBrandLogos[(id === "skorch-burgers" ? "skorch" : id) as ApprovedBrandId];
}

function isExtrasGroup(group: LaunchMenuOptionGroup) {
  return (
    group.id.includes("make-it-a-meal") ||
    group.id.includes("meal-upgrades") ||
    group.id.includes("included-meal-drink") ||
    group.id === "souvano-meal-side"
  );
}

function noneLabel(offer: LaunchCrossOffer) {
  if (offer.mode === "extra") return offer.slot === "side" ? "No extra side" : "No extra drink";
  return offer.slot === "side" ? "No Load’d upgrade" : "No Moktl upgrade";
}

export function LaunchItemCustomiser({
  draft,
  onSave,
  onBack,
  error,
  context = "preview",
}: {
  draft: LaunchItemDraft;
  onSave: (
    selections: LaunchMenuSelections,
    quantity: number,
    crossSelections: LaunchCrossSelection[],
  ) => void;
  onBack: () => void;
  error: string;
  context?: "preview" | "group-order";
}) {
  const { brand, section, item, existing } = draft;
  const [configuration, setConfiguration] = useState(() =>
    cleanLaunchCrossConfiguration(
      brand,
      item,
      existing?.selections ?? {},
      existing?.crossSelections ?? [],
    ),
  );
  const { selections, crossSelections } = configuration;
  const [quantity, setQuantity] = useState(existing?.quantity ?? 1);
  const [changeNotice, setChangeNotice] = useState("");
  const groups = launchItemGroups(brand, item);
  const foodGroups = groups.filter((group) => !isExtrasGroup(group));
  const extrasGroups = groups.filter(isExtrasGroup);
  const offers = getLaunchCrossOffers(brand, item, selections);
  const steps: Step[] = [
    ...(foodGroups.length ? ["food" as const] : []),
    ...(extrasGroups.length || offers.length ? ["extras" as const] : []),
    "review",
  ];
  const [step, setStep] = useState<Step>(steps[0]!);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [pickerSection, setPickerSection] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const offerButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const previousPicker = useRef<string | null>(null);
  const picker = offers.find((offer) => offer.id === pickerId);
  const missing = missingLaunchChoices(brand, item, selections, crossSelections);
  const currentMissing = missing.filter((group) =>
    step === "food" ? !isExtrasGroup(group) : true,
  );
  const stepIndex = steps.indexOf(step);
  const labels = launchSelectionLabels(brand, item, selections, crossSelections);
  const summaries = launchCrossSelectionSummaries(brand, item, selections, crossSelections);
  const price = launchMenuPickDisplayPrice({
    brandId: brand.id,
    itemId: item.id,
    selections,
    crossSelections,
    quantity,
  });
  const stepLabels: Record<Step, string> = { food: "Food", extras: "Extras", review: "Review" };

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const returnButton =
      !pickerId && previousPicker.current ? offerButtons.current[previousPicker.current] : null;
    if (returnButton) returnButton.focus();
    else headingRef.current?.focus();
    previousPicker.current = pickerId;
  }, [step, pickerId]);

  function chooseSource(groupId: string, optionId: string) {
    const next = cleanLaunchCrossConfiguration(
      brand,
      item,
      toggleLaunchOption(brand, item, selections, groupId, optionId),
      crossSelections,
    );
    const removed = crossSelections.filter(
      (old) =>
        !next.crossSelections.some(
          (choice) =>
            choice.slot === old.slot && choice.mode === old.mode && choice.itemId === old.itemId,
        ),
    );
    setChangeNotice(
      removed.length
        ? "Your extras have been updated to match this choice. Choose a new side or drink below if you’d like one."
        : "",
    );
    setConfiguration(next);
  }

  function openPicker(offer: LaunchCrossOffer) {
    const selected = crossSelections.find((choice) => choice.slot === offer.slot);
    const choice = offer.choices.find((entry) => entry.itemId === selected?.itemId);
    setPickerSection(choice?.sectionId ?? offer.choices[0]?.sectionId ?? "");
    setPickerId(offer.id);
  }

  function chooseCross(offer: LaunchCrossOffer, itemId: string | null) {
    setConfiguration(
      setLaunchCrossChoice(brand, item, selections, crossSelections, offer.id, itemId),
    );
    setChangeNotice("");
    setPickerId(null);
  }

  function renderGroup(group: LaunchMenuOptionGroup) {
    if (!isLaunchGroupActive(group, selections, item, crossSelections)) return null;
    const visibleOptions = group.options.filter(
      (option) =>
        !isMappedLaunchUpgradeOption(option.id) || selections[group.id]?.includes(option.id),
    );
    if (!visibleOptions.length) return null;
    const hasLegacyChoice = visibleOptions.some((option) => isMappedLaunchUpgradeOption(option.id));
    return (
      <fieldset className="lmc-option-group" key={group.id}>
        <legend>
          {group.label}
          <span>{group.required ? "Choose one" : "Optional"}</span>
        </legend>
        {group.description && <p>{group.description}</p>}
        <div className="lmc-option-grid">
          {group.kind === "single" && !group.required && (
            <label className={"lmc-option " + (!selections[group.id]?.length ? "is-selected" : "")}>
              <input
                type="radio"
                name={group.id}
                checked={!selections[group.id]?.length}
                onChange={() => {
                  const active = selections[group.id]?.[0];
                  if (active) chooseSource(group.id, active);
                }}
              />
              <span>{group.id.includes("make-it-a-meal") ? "Just the main" : "No upgrade"}</span>
            </label>
          )}
          {visibleOptions.map((option) => {
            const selected = selections[group.id]?.includes(option.id) ?? false;
            const variants = item.priceVariants?.filter(
              (variant) =>
                variant.selections[group.id] === option.id &&
                Object.entries(variant.selections).every(
                  ([id, choice]) =>
                    id === group.id || !selections[id]?.length || selections[id]?.includes(choice),
                ),
            );
            const variantPrices = variants?.map((variant) => variant.pricePence) ?? [];
            const variantPrice = variantPrices.length ? Math.min(...variantPrices) : null;
            return (
              <label
                key={option.id}
                className={
                  "lmc-option " +
                  (selected ? "is-selected " : "") +
                  (option.available === false ? "is-unavailable" : "")
                }
              >
                <input
                  type={group.kind === "single" ? "radio" : "checkbox"}
                  name={group.id}
                  checked={selected}
                  disabled={option.available === false}
                  onChange={() => chooseSource(group.id, option.id)}
                />
                <span>
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                  {option.available === false && (
                    <small>{option.unavailableReason ?? "Currently unavailable"}</small>
                  )}
                  <small className="lmc-choice-price">
                    {variantPrice !== null
                      ? (Math.max(...variantPrices) > variantPrice ? "From " : "") +
                        formatLaunchMenuPrice(variantPrice) +
                        " dish"
                      : option.pricePence === 0
                        ? "Included"
                        : "+" + formatLaunchMenuPrice(option.pricePence)}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
        {hasLegacyChoice && (
          <p className="lmc-legacy-note">
            You saved a general upgrade earlier. Choose a specific Load’d side or Moktl drink below,
            or untick it to remove.
          </p>
        )}
      </fieldset>
    );
  }

  const pickerSections = picker
    ? [
        ...new Map(
          picker.choices.map((choice) => [choice.sectionId, choice.sectionTitle]),
        ).entries(),
      ]
    : [];
  const pickerSelection = crossSelections.find((choice) => choice.slot === picker?.slot);
  const pickerChoices =
    picker?.choices.filter(
      (choice) => pickerSections.length < 2 || choice.sectionId === pickerSection,
    ) ?? [];

  return (
    <>
      <header
        className="lmc-header"
        data-customiser-layout={steps.length === 1 ? "compact" : "steps"}
      >
        <img src={logoFor(brand.id)} alt={brand.name} width="62" height="48" />
        <div>
          <span className="lmc-eyebrow">{section.title}</span>
          <DialogTitle className="lmc-title">{item.name}</DialogTitle>
          <p className="lmc-item-price">
            {price.baseUnitPence === null && item.priceVariants?.length ? "From " : ""}
            {formatLaunchMenuPrice(price.baseUnitPence ?? item.pricePence)} <span>per item</span>
          </p>
          <DialogDescription className="lmc-description">
            {context === "group-order"
              ? "Choose your food for this group"
              : "Build your basket · Ordering coming soon"}
          </DialogDescription>
        </div>
      </header>
      {steps.length > 1 && (
        <nav className="lmc-steps" aria-label="Customise your dish">
          {steps.map((entry, index) => (
            <button
              type="button"
              key={entry}
              aria-current={!picker && step === entry ? "step" : undefined}
              disabled={
                !!picker ||
                (index > stepIndex && (currentMissing.length > 0 || index > stepIndex + 1))
              }
              onClick={() => setStep(entry)}
            >
              <span aria-hidden="true">{index < stepIndex ? <Check size={13} /> : index + 1}</span>
              {stepLabels[entry]}
            </button>
          ))}
        </nav>
      )}
      <div className="lmc-body" ref={bodyRef}>
        <h2 className="lmc-step-heading" ref={headingRef} tabIndex={-1}>
          {picker
            ? picker.title
            : step === "food"
              ? "Make it yours"
              : step === "extras"
                ? "Complete your meal"
                : context === "group-order"
                  ? "Ready for your order"
                  : "Ready for your basket"}
        </h2>

        {picker ? (
          <>
            <p className="lmc-help">{picker.description} Choose one, or continue without it.</p>
            {pickerSections.length > 1 && (
              <div className="lmc-picker-tabs" role="group" aria-label="Load’d side type">
                {pickerSections.map(([id, title]) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={pickerSection === id}
                    onClick={() => setPickerSection(id)}
                  >
                    {title.replace(/^Loaded\s+/i, "")}
                  </button>
                ))}
              </div>
            )}
            <div
              className="lmc-product-grid"
              aria-label={picker.slot === "side" ? "Load’d choices" : "Moktl choices"}
            >
              {pickerChoices.map((choice) => (
                <button
                  type="button"
                  className="lmc-product"
                  key={choice.itemId}
                  aria-pressed={pickerSelection?.itemId === choice.itemId}
                  onClick={() => chooseCross(picker, choice.itemId)}
                >
                  <strong>{choice.name}</strong>
                  {choice.description && <small>{choice.description}</small>}
                  <span className="lmc-choice-price">
                    +
                    {formatLaunchMenuPrice(
                      launchMenuCrossChoicePrice(picker.mode, choice.brandId, choice.itemId),
                    )}
                  </span>
                  {pickerSelection?.itemId === choice.itemId && (
                    <Check size={17} aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </>
        ) : step === "food" ? (
          <>
            {(item.description || section.description) && (
              <details className="lmc-about">
                <summary>About this dish</summary>
                {item.description && <p>{item.description}</p>}
                {section.description && <p>{section.description}</p>}
              </details>
            )}
            {foodGroups.map(renderGroup)}
          </>
        ) : step === "extras" ? (
          <>
            {extrasGroups.map(renderGroup)}
            {changeNotice && (
              <p className="lmc-change-notice" role="status">
                {changeNotice}
              </p>
            )}
            {offers.length > 0 && (
              <div className="lmc-offers">
                <p className="lmc-offer-intro">
                  Mix it up across the deck <span>Optional</span>
                </p>
                {offers.map((offer) => {
                  const selected = crossSelections.find((choice) => choice.slot === offer.slot);
                  const choice = offer.choices.find((entry) => entry.itemId === selected?.itemId);
                  return (
                    <button
                      type="button"
                      key={offer.id}
                      className={"lmc-offer " + (choice ? "is-selected" : "")}
                      ref={(node) => {
                        offerButtons.current[offer.id] = node;
                      }}
                      onClick={() => openPicker(offer)}
                    >
                      <img src={logoFor(offer.brandId)} alt="" width="56" height="44" />
                      <span>
                        <strong>{offer.title}</strong>
                        <small>
                          {choice
                            ? (offer.slot === "side" ? choice.sectionTitle + " · " : "") +
                              choice.name
                            : offer.description}
                        </small>
                        <small className="lmc-choice-price">
                          {choice
                            ? "+" +
                              formatLaunchMenuPrice(
                                launchMenuCrossChoicePrice(
                                  offer.mode,
                                  choice.brandId,
                                  choice.itemId,
                                ),
                              ) +
                              " per item"
                            : "View choices and prices"}
                        </small>
                      </span>
                      {choice ? (
                        <Check size={20} aria-label="Selected" />
                      ) : (
                        <ChevronRight size={20} aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="lmc-review">
            {labels.length > 0 ? (
              <p className="lmc-review-options">{labels.join(" · ")}</p>
            ) : (
              item.description && <p className="lmc-review-options">{item.description}</p>
            )}
            {summaries.map((summary) => {
              const additionPrice = price.additions.find(
                (entry) => entry.slot === summary.slot && entry.itemId === summary.itemId,
              );
              return (
                <div className="lmc-review-addition" key={summary.slot}>
                  <img src={logoFor(summary.brandId)} alt="" width="50" height="42" />
                  <span>
                    <small>
                      {summary.mode === "upgrade" ? "Upgrade" : "Extra"} · {summary.brandName}
                    </small>
                    <strong>{summary.itemName}</strong>
                    <small>{summary.label}</small>
                    <small className="lmc-choice-price">
                      {formatLaunchMenuPrice(additionPrice?.unitPence ?? null)} each ·{" "}
                      {formatLaunchMenuPrice(additionPrice?.linePence ?? null)} for {quantity}
                    </small>
                  </span>
                  <b>×{quantity}</b>
                </div>
              );
            })}
            <div className="lmc-review-quantity">
              <span>Quantity</span>
              <LaunchQuantityControl quantity={quantity} onChange={setQuantity} name={item.name} />
            </div>
            <dl className="lmc-review-prices">
              <div>
                <dt>
                  {formatLaunchMenuPrice(price.baseUnitPence)} × {quantity}
                </dt>
                <dd>{formatLaunchMenuPrice(price.baseLinePence)}</dd>
              </div>
              {price.options.map((option) => (
                <div key={option.optionId}>
                  <dt>
                    {option.label} × {quantity}
                  </dt>
                  <dd>
                    {option.unitPence === 0
                      ? "Included"
                      : "+" + formatLaunchMenuPrice(option.linePence)}
                  </dd>
                </div>
              ))}
              <div className="lmc-items-subtotal">
                <dt>Items subtotal</dt>
                <dd>{formatLaunchMenuPrice(price.itemsSubtotalPence)}</dd>
              </div>
            </dl>
            {summaries.length > 0 && <p className="lmc-help">Your choices apply to each item.</p>}
            <p className="lmc-allergy">
              For allergies or dietary needs, check with the team before ordering
              {context === "preview" ? " when we launch" : ""}.
            </p>
          </div>
        )}
      </div>
      <footer className="lmc-footer">
        {!picker && currentMissing.length > 0 && (
          <p className="lmc-required" role="status">
            Choose {currentMissing.map((group) => group.label.toLowerCase()).join(" and ")} to
            continue.
          </p>
        )}
        {error && (
          <p className="lm-error" role="alert">
            {error}
          </p>
        )}
        <div className="lmc-actions">
          <button
            type="button"
            className="lmc-back"
            onClick={() => {
              if (picker) setPickerId(null);
              else if (stepIndex > 0) setStep(steps[stepIndex - 1]!);
              else onBack();
            }}
          >
            <ArrowLeft size={18} />
            {picker
              ? "Back to extras"
              : stepIndex > 0
                ? "Back"
                : existing
                  ? context === "group-order"
                    ? "My choices"
                    : "Basket"
                  : "Menu"}
          </button>
          {picker && (
            <button type="button" className="lmc-none" onClick={() => chooseCross(picker, null)}>
              {noneLabel(picker)}
            </button>
          )}
          {!picker && (
            <button
              type="button"
              className="lm-primary lmc-next"
              disabled={currentMissing.length > 0}
              onClick={() => {
                if (step === "review") onSave(selections, quantity, crossSelections);
                else setStep(steps[stepIndex + 1]!);
              }}
            >
              {step === "review"
                ? existing
                  ? "Save changes"
                  : context === "group-order"
                    ? "Add to my order"
                    : "Add to basket"
                : "Next"}
              {step === "review" ? (
                existing ? (
                  <Check size={18} />
                ) : (
                  <ShoppingBag size={18} />
                )
              ) : (
                <ArrowRight size={18} />
              )}
            </button>
          )}
        </div>
        <p className="lmc-price-note">
          {context === "group-order"
            ? "Current menu prices · Final total checked before payment"
            : "Item prices shown · Ordering coming soon"}
        </p>
      </footer>
    </>
  );
}
