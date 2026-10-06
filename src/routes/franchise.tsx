import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Boxes,
  BrainCircuit,
  Check,
  ChefHat,
  ClipboardCheck,
  MapPin,
  Megaphone,
  MessageCircle,
  MonitorSmartphone,
  PackageCheck,
  Printer,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { seo } from "@/lib/seo";
import { marketingBrands } from "@/lib/marketing-brands";
import {
  DEFAULT_PROGRAMME,
  OFFER_VERSION,
  PLANNED_TERRITORIES,
  TAKEN_MARKETS,
  money,
  normaliseTerritories,
  type Territory,
} from "@/lib/franchise-offer";

export const Route = createFileRoute("/franchise")({
  head: () =>
    seo({
      title: "MealDeck Franchise — Turnkey Kitchen, " + marketingBrands.length + " Shared Brands",
      description:
        "Launch a turnkey MealDeck kitchen with shared brands, a location and territory, equipment, opening stock, technology including Haccora, training and business support.",
      path: "/franchise",
      keywords:
        "MealDeck franchise, turnkey kitchen franchise, cloud kitchen franchise UK, multi brand food franchise, takeaway franchise, kitchen franchise England Wales",
    }),
  component: FranchisePage,
});

type OperatorModel = "owner_operator" | "multi_unit_operator";
type LoadState = "loading" | "ready" | "error";
type ApiResponse = {
  territories?: unknown;
  ok?: unknown;
  reference?: unknown;
  error?: unknown;
};
type EnquiryForm = {
  name: string;
  email: string;
  phone: string;
  area: string;
  operatorModel: OperatorModel;
  existingKitchen: boolean;
  existingBusiness: string;
  operatingExperience: string;
  capital: string;
  launchTiming: string;
  multiUnit: boolean;
  setupPackageAcknowledged: boolean;
  operatorResponsibilitiesAcknowledged: boolean;
  consent: boolean;
  website: string;
};

const technologyPrice =
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(
    DEFAULT_PROGRAMME.techFeePerOrder * 100,
  ) + "p";

const provision = [
  {
    icon: Boxes,
    title: "The MealDeck brand portfolio",
    copy: "Access to all shared MealDeck brands, recipes, menu standards, brand assets and operating guidance.",
  },
  {
    icon: MapPin,
    title: "Location & territory",
    copy: "We source and assess the kitchen location, then define the proposed territory around the approved premises.",
  },
  {
    icon: ChefHat,
    title: "Kitchen equipment",
    copy: "MealDeck supplies the agreed equipment, itemised with opening supplies and packaging in your upfront package.",
  },
  {
    icon: MonitorSmartphone,
    title: "A connected technology package",
    copy: "The full software offer covers KDS, printing, ordering channels, delivery, aggregator connections, AI and Haccora food safety tools.",
  },
  {
    icon: PackageCheck,
    title: "Supplies & packaging",
    copy: "Opening stock and ongoing food, ingredients and branded packaging through our central supply programme.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance support",
    copy: "Haccora food safety tools, procedures, allergen guidance, record keeping, training and operational review within the agreed service.",
  },
  {
    icon: ClipboardCheck,
    title: "Administration & support",
    copy: "Onboarding, team training, operating procedures, franchise administration and ongoing support for your kitchen.",
  },
  {
    icon: Megaphone,
    title: "Marketing",
    copy: "Brand creative, launch planning, digital campaigns and local marketing support within your agreed programme.",
  },
  {
    icon: ReceiptText,
    title: "Accountancy",
    copy: "A monthly accountancy package with its included bookkeeping, payroll, reporting work and service limits agreed in writing.",
  },
];

const technology = [
  {
    icon: Printer,
    title: "KDS & order printers",
    copy: "KDS, order routing and printing software are included. Physical screens and printers are itemised once in the setup schedule.",
    label: "Kitchen hardware",
  },
  {
    icon: MonitorSmartphone,
    title: "Website & online ordering",
    copy: "MealDeck web ordering with location menus, a shared basket, collection and delivery options.",
    label: "Direct orders",
  },
  {
    icon: Boxes,
    title: "App ordering",
    copy: "Your location in the MealDeck app experience, with menus, opening hours and customer journeys set up for launch.",
    label: "Mobile customers",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp & phone",
    copy: "Ordering and customer contact through the WhatsApp and phone workflows agreed for your kitchen.",
    label: "More ways to order",
  },
  {
    icon: Truck,
    title: "Delivery management",
    copy: "Dispatch, delivery tracking and routing for the approved courier services or your own delivery team.",
    label: "Order fulfilment",
  },
  {
    icon: PackageCheck,
    title: "Aggregator integration",
    copy: "Connect supported marketplace accounts and order feeds through the approved integration for your location.",
    label: "Connected channels",
  },
  {
    icon: ShieldCheck,
    title: "Haccora food safety",
    copy: "Haccora food safety and compliance software is included in the technology fee. Access, configuration and training are arranged during onboarding.",
    label: "Compliance tools",
  },
  {
    icon: BrainCircuit,
    title: "AI & business insights",
    copy: "The agreed AI tools can support ordering, customer enquiries, sales analysis and demand planning.",
    label: "Decision support",
  },
  {
    icon: ReceiptText,
    title: "Business dashboard",
    copy: "Sales, orders, reporting and team access brought together in the MealDeck business tools.",
    label: "Daily visibility",
  },
];

