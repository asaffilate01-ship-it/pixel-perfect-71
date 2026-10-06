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
      title: "MealDeck Franchise — All Your Brands. One Kitchen.",
      description:
        "Run a MealDeck kitchen with our shared brands, location and territory support, supplied equipment, technology, supplies, marketing, accountancy and operational support. Explore the setup costs and register your interest.",
      path: "/franchise",
      keywords:
        "MealDeck franchise, cloud kitchen franchise UK, multi brand food franchise, takeaway franchise, kitchen franchise England Wales",
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
    copy: "MealDeck supplies the agreed equipment package. Its cost is itemised in your initial setup quote.",
  },
  {
    icon: MonitorSmartphone,
    title: "A connected technology package",
    copy: "KDS, printers, ordering channels, delivery, integrations, AI and Haccora food safety tools, configured for your location.",
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
    copy: "Onboarding, operating procedures, franchise administration and a team to support your kitchen.",
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
    copy: "Kitchen display screens, order routing and ticket printing to help your team prepare and hand over orders.",
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
    copy: "Haccora food safety and compliance tools for the checks and records agreed for your kitchen, with access, setup and training arranged during onboarding.",
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
    operator: "Pay the agreed rent, premises deposit, utilities, rates and site operating costs.",
  },
  {
    area: "Equipment",
    mealdeck: "Supply the equipment listed in the setup package and agree installation arrangements.",
    operator: "Pay the equipment setup charge and fulfil the agreed care, maintenance and replacement duties.",
  },
  {
    area: "Technology",
    mealdeck: "Provide the agreed hardware, platform setup, channel configuration, Haccora access and ongoing support.",
    operator: "Pay setup and recurring technology charges, use the system and fund agreed provider or usage costs.",
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
    question: "What does the base franchise fee cover?",
    answer:
      "The base fee is for entry to the MealDeck franchise programme and the agreed brand and territory rights. The current range is " + money(DEFAULT_PROGRAMME.feeMin) + "–" + money(DEFAULT_PROGRAMME.feeMax) + ", with the fee confirmed for your location. Equipment and opening supplies/packaging share a separate combined planning budget. Technology setup and hardware are quoted separately. The written quote confirms the full investment.",
  },
  {
    question: "Does MealDeck provide the equipment?",
    answer:
      "Yes. MealDeck supplies the equipment agreed for the approved kitchen, and the franchisee pays the quoted equipment package charge. The schedule specifies the equipment, installation scope, ownership or hire terms, warranty, maintenance and replacement responsibilities.",
  },
  {
    question: "What does the approximately " + money(DEFAULT_PROGRAMME.equipmentOpeningSuppliesEstimate) + " setup estimate cover?",
    answer:
      "The approximately " + money(DEFAULT_PROGRAMME.equipmentOpeningSuppliesEstimate) + " estimate covers kitchen equipment and opening supplies and packaging combined. The quote itemises both within that one budget; no fixed split between equipment and stock is assumed. Adding the base fee gives an approximate planning subtotal of " + money(DEFAULT_PROGRAMME.feeMin + DEFAULT_PROGRAMME.equipmentOpeningSuppliesEstimate) + "–" + money(DEFAULT_PROGRAMME.feeMax + DEFAULT_PROGRAMME.equipmentOpeningSuppliesEstimate) + ". Technology setup and hardware, premises and deposits, applicable VAT, and working capital are additional. The final site quote may differ from this planning estimate.",
  },
  {
    question: "How are supplies and packaging charged?",
    answer:
      "Items MealDeck buys directly are supplied at their purchase cost, with a " + DEFAULT_PROGRAMME.boughtInSupplyMarkupPercent + "% supply markup. MealDeck-manufactured products use the total of ingredients, production labour and other allocable production costs, then add a " + DEFAULT_PROGRAMME.manufacturedSupplyMarkupPercent + "% markup to that total. The supply catalogue and written quote identify each item's category, cost basis and any separately agreed delivery or tax charges.",
  },
  {
    question: "Who runs the kitchen and employs the staff?",
    answer:
      "The franchisee runs the kitchen, recruits and manages the team, and pays staffing and operating costs. The offer is designed for an owner-operator or a business operating several kitchens. A multi-unit operator remains responsible for the teams and performance of each location.",
  },
  {
    question: "How is the technology activated?",
    answer:
      "The monthly technology package is " + money(DEFAULT_PROGRAMME.techFeePerMonth) + ". The offer covers KDS and printers, web and app ordering, WhatsApp and phone, delivery management, aggregator integration, AI tools and Haccora food safety software. Setup and hardware are quoted separately. We agree the included software access, channels, allowances and support, then configure and test the agreed tools and complete provider onboarding before activation. Additional provider or usage charges are recorded in your technology schedule.",
  },
  {
    question: "Is Haccora part of the technology package?",
    answer:
      "Yes. Haccora food safety and compliance tools form part of the MealDeck technology offer. The " + money(DEFAULT_PROGRAMME.techFeePerMonth) + " monthly technology package has a written scope defining Haccora access, included features, training and support. Any separately agreed implementation or human compliance support is itemised in the quote. Your team carries out the required checks and keeps the operating records.",
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
      "The accountancy package is " + money(DEFAULT_PROGRAMME.accountancyFeePerMonth) + " per month. Its written scope specifies the included work, reporting frequency, transaction or payroll limits and charges for additional work. The compliance schedule defines the tools, training and support provided. You continue to run the business, provide accurate records and carry out the operator's required checks and responsibilities.",
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
      copy: "Net sales exclude VAT; the agreement defines the calculation basis. Additional local media spend is agreed separately.",
    },
    {
      name: "Technology",
      price: money(programme.techFeePerMonth) + " per month",
      copy: "The monthly kitchen technology package. Your schedule defines included platform and Haccora access, support and usage allowances. Setup and hardware are quoted separately.",
    },
    {
      name: "Accountancy",
      price: money(programme.accountancyFeePerMonth) + " per month",
      copy: "The agreed monthly accountancy package. Your quote defines included work, frequency, service limits and charges for additional work.",
    },
    {
      name: "Bought-in supplies & packaging",
      price: "Purchase cost (" + programme.boughtInSupplyMarkupPercent + "% markup)",
      copy: "Items MealDeck buys directly are supplied at their purchase cost.",
    },
    {
      name: "MealDeck-manufactured products",
      price: "Production cost + " + programme.manufacturedSupplyMarkupPercent + "%",
      copy: "Ingredients, production labour and other allocable production costs are totalled first; the markup applies to that fully costed production total.",
    },
    {
      name: "Administration & compliance support",
      price: "Service quote",
      copy: "Any administration and human compliance support beyond the included package is specified and priced in your written service schedule.",
    },
    {
      name: "Provider & additional channel costs",
      price: "Provider terms / quote",
      copy: "Payment processing, couriers, aggregator commissions, connectors, messaging, calls and additional AI usage where applicable.",
    },
  ];

  return (
    <div className="md-marketing-shell md-franchise-page">
      <SiteHeader context={<a href="#apply" className="md-btn md-btn-yellow">Register interest <ArrowRight aria-hidden="true" /></a>} />
      <main id="franchise-main">
        <section className="md-franchise-hero" aria-labelledby="franchise-title">
          <div className="md-franchise-hero-grid">
            <div>
              <p className="md-kicker">MealDeck franchise · England & Wales</p>
              <h1 id="franchise-title">{marketingBrands.length} brands.<br /><span>Your kitchen.</span></h1>
              <p className="md-franchise-hero-lead">
                Build your local food business with the MealDeck brands, a selected location and territory,
                equipment, technology and business support. You lead the team and run the kitchen.
              </p>
              <div className="md-franchise-hero-actions">
                <a href="#apply" className="md-btn md-btn-yellow">Register your interest <ArrowRight aria-hidden="true" /></a>
                <a href="#fees" className="md-btn md-btn-outline-light">Explore the costs</a>
              </div>
              <div className="md-franchise-proof">
                <span><Check aria-hidden="true" /> Shared brand portfolio</span>
                <span><Check aria-hidden="true" /> Location & territory</span>
                <span><Check aria-hidden="true" /> Equipment supplied</span>
              </div>
              <p className="md-franchise-hero-cost">
                <strong>Base franchise fee {money(programme.feeMin)}–{money(programme.feeMax)}</strong>
                <span>Plus approximately {money(programme.equipmentOpeningSuppliesEstimate)} combined for equipment and opening supplies & packaging. Technology setup and hardware are quoted separately.</span>
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
            <p className="md-kicker md-kicker-red">The franchise offer</p>
            <h2>We provide the package.<br />You operate the kitchen.</h2>
            <p>
              MealDeck brings the brands, equipment, supply network and support services together.
              Your quote separates what you pay at setup from the ongoing services and operating costs.
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
            <p className="md-kicker md-kicker-red">Your brand portfolio</p>
            <h2>A menu for more cravings.</h2>
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
          <div className="md-franchise-tech-note">
            <ClipboardCheck aria-hidden="true" />
            <p>
              <strong>Technology: {money(programme.techFeePerMonth)} per month.</strong> Your written schedule defines
              the included platform, Haccora access, channels, AI features, support and usage allowances.
              Setup and hardware are quoted separately. We configure and test the agreed tools before activation,
              including any provider onboarding. Third-party approvals, regional availability and additional
              provider or usage charges are confirmed in the schedule.
            </p>
          </div>
        </section>

        <section id="fees" className="md-section md-section-cream">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">Your investment</p>
            <h2>Four parts to your setup.</h2>
            <p>
              The equipment and opening supplies & packaging share one combined planning estimate of approximately{" "}
              {money(programme.equipmentOpeningSuppliesEstimate)}. The base franchise fee is additional, and technology
              setup and hardware are quoted separately. All four lines are itemised for your location.
            </p>
          </div>
          <div className="md-franchise-setup-grid">
            <article>
              <span className="md-franchise-number">01</span>
              <h3>Base franchise fee</h3>
              <strong>{money(programme.feeMin)}–{money(programme.feeMax)}</strong>
              <p>Entry to the franchise programme and agreed brand and territory rights. Final fee depends on the approved opportunity.</p>
            </article>
            <article>
              <span className="md-franchise-number">02</span>
              <h3>Equipment package</h3>
              <strong>Within the combined budget</strong>
              <p>Kitchen equipment supplied by MealDeck and itemised within the combined equipment and opening-stock estimate. Installation and site requirements are agreed in the quote.</p>
            </article>
            <article>
              <span className="md-franchise-number">03</span>
              <h3>Technology setup</h3>
              <strong>Separate itemised quote</strong>
              <p>KDS screens, printers, platform and channel setup, menu configuration, onboarding and training within the agreed scope.</p>
            </article>
            <article>
              <span className="md-franchise-number">04</span>
              <h3>Opening supplies & packaging</h3>
              <strong>Within the combined budget</strong>
              <p>The initial food, ingredients, consumables and branded packaging are itemised within the same combined equipment and opening-stock estimate.</p>
            </article>
          </div>
          <div className="md-franchise-investment-note">
            <h3>Planning subtotal: approximately {money(programme.feeMin + programme.equipmentOpeningSuppliesEstimate)}–{money(programme.feeMax + programme.equipmentOpeningSuppliesEstimate)}.</h3>
            <p>
              This adds the base franchise fee to the single approximate {money(programme.equipmentOpeningSuppliesEstimate)}{" "}
              equipment and opening supplies & packaging budget. Equipment and stock are itemised within that
              combined estimate, with no fixed split assumed.
            </p>
            <p>
              Technology setup and hardware, premises and deposits, applicable VAT, and working capital are
              additional. You also fund recruitment, salaries, utilities and other operating costs.
              The final site quote confirms the full investment, payment schedule, equipment ownership or hire,
              installation, warranty, maintenance and replacement responsibilities.
            </p>
          </div>

          <div className="md-franchise-fee-heading">
            <p className="md-kicker md-kicker-red">Once you are trading</p>
            <h3>Ongoing fees, clearly separated.</h3>
            <p>The monthly technology and accountancy prices are shown below. Your written quote confirms the royalty, included services, allowances and any additional charges.</p>
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
            Business fees shown exclude VAT where applicable. Marketing is calculated on net sales excluding VAT;
            the agreement defines the treatment of refunds, discounts and sales channels. The supply catalogue identifies
            bought-in and manufactured items and their cost basis. Any separately agreed delivery, provider or additional
            service charges are itemised before you commit. The royalty is confirmed in the written quote.
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
                <div><h3>{market.name}</h3><strong>Taken</strong>{market.note && <p>{market.note}</p>}</div>
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
                      ? <><span>Base franchise fee</span><strong>{money(territory.fee)}</strong></>
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
                        <span><b>{territoryStatus(territory, confirmed)}</b>{confirmed && territory.fee !== null && <small>{money(territory.fee)} base fee</small>}</span>
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
                <span>Base franchise fee</span>
                <strong>{selectedLive?.fee != null ? money(selectedLive.fee) : money(programme.feeMin) + "–" + money(programme.feeMax)}</strong>
                <p>Plus approximately {money(programme.equipmentOpeningSuppliesEstimate)} combined for equipment and opening supplies & packaging.</p>
                <small>
                  Planning subtotal: approximately {selectedLive?.fee != null
                    ? money(selectedLive.fee + programme.equipmentOpeningSuppliesEstimate)
                    : money(programme.feeMin + programme.equipmentOpeningSuppliesEstimate) + "–" + money(programme.feeMax + programme.equipmentOpeningSuppliesEstimate)}.
                  Technology setup and hardware, premises, applicable VAT and working capital are additional.
                </small>
                <small>
                  Technology {money(programme.techFeePerMonth)}/month · Accountancy {money(programme.accountancyFeePerMonth)}/month.
                  Marketing {programme.marketingPercent}% of net sales excluding VAT. Royalty: {programme.royaltyDisplay}.
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
                    <label className="md-franchise-check"><input name="setupPackageAcknowledged" type="checkbox" required checked={form.setupPackageAcknowledged} onChange={(event) => setForm((value) => ({ ...value, setupPackageAcknowledged: event.target.checked }))} /><span>I understand that approximately {money(programme.equipmentOpeningSuppliesEstimate)} covers equipment and opening supplies/packaging combined. The base franchise fee, separately quoted technology setup and hardware, premises, applicable VAT and working capital are additional.</span></label>
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