const responsibilities = [
  {
    area: "Brands & kitchen standards",
    mealdeck: "Provide shared brand access, recipes, training and operating procedures.",
    operator: "Prepare orders, maintain quality and follow the agreed brand and service standards.",
  },
  {
    area: "Premises & territory",
    mealdeck: "Source and assess the location; document the approved premises and territory.",
    operator: "Pay the agreed rent, utilities, rates, salaries and site operating costs.",
  },
  {
    area: "Equipment",
    mealdeck: "Supply the equipment listed in the setup package and agree installation arrangements.",
    operator: "Fund the agreed upfront investment and fulfil the agreed equipment care, maintenance and replacement duties.",
  },
  {
    area: "Technology",
    mealdeck: "Provide the agreed hardware, platform setup, channel configuration, Haccora access and ongoing support.",
    operator: "Pay the fee for each completed customer order, use the system and fund third-party card, marketplace and courier charges under the agreed terms.",
  },
  {
    area: "Supplies & packaging",
    mealdeck: "Supply the agreed food products, ingredients, opening stock and packaging.",
    operator: "Pay for stock, order replenishment and manage storage, stock control and wastage.",
  },
  {
    area: "Compliance",
    mealdeck: "Provide Haccora food safety tools and the agreed allergen, training and compliance support.",
    operator: "Carry out the required daily checks, keep records and meet the responsibilities of the kitchen operator.",
  },
  {
    area: "People & daily operations",
    mealdeck: "Provide training, operational guidance and ongoing franchise support.",
    operator: "Recruit, employ, schedule, supervise and pay the kitchen team; run daily kitchen operations.",
  },
  {
    area: "Marketing",
    mealdeck: "Manage the agreed brand, launch and ongoing marketing programme.",
    operator: "Pay the marketing contribution, fund any agreed additional local spend and support local activity.",
  },
  {
    area: "Accountancy & administration",
    mealdeck: "Deliver the included accountancy work within the agreed monthly package, plus separately scoped administration and additional services.",
    operator: "Pay the service fees and provide complete, timely business records and approvals.",
  },
];

const launchSteps = [
  ["01", "Tell us about your plans", "Share your preferred area, operating experience and investment budget."],
  ["02", "Assess the fit", "We review the operator, proposed location, territory and equipment needs."],
  ["03", "Agree the full package", "Review the itemised setup quote, ongoing fees, territory and agreements."],
  ["04", "Equip, train & configure", "Prepare the kitchen, supply equipment and stock, train the team and test the agreed channels."],
  ["05", "Complete launch checks", "Confirm operating readiness, delivery arrangements and your launch marketing plan."],
  ["06", "Open & operate", "You manage the team and daily service, with MealDeck's ongoing supply and business support."],
];

const faqs = [
  {
    question: "What makes MealDeck a turnkey franchise?",
    answer:
      "MealDeck brings together the shared brand portfolio and menus, a selected location and agreed territory, equipment and opening supplies, the full technology offer including Haccora, training, compliance support, administration, marketing and accountancy. We coordinate the setup and systems around an agreed launch plan. You run the kitchen, employ and manage the team, and fund the agreed operating costs. Opening follows the location's setup, approvals and readiness checks.",
  },
  {
    question: "What does the upfront investment cover?",
    answer:
      "One upfront investment covers entry to the MealDeck franchise programme, the agreed brand and territory rights, and the equipment and opening supplies your kitchen needs to trade — itemised in full, alongside branded packaging. The total fee is " + money(DEFAULT_PROGRAMME.feeMin + DEFAULT_PROGRAMME.equipmentOpeningSuppliesFee) + "–" + money(DEFAULT_PROGRAMME.feeMax + DEFAULT_PROGRAMME.equipmentOpeningSuppliesFee) + ", depending on location and territory, and is confirmed in your written quote.",
  },
  {
    question: "Does MealDeck provide the equipment?",
    answer:
      "Yes. We supply the equipment your kitchen needs to run, including any KDS screens and printers, itemised in full alongside the opening supplies and packaging. The schedule confirms installation scope, ownership or hire terms, warranty, maintenance and replacement responsibilities.",
  },
  {
    question: "Who runs the kitchen and employs the staff?",
    answer:
      "The franchisee runs the kitchen, recruits and manages the team, and pays staffing and operating costs. The offer is designed for an owner-operator or a business operating several kitchens. A multi-unit operator remains responsible for the teams and performance of each location.",
  },
  {
    question: "What does the technology fee include?",
    answer:
      "The technology fee covers the full listed software offer: KDS and printing, web and app ordering, WhatsApp and phone ordering, delivery management, aggregator connections, AI tools and Haccora food safety software. Your written quote confirms the basis and any agreed allowances before activation.",
  },
  {
    question: "Are all brands available in every kitchen immediately?",
    answer:
      "The franchise offer includes access to the shared MealDeck brand portfolio. Your kitchen's launch menu and activation timetable are agreed around its equipment, training, supply and operating readiness. Customer menus show only the products that location can fulfil. Café1 remains exclusive to St Albans.",
  },
  {
    question: "How is my territory agreed?",
    answer:
      "MealDeck assesses the proposed kitchen, practical delivery routes, local households and neighbouring kitchens. The final mapped core, any exclusivity conditions and shared delivery edges are documented in the franchise agreement. Registering interest does not reserve or purchase an area.",
  },
  {
    question: "Can I suggest an area or an existing kitchen?",
    answer:
      "Yes. Tell us the town or area you prefer and whether you already have access to a commercial kitchen. MealDeck will assess the premises and territory before agreeing suitability, availability, equipment and costs.",
  },
  {
    question: "What do compliance and accountancy support include?",
    answer:
      "The accountancy package is " + money(DEFAULT_PROGRAMME.accountancyFeePerMonth) + " per month. Its written scope specifies the included work, reporting frequency, transaction or payroll limits and charges for additional work. Haccora software is covered by the technology fee; the compliance schedule defines the training and any additional human support. You continue to run the business, provide accurate records and carry out the operator's required checks and responsibilities.",
  },
  {
    question: "Does the offer guarantee sales or profit?",
    answer:
      "No sales or profit level is guaranteed. Your business plan needs to cover food, staffing, premises, utilities, delivery, platform charges, franchise fees and working capital. We discuss the site and operating assumptions with you before you decide whether to proceed.",
  },
];

function normaliseTerritoryName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Exact marketing/upstream aliases only. Nearby areas remain distinct:
// Bow/Mile End is separate from Stratford/Leyton; Acton is separate from Alperton.
const territoryNameGroups = [
  ["Southall", "Southall / Hayes"],
  ["Battersea", "Battersea / Clapham / Vauxhall", "Battersea / Nine Elms"],
  ["Bow / Mile End", "Mile End / Bow"],
  ["Acton / North Acton", "Acton / Park Royal", "Acton / North Acton / Park Royal"],
  ["Borough / west Bermondsey", "Elephant & Castle / Bermondsey / Southwark", "Borough / Bermondsey"],
  ["Deptford / New Cross", "Lewisham / Deptford / Greenwich West"],
  ["Alperton / Wembley", "Alperton / Wembley / Park Royal"],
  ["Stratford / Leyton", "Leyton / Stratford"],
  ["Tottenham / Edmonton", "Edmonton / Tottenham / Enfield South", "Edmonton / Tottenham"],
  ["Barking / Ilford", "Ilford / Barking"],
  ["Thornton Heath / Croydon", "Croydon / Thornton Heath"],
] as const;

function territoryNameKey(value: string) {
  const normalized = normaliseTerritoryName(value);
  for (const group of territoryNameGroups) {
    if (group.some((name) => normaliseTerritoryName(name) === normalized)) {
      return normaliseTerritoryName(group[0]);
    }
  }
  return normalized;
}

function canRegisterInterest(territory: Territory) {
  return territory.status === "available" ||
    territory.status === "planned" ||
    territory.status === "coming_soon";
}

function territoryStatus(territory: Territory, confirmed: boolean) {
  if (confirmed) return "Available to enquire";
  if (territory.status === "taken") return "Taken";
  if (territory.status === "reserved") return "Reserved";
  if (canRegisterInterest(territory)) return "Register interest";
  return "Under review";
}

function FranchisePage() {
  const programme = DEFAULT_PROGRAMME;
  const [liveTerritories, setLiveTerritories] = useState<Territory[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reloadCount, setReloadCount] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Territory | null>(null);
  const [submitted, setSubmitted] = useState<{ reference: string | null } | null>(null);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<EnquiryForm>({
    name: "",
    email: "",
    phone: "",
    area: "",
    operatorModel: "owner_operator",
    existingKitchen: false,
    existingBusiness: "",
    operatingExperience: "",
    capital: "",
    launchTiming: "",
    multiUnit: false,
    setupPackageAcknowledged: false,
    operatorResponsibilitiesAcknowledged: false,
    consent: false,
    website: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoadState("loading");
    setLiveTerritories([]);

    async function loadTerritories() {
      try {
        const response = await fetch("/api/franchise?programme=mealdeck-england-wales", {
          signal: controller.signal,
        });
        const payload = (await response.json()) as ApiResponse | null;
        if (!response.ok || !payload || !Array.isArray(payload.territories)) {
          throw new Error("Territory availability could not be checked.");
        }
        if (active) {
          setLiveTerritories(normaliseTerritories(payload.territories));
          setLoadState("ready");
        }
      } catch {
        if (active) setLoadState("error");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void loadTerritories();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [reloadCount]);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  const territories = useMemo(() => {
    const liveCodes = new Set(liveTerritories.map((territory) => territory.code));
    const liveNames = new Set(liveTerritories.map((territory) => territoryNameKey(territory.name)));
    const byCode = new Map<string, Territory>();
    for (const territory of PLANNED_TERRITORIES) {
      // Live records take precedence even when unavailable or using a different code.
      if (liveCodes.has(territory.code) || liveNames.has(territoryNameKey(territory.name))) continue;
      byCode.set(territory.code, territory);
    }
    for (const territory of liveTerritories) byCode.set(territory.code, territory);
    return [...byCode.values()];
  }, [liveTerritories]);

  const confirmedCodes = useMemo(
    () =>
      new Set(
        loadState === "ready"
          ? liveTerritories
              .filter((territory) => territory.status === "available" && territory.isSellable)
              .map((territory) => territory.code)
          : [],
      ),
    [liveTerritories, loadState],
  );

  const londonCards = territories.filter(
    (territory) => territory.region.toLowerCase() === "london" && territory.status !== "taken",
  );
  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return [];
    return territories
      .filter((territory) =>
        [territory.name, territory.region, territory.code, territory.note ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(search),
      )
      .slice(0, 16);
  }, [query, territories]);

  const selectedIsConfirmed = selected !== null && confirmedCodes.has(selected.code);
  const selectedLive = selectedIsConfirmed
    ? liveTerritories.find((territory) => territory.code === selected?.code) ?? null
    : null;

  function choose(territory: Territory) {
    if (!canRegisterInterest(territory)) return;
    setSelected(territory);
    setForm((value) => ({ ...value, area: territory.name }));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("apply")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    document.getElementById("franchise-name")?.focus({ preventScroll: true });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setFormError("");

    if (!form.name.trim() || !form.email.trim() || !form.area.trim()) {
      setFormError("Please add your name, email address and preferred area.");
      return;
    }
    if (!form.setupPackageAcknowledged || !form.operatorResponsibilitiesAcknowledged) {
      setFormError("Please confirm that you understand the setup charges and operator responsibilities.");
      return;
    }
    if (!form.consent) {
      setFormError("Please confirm that MealDeck may contact you about this franchise enquiry.");
      return;
    }

    const capital = form.capital.trim() === "" ? null : Number(form.capital);
    if (capital !== null && (!Number.isFinite(capital) || capital < 0 || capital > 10000000)) {
      setFormError("Enter an investment budget between £0 and £10,000,000, or leave it blank.");
      return;
    }

    setSending(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
        const value = params.get(key);
        if (value) utm[key] = value.slice(0, 200);
      }

      const response = await fetch("/api/franchise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          programmeKey: programme.key,
          // Planned areas are enquiries only. Only live, sellable inventory carries a territory code.
          territoryCode: selectedIsConfirmed ? selected?.code ?? null : null,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          preferredArea: form.area.trim(),
          existingKitchen: form.existingKitchen,
          existingBusiness: form.existingBusiness.trim() || null,
          availableCapitalMinor: capital === null ? null : Math.round(capital * 100),
          launchTiming: form.launchTiming || null,
          multiUnitInterest: form.multiUnit || form.operatorModel === "multi_unit_operator",
          operatorModel: form.operatorModel,
          source: "mealdeck-franchise-page",
          utm,
          answers: {
            offerVersion: OFFER_VERSION,
            operatingExperience: form.operatingExperience.trim(),
            setupPackageAcknowledged: form.setupPackageAcknowledged,
            operatorResponsibilitiesAcknowledged: form.operatorResponsibilitiesAcknowledged,
            selectedTerritory: selected?.name ?? null,
          },
          consent: form.consent,
          website: form.website,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok || payload?.ok !== true) {
        const message =
          typeof payload?.error === "string" && payload.error.length <= 400
            ? payload.error
            : "We could not confirm receipt of your enquiry. Your details are still here; please try again shortly.";
        throw new Error(message);
      }
      setSubmitted({
        reference: typeof payload.reference === "string" && payload.reference.trim()
          ? payload.reference
          : null,
      });
    } catch (error) {
      setFormError(
        error instanceof Error && error.name !== "AbortError"
          ? error.message
          : "The connection timed out, so we could not confirm receipt. Your enquiry may have arrived; please wait before resubmitting.",
      );
    } finally {
      window.clearTimeout(timeout);
      setSending(false);
    }
  }

  const feeRows = [
    {
      name: "Royalty",
      price: programme.royaltyDisplay,
      copy: "The royalty rate and calculation basis are confirmed in your written quote before agreement.",
    },
    {
      name: "Marketing contribution",
      price: programme.marketingPercent + "% of net sales",
      copy: "The agreement defines the calculation basis. Additional local media spend is agreed separately.",
    },
    {
      name: "Full technology, including Haccora",
      price: technologyPrice + " per completed order",
      copy: "Covers all listed MealDeck software, including Haccora, across every ordering channel.",
    },
    {
      name: "Accountancy",
      price: money(programme.accountancyFeePerMonth) + " per month",
      copy: "The agreed monthly accountancy package. Your quote defines included work, frequency, service limits and charges for additional work.",
    },
    {
      name: "Supplies & packaging",
      price: "Per written quote",
      copy: "Opening supplies and packaging are itemised in full. Ongoing supplies are charged at the prices confirmed in your written quote.",
    },
    {
      name: "Administration & human compliance support",
      price: "Service quote",
      copy: "Any administration and human compliance support beyond the included package is specified and priced in writing. Haccora software remains included in the technology fee.",
    },
    {
      name: "Card processing fees charged by third parties",
      price: "Third-party rates",
      copy: "Your card provider's processing charges are separate from the MealDeck software fee.",
    },
    {
      name: "Marketplace commissions & courier delivery fees",
      price: "Provider terms",
      copy: "Actual marketplace commissions and courier delivery charges are separate from the software used to connect and manage those services.",
    },
  ];

  return (
    <div className="md-marketing-shell md-franchise-page">
      <SiteHeader context={<a href="#apply" className="md-btn md-btn-yellow">Register interest <ArrowRight aria-hidden="true" /></a>} />
      <main id="franchise-main">
        <section className="md-franchise-hero" aria-labelledby="franchise-title">
          <div className="md-franchise-hero-grid">
            <div>
              <p className="md-kicker">Turnkey MealDeck franchise · England & Wales</p>
              <h1 id="franchise-title">{marketingBrands.length} brands.<br /><span>Your kitchen.</span></h1>
              <p className="md-franchise-hero-lead">
                A turnkey multi-brand kitchen franchise with {marketingBrands.length} shared brands, menus,
                a selected location and agreed territory, equipment, opening supplies and full technology including Haccora.
                MealDeck brings the setup and support together. You run the kitchen, employ the team and fund
                its agreed operating costs.
              </p>
              <div className="md-franchise-hero-actions">
                <a href="#apply" className="md-btn md-btn-yellow">Register your interest <ArrowRight aria-hidden="true" /></a>
                <a href="#fees" className="md-btn md-btn-outline-light">Explore the costs</a>
              </div>
              <div className="md-franchise-proof">
                <span><Check aria-hidden="true" /> {marketingBrands.length} shared brands</span>
                <span><Check aria-hidden="true" /> Turnkey setup & support</span>
                <span><Check aria-hidden="true" /> You operate the kitchen</span>
              </div>
              <p className="md-franchise-hero-cost">
                <strong>Total upfront investment {money(programme.feeMin + programme.equipmentOpeningSuppliesFee)}–{money(programme.feeMax + programme.equipmentOpeningSuppliesFee)}, depending on location & territory</strong>
                <span>We supply the equipment your kitchen needs to run, with a full itemised inventory covering equipment, opening supplies and branded packaging. Any additional startup costs are confirmed in your written quote.</span>
              </p>
            </div>
            <div className="md-franchise-stack" aria-hidden="true">
              <div className="md-franchise-card-back md-franchise-card-back-left"><span>♥</span></div>
              <div className="md-franchise-card-back md-franchise-card-back-right"><span>♣</span></div>
              <div className="md-franchise-deal-card">
                <span className="md-franchise-card-corner">M<small>♦</small></span>
                <span className="md-franchise-card-count">{marketingBrands.length}</span>
                <strong>BRANDS</strong>
                <span className="md-franchise-card-rule" />
                <b>ONE KITCHEN.</b>
                <small>YOUR NEXT CHAPTER.</small>
                <span className="md-franchise-card-corner md-franchise-card-corner-bottom">M<small>♦</small></span>
              </div>
            </div>
          </div>
        </section>

        <nav className="md-franchise-section-nav" aria-label="Franchise information">
          <div>
            <a href="#model">The offer</a>
            <a href="#brands">The brands</a>
            <a href="#technology">Technology</a>
            <a href="#fees">Setup & fees</a>
            <a href="#responsibilities">Your role</a>
            <a href="#territories">Territories</a>
            <a href="#franchise-faqs">FAQs</a>
          </div>
        </nav>

        <section id="model" className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">The turnkey MealDeck offer</p>
            <h2>Your kitchen.<br />Our brands, systems & support.</h2>
            <p>
              The shared brand portfolio and menus, location and agreed territory, equipment and opening supplies,
              full technology including Haccora, training, compliance support, administration, marketing and accountancy
              come together in one franchise offer. We provide the setup and systems; you manage the kitchen and team
              and pay the agreed operating costs.
            </p>
          </div>
          <div className="md-franchise-benefit-grid">
            {provision.map(({ icon: Icon, title, copy }) => (
              <article key={title}>
                <Icon aria-hidden="true" />
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="brands" className="md-section md-section-cream md-franchise-divider">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">The shared MealDeck portfolio</p>
            <h2>{marketingBrands.length} brands.<br />One kitchen business.</h2>
            <p>
              Access all {marketingBrands.length} shared MealDeck concepts through the franchise programme.
              Your location's launch menu is agreed around equipment, training, supply and readiness.
            </p>
          </div>
          <div className="md-franchise-brand-grid">
            {marketingBrands.map((brand) => (
              <article className="md-franchise-brand" key={brand.id}>
                <div className="md-franchise-brand-art">
                  <span className="md-franchise-brand-corner" aria-hidden="true">{brand.rank}<small>{brand.suit}</small></span>
                  <img src={brand.logo} alt="" loading="lazy" width={160} height={100} />
                </div>
                <div><h3>{brand.name}</h3><p>{brand.category}</p></div>
              </article>
            ))}
          </div>
          <p className="md-franchise-note">
            This is the shared brand portfolio. Customer ordering menus reflect each kitchen's actual availability.
            Café1 is exclusive to St Albans.
          </p>
        </section>

        <section id="technology" className="md-section md-section-black">
          <div className="md-section-heading md-section-heading-light">
            <p className="md-kicker">Your technology package</p>
            <h2>From the first order<br />to the final handover.</h2>
            <p>
              KDS and printers. Website, app, WhatsApp and phone ordering. Delivery, aggregator integrations
              and AI, plus Haccora food safety and compliance tools. The complete offer is scoped and configured for your kitchen.
            </p>
          </div>
          <div className="md-franchise-tech-grid">
            {technology.map(({ icon: Icon, title, copy, label }) => (
              <article key={title}>
                <div className="md-franchise-tech-top"><Icon aria-hidden="true" /><span>{label}</span></div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="fees" className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">Your investment</p>
            <h2>One upfront investment.</h2>
            <p>
              MealDeck fits out your kitchen and provides a full itemised inventory. The total fee is
              {" "}{money(programme.feeMin + programme.equipmentOpeningSuppliesFee)}–{money(programme.feeMax + programme.equipmentOpeningSuppliesFee)},
              depending on your location and territory, and is confirmed in your written quote.
            </p>
          </div>
          <div className="md-franchise-setup-grid">
            <article>
              <span className="md-franchise-number">01</span>
              <h3>Franchise entry</h3>
              <strong>Brand & territory rights</strong>
              <p>Entry to the franchise programme with the agreed brand portfolio and territory rights, confirmed for your approved location.</p>
            </article>
            <article>
              <span className="md-franchise-number">02</span>
              <h3>Kitchen equipment</h3>
              <strong>Supplied by MealDeck</strong>
              <p>We supply the equipment your kitchen needs to run, including any specified KDS screens and printers, itemised in full. The schedule confirms installation, ownership, warranty and maintenance.</p>
            </article>
            <article>
              <span className="md-franchise-number">03</span>
              <h3>Opening supplies & packaging</h3>
              <strong>Ready to trade</strong>
              <p>Your initial food, ingredients, consumables and branded packaging are provided so the kitchen opens ready to trade from day one.</p>
            </article>
          </div>
          <div className="md-franchise-investment-note">
            <h3>Total upfront investment: {money(programme.feeMin + programme.equipmentOpeningSuppliesFee)}–{money(programme.feeMax + programme.equipmentOpeningSuppliesFee)}, depending on location and territory.</h3>
            <p>
              Your upfront investment covers franchise entry, the equipment to run your kitchen and your opening supplies
              and packaging. MealDeck supplies the equipment and provides a full itemised inventory, so you can see
              exactly what your investment includes.
            </p>
            <p>
              Budget additionally for premises rent and working capital. You also fund
              recruitment, salaries, utilities, food, packaging and other ongoing operating costs. The written quote confirms all inclusions
              and the payment terms.
            </p>
          </div>

          <div className="md-franchise-fee-heading">
            <p className="md-kicker md-kicker-red">Once you are trading</p>
            <h3>Ongoing fees, clearly separated.</h3>
            <p>The technology package covers the full software offer. Accountancy remains a monthly service. Your written quote confirms the royalty and service scope.</p>
          </div>
          <div className="md-franchise-table-wrap" tabIndex={0} role="region" aria-label="Ongoing franchise fee comparison">
            <table className="md-franchise-table">
              <caption>MealDeck ongoing franchise and service charges</caption>
              <thead><tr><th scope="col">Charge</th><th scope="col">Standard basis</th><th scope="col">What it covers</th></tr></thead>
              <tbody>
                {feeRows.map((fee) => (
                  <tr key={fee.name}><th scope="row">{fee.name}</th><td><strong>{fee.price}</strong></td><td>{fee.copy}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="md-franchise-note">
            Marketing is calculated on net sales;
            the agreement defines the treatment of refunds, discounts and sales channels. Card processing fees charged
            by third parties, marketplace commissions and actual courier delivery charges follow the relevant provider
            terms. The royalty and additional human services terms require a written quote.
          </p>
        </section>

        <section id="responsibilities" className="md-section md-section-cream md-franchise-divider">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">How we work together</p>
            <h2>A clear role on both sides.</h2>
            <p>
              You own the responsibility for running the kitchen and employing your team.
              MealDeck supplies the agreed package and supports the business around it.
            </p>
          </div>
          <div className="md-franchise-table-wrap" tabIndex={0} role="region" aria-label="MealDeck and franchise operator responsibilities">
            <table className="md-franchise-table md-franchise-responsibilities">
              <caption>What MealDeck provides and what the franchisee operates or funds</caption>
              <thead><tr><th scope="col">Area</th><th scope="col">MealDeck provides</th><th scope="col">You operate or fund</th></tr></thead>
              <tbody>
                {responsibilities.map((row) => (
                  <tr key={row.area}><th scope="row">{row.area}</th><td>{row.mealdeck}</td><td>{row.operator}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md-franchise-model-grid">
            <article><span>01</span><h3>Owner-operator</h3><p>Lead your kitchen directly, hire the team and manage service, stock and local execution with MealDeck support.</p></article>
            <article><span>02</span><h3>Multi-unit operator</h3><p>Operate several approved kitchens through your own management teams. Each location has its own agreed territory, setup and operating responsibilities.</p></article>
          </div>
        </section>

        <section className="md-section md-section-black">
          <div className="md-section-heading md-section-heading-light">
            <p className="md-kicker">Existing allocations</p>
            <h2>These locations are taken.</h2>
            <p>The areas below are already allocated and are not being offered for sale through this enquiry form.</p>
          </div>
          <div className="md-franchise-market-grid">
            {TAKEN_MARKETS.map((market) => (
              <article key={market.name} className="md-franchise-market">
                <MapPin aria-hidden="true" />
                <div><h3>{market.name}</h3><strong>Taken</strong></div>
              </article>
            ))}
          </div>
        </section>

        <section id="territories" className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">Find your area</p>
            <h2>Where would you<br />like to operate?</h2>
            <p>
              Explore the London rollout areas or tell us your preferred town in England or Wales.
              Planned areas are open for registering interest; a location, boundary and fee are confirmed after assessment.
            </p>
          </div>
          <div className="md-franchise-availability" role="status" aria-live="polite">
            <MapPin aria-hidden="true" />
            <p>
              {loadState === "loading"
                ? "Checking live territory information. Planned areas can be selected for an enquiry."
                : loadState === "error"
                  ? "Live availability could not be checked. Areas shown below are for registering interest only."
                  : "Live territory information checked. An enquiry does not reserve a territory or take a payment."}
            </p>
            {loadState === "error" && <button type="button" onClick={() => setReloadCount((value) => value + 1)}>Check again</button>}
          </div>
          <div className="md-franchise-territory-grid">
            {londonCards.map((territory) => {
              const confirmed = confirmedCodes.has(territory.code);
              return (
                <article key={territory.code} className="md-franchise-territory-card">
                  <div className="md-franchise-territory-top">
                    <span>{territory.region}</span>
                    <span className={"md-franchise-status" + (confirmed ? " is-available" : "")}>{territoryStatus(territory, confirmed)}</span>
                  </div>
                  <h3>{territory.name}</h3>
                  {territory.note && <p>{territory.note}</p>}
                  <div className="md-franchise-territory-fee">
                    {confirmed && territory.fee !== null
                      ? <><span>Upfront investment</span><strong>{money(territory.fee + programme.equipmentOpeningSuppliesFee)}</strong></>
                      : <span>Location, boundary & fee to be confirmed.</span>}
                  </div>
                  <button type="button" className="md-franchise-territory-action" disabled={!canRegisterInterest(territory)} onClick={() => choose(territory)}>
                    {canRegisterInterest(territory) ? (confirmed ? "Enquire about this area" : "Register interest") : territoryStatus(territory, false)}
                    {canRegisterInterest(territory) && <ArrowRight aria-hidden="true" />}
                    <span className="md-franchise-sr-only"> in {territory.name}</span>
                  </button>
                </article>
              );
            })}
          </div>

          <div className="md-franchise-search">
            <div>
              <p className="md-kicker md-kicker-red">England & Wales</p>
              <h3>Search a town, city or region.</h3>
              <p>You can enquire about an area even if it is not listed yet.</p>
            </div>
            <label htmlFor="franchise-territory-search">Search the territory list</label>
            <div className="md-franchise-search-field">
              <Search aria-hidden="true" />
              <input id="franchise-territory-search" type="search" maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Manchester, Cardiff, Bristol…" aria-describedby="franchise-search-status" />
            </div>
            <p id="franchise-search-status" className="md-franchise-search-status" role="status" aria-live="polite">
              {query.trim() ? (matches.length ? matches.length + " matching areas shown." : "No matching area found. Add your preferred town in the enquiry form.") : "Search by place, region or territory code."}
            </p>
            {query.trim() && matches.length > 0 && (
              <ul className="md-franchise-search-results">
                {matches.map((territory) => {
                  const confirmed = confirmedCodes.has(territory.code);
                  return (
                    <li key={territory.code}>
                      <button type="button" disabled={!canRegisterInterest(territory)} onClick={() => choose(territory)}>
                        <span><strong>{territory.name}</strong><small>{territory.region} · {territory.code}</small></span>
                        <span><b>{territoryStatus(territory, confirmed)}</b>{confirmed && territory.fee !== null && <small>{money(territory.fee + programme.equipmentOpeningSuppliesFee)} upfront</small>}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <a href="#apply" className="md-franchise-text-link">Tell us another area <ArrowRight aria-hidden="true" /></a>
          </div>
          <div className="md-franchise-model-grid md-franchise-territory-explainer">
            <article>
              <span>YOUR CORE</span><h3>A defined territory.</h3>
              <p>We assess practical delivery routes, local households and neighbouring kitchens. The final mapped core and any exclusivity conditions are set out in your agreement.</p>
            </article>
            <article>
              <span>YOUR DELIVERY EDGE</span><h3>Practical local coverage.</h3>
              <p>Shared delivery edges and overflow depend on journey time, kitchen capacity and service quality. They are agreed separately from your protected core.</p>
            </article>
          </div>
        </section>

        <section className="md-section md-section-black">
          <div className="md-section-heading md-section-heading-light">
            <p className="md-kicker">How launch works</p>
            <h2>From enquiry to opening day.</h2>
          </div>
          <div className="md-franchise-step-grid">
            {launchSteps.map(([number, title, copy]) => (
              <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>
            ))}
          </div>
        </section>

        <section id="franchise-faqs" className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">Before you apply</p>
            <h2>Your franchise questions.</h2>
          </div>
          <div className="md-franchise-faq-list">
            {faqs.map((faq) => (
              <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>
            ))}
          </div>
        </section>

        <section id="apply" className="md-section md-section-cream md-franchise-divider">
          <div className="md-franchise-apply-grid">
            <div>
              <p className="md-kicker md-kicker-red">Register your interest</p>
              <h2>Let's discuss<br />your kitchen.</h2>
              <p>
                Tell us where you want to operate and the experience you bring.
                The team will review your enquiry, assess the area and discuss the full package.
              </p>
              <div className="md-franchise-fee-box">
                <span>Total upfront investment · paid upfront</span>
                <strong>{selectedLive?.fee != null ? money(selectedLive.fee + programme.equipmentOpeningSuppliesFee) : money(programme.feeMin + programme.equipmentOpeningSuppliesFee) + "–" + money(programme.feeMax + programme.equipmentOpeningSuppliesFee)}</strong>
                <p>Covers franchise entry, the equipment to run your kitchen and opening supplies & packaging. We provide a full itemised inventory.</p>
                <small>
                  Depending on location and territory. Premises and working capital are additional.
                </small>
                <small>
                  Technology package including Haccora: {technologyPrice} per completed order. Accountancy: {money(programme.accountancyFeePerMonth)}/month.
                  Marketing: {programme.marketingPercent}% of net sales. Royalty: {programme.royaltyDisplay}.
                </small>
              </div>
              {selected && (
                <div className="md-franchise-selection" role="status">
                  <MapPin aria-hidden="true" />
                  <p><strong>{selected.name}</strong><span>{selectedIsConfirmed ? "Selected for an availability enquiry." : "Selected for registering interest. Location and availability need confirmation."}</span></p>
                </div>
              )}
              <p className="md-franchise-application-note">This is an enquiry. It does not reserve an area, create a franchise agreement or take a payment.</p>
            </div>

            {submitted ? (
              <div ref={successRef} tabIndex={-1} className="md-franchise-success" role="status">
                <Sparkles aria-hidden="true" />
                <h3>Enquiry received.</h3>
                <p>Thank you. Your enquiry has been recorded for the MealDeck team to review and follow up.</p>
                {submitted.reference && <p className="md-franchise-reference">Your reference: <strong>{submitted.reference}</strong></p>}
                <p>Your preferred area remains subject to assessment and availability.</p>
              </div>
            ) : (
              <form className="md-franchise-form" onSubmit={submit} aria-busy={sending}>
                <p className="md-franchise-form-intro">Required fields are marked with an asterisk (*).</p>
                {formError && <p ref={errorRef} tabIndex={-1} id="franchise-form-error" className="md-franchise-form-error" role="alert">{formError}</p>}
                <fieldset disabled={sending} className="md-franchise-form-fields">
                  <legend className="md-franchise-sr-only">Your franchise enquiry</legend>
                  <label className="md-franchise-honeypot" aria-hidden="true">Website
                    <input name="website" tabIndex={-1} autoComplete="off" maxLength={200} value={form.website} onChange={(event) => setForm((value) => ({ ...value, website: event.target.value }))} />
                  </label>
                  <label htmlFor="franchise-name"><span>Full name *</span><input id="franchise-name" name="name" required autoComplete="name" maxLength={120} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} /></label>
                  <div className="md-franchise-form-pair">
                    <label htmlFor="franchise-email"><span>Email *</span><input id="franchise-email" name="email" required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} /></label>
                    <label htmlFor="franchise-phone"><span>Phone (optional)</span><input id="franchise-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} /></label>
                  </div>
                  <label htmlFor="franchise-area"><span>Preferred town or territory *</span><input id="franchise-area" name="preferredArea" required maxLength={160} value={form.area} onChange={(event) => { setSelected(null); setForm((value) => ({ ...value, area: event.target.value })); }} placeholder="e.g. Southall, Leeds, Bristol" /></label>
                  <label htmlFor="franchise-operator-model">
                    <span>How will you operate? *</span>
                    <select id="franchise-operator-model" name="operatorModel" required value={form.operatorModel} onChange={(event) => setForm((value) => ({ ...value, operatorModel: event.target.value as OperatorModel }))}>
                      <option value="owner_operator">Owner-operator — one kitchen</option>
                      <option value="multi_unit_operator">Multi-unit operator — several kitchens</option>
                    </select>
                  </label>
                  <label htmlFor="franchise-business"><span>Existing business or kitchen (optional)</span><input id="franchise-business" name="existingBusiness" autoComplete="organization" maxLength={200} value={form.existingBusiness} onChange={(event) => setForm((value) => ({ ...value, existingBusiness: event.target.value }))} placeholder="Business name or current kitchen" /></label>
                  <label htmlFor="franchise-experience"><span>Operating or management experience (optional)</span><textarea id="franchise-experience" name="operatingExperience" rows={4} maxLength={2000} value={form.operatingExperience} onChange={(event) => setForm((value) => ({ ...value, operatingExperience: event.target.value }))} placeholder="Tell us about your experience running a team or a food business." /></label>
                  <div className="md-franchise-form-pair">
                    <label htmlFor="franchise-capital"><span>Total investment budget, £ (optional)</span><input id="franchise-capital" name="capital" type="number" inputMode="decimal" min={0} max={10000000} step="0.01" value={form.capital} onChange={(event) => setForm((value) => ({ ...value, capital: event.target.value }))} aria-describedby="franchise-capital-help" /></label>
                    <label htmlFor="franchise-timing"><span>Target launch timing (optional)</span><select id="franchise-timing" name="launchTiming" value={form.launchTiming} onChange={(event) => setForm((value) => ({ ...value, launchTiming: event.target.value }))}><option value="">Select timing</option><option>0–3 months</option><option>3–6 months</option><option>6–12 months</option><option>12+ months</option><option>Exploring my options</option></select></label>
                  </div>
                  <p id="franchise-capital-help" className="md-franchise-form-small">Your budget should cover setup and working capital. This field is not a payment instruction.</p>
                  <label className="md-franchise-check"><input name="existingKitchen" type="checkbox" checked={form.existingKitchen} onChange={(event) => setForm((value) => ({ ...value, existingKitchen: event.target.checked }))} /><span>I already have access to a commercial kitchen.</span></label>
                  <label className="md-franchise-check"><input name="multiUnitInterest" type="checkbox" checked={form.multiUnit} onChange={(event) => setForm((value) => ({ ...value, multiUnit: event.target.checked }))} /><span>I would also like to discuss multiple territories.</span></label>
                  <div className="md-franchise-acknowledgements">
                    <p>Please confirm *</p>
                    <label className="md-franchise-check"><input name="setupPackageAcknowledged" type="checkbox" required checked={form.setupPackageAcknowledged} onChange={(event) => setForm((value) => ({ ...value, setupPackageAcknowledged: event.target.checked }))} /><span>I understand that the total upfront investment of {money(programme.feeMin + programme.equipmentOpeningSuppliesFee)}–{money(programme.feeMax + programme.equipmentOpeningSuppliesFee)}, depending on location and territory, is payable upfront. Any separately agreed extra setup, premises and working capital are additional.</span></label>
                    <label className="md-franchise-check"><input name="operatorResponsibilitiesAcknowledged" type="checkbox" required checked={form.operatorResponsibilitiesAcknowledged} onChange={(event) => setForm((value) => ({ ...value, operatorResponsibilitiesAcknowledged: event.target.checked }))} /><span>I will be responsible for running and staffing the kitchen, rent, salaries, utilities, stock and packaging purchases, and the agreed franchise and service fees.</span></label>
                  </div>
                  <div className="md-franchise-privacy">
                    <h3>How your enquiry is used</h3>
                    <p>MealDeck uses these details to review your franchise enquiry and arrange follow-up. Access is limited to the team and service providers handling the application process. You can ask MealDeck to update your details or stop contact.</p>
                  </div>
                  <label className="md-franchise-check"><input name="consent" type="checkbox" required checked={form.consent} onChange={(event) => setForm((value) => ({ ...value, consent: event.target.checked }))} /><span>MealDeck may contact me about this enquiry and its follow-up. *</span></label>
                </fieldset>
                <button type="submit" className="md-btn md-btn-red" disabled={sending}>{sending ? "Sending your enquiry…" : "Submit franchise enquiry"} {!sending && <ArrowRight aria-hidden="true" />}</button>
                <p className="md-franchise-form-small">Your enquiry is confirmed only when the receipt message appears. No territory reservation or payment is made here.</p>
              </form>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
