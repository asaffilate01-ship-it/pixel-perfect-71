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

const provision = [
  {
    icon: Boxes,
    title: "The MealDeck brand portfolio",
    copy: "Access to all shared MealDeck brands, recipes, menu standards, brand assets and operating guidance.",
  },
  {
    icon: MapPin,
    title: "Location & territory",
    copy: "We source and assess the location, agree your territory, hold the premises lease and pay the premises deposit.",
  },
  {
    icon: ChefHat,
    title: "Kitchen equipment",
    copy: "The agreed kitchen equipment, KDS screens and printers are included in your launch package, with a full itemised inventory.",
  },
  {
    icon: MonitorSmartphone,
    title: "A connected technology package",
    copy: "MealDeck, Dishbee integration, Dishbee Buzz and Haccora bring ordering, kitchen workflows, delivery, marketing and food safety tools together.",
  },
  {
    icon: PackageCheck,
    title: "Supplies & packaging",
    copy: "Opening stock and branded packaging are included. We coordinate ongoing food, ingredients and packaging purchases through our supply programme.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance support",
    copy: "Haccora food safety tools, procedures, allergen guidance, record keeping, training and operational review within the agreed service.",
  },
  {
    icon: ClipboardCheck,
    title: "Administration & support",
    copy: "Onboarding, team training, routine menu administration and approved bill and salary payment administration using your kitchen's funds.",
  },
  {
    icon: Megaphone,
    title: "Marketing",
    copy: "Brand creative, launch planning, customer engagement and local and national marketing within your agreed programme.",
  },
  {
    icon: ReceiptText,
    title: "Accounts & payroll",
    copy: "Bookkeeping, reconciliations, reporting and payroll processing, with the work and service scope agreed for your kitchen.",
  },
];

const technology = [
  {
    icon: Printer,
    title: "KDS & order printers",
    copy: "Kitchen display, order routing and printing software, with the agreed screens and printers included in your launch inventory.",
    label: "Kitchen hardware",
  },
  {
    icon: MonitorSmartphone,
    title: "Website & online ordering",
    copy: "MealDeck ordering and Dishbee integration with location menus, a shared basket, collection and delivery options.",
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
    copy: "We support aggregator onboarding and connect approved marketplace accounts and order feeds, subject to each provider's approval.",
    label: "Connected channels",
  },
  {
    icon: ShieldCheck,
    title: "Haccora food safety",
    copy: "Haccora is part of your technology package, with access, configuration and training for food safety procedures, checks and records.",
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
    title: "Dishbee Buzz & business tools",
    copy: "Dishbee Buzz supports customer engagement alongside sales, orders, reporting and team access in your connected business tools.",
    label: "Customers & insights",
  },
];

const responsibilities = [
  {
    area: "Brands & kitchen standards",
    mealdeck: "Provide shared brand access, recipes, training and operating procedures.",
    operator: "Prepare good quality food, pack accurately and dispatch orders on time to the agreed brand standards.",
  },
  {
    area: "Premises & territory",
    mealdeck: "Source and assess the location, agree the territory, hold the lease and pay the premises deposit.",
    operator: "Pay the agreed rent, utilities, rates and site operating costs. You do not pay the premises deposit.",
  },
  {
    area: "Equipment",
    mealdeck: "Supply the equipment listed in the setup package and agree installation arrangements.",
    operator: "Fund the agreed upfront investment and fulfil the agreed equipment care, maintenance and replacement duties.",
  },
  {
    area: "Technology",
    mealdeck: "Provide the agreed hardware, platform setup, channel configuration, Haccora access and ongoing support.",
    operator: "Use the systems, pay the agreed ongoing fees and fund third-party card, marketplace and delivery charges.",
  },
  {
    area: "Supplies & packaging",
    mealdeck: "Provide opening stock and packaging, and coordinate ongoing procurement and replenishment.",
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
    mealdeck: "Manage the agreed brand, launch, local and national marketing programme.",
    operator: "Pay the marketing contribution, fund any agreed additional local spend and support local activity.",
  },
  {
    area: "Accountancy & administration",
    mealdeck: "Manage agreed bookkeeping, reconciliations, reporting, payroll, routine menu administration and approved bill and salary payment administration.",
    operator: "Provide accurate records, timesheets and approvals, and fund bills, wages and taxes. You remain the employer and responsible for the business's liabilities.",
  },
];

const launchSteps = [
  ["01", "Tell us about your plans", "Share your preferred area, operating experience and investment budget."],
  ["02", "Assess the fit", "We review the operator, proposed location, territory and equipment needs."],
  ["03", "Agree the full package", "Review your all-inclusive launch quote, monthly service scope, territory and agreements."],
  ["04", "Equip, train & configure", "Prepare the kitchen, supply equipment and stock, train the team and test the agreed channels."],
  ["05", "Complete launch checks", "Confirm operating readiness, delivery arrangements and your launch marketing plan."],
  ["06", "Open & operate", "You manage the team and daily service, with MealDeck's ongoing supply and business support."],
];

const faqs = [
  {
    question: "What makes MealDeck a turnkey franchise?",
    answer:
      "MealDeck brings together the shared brands and menus, a selected location and agreed territory, kitchen equipment, opening stock and packaging, technology, onboarding and training. Ongoing support brings together the systems, supply coordination, compliance support, marketing, accounts and administration within your agreed service scope. You focus on good food, timely dispatch and running your team, while funding the kitchen's operating costs. Opening follows the location's approvals and readiness checks.",
  },
  {
    question: "What does the upfront investment cover?",
    answer:
      "Your all-inclusive launch package covers franchise entry, the agreed brand and territory rights, location onboarding, the agreed kitchen equipment and hardware, opening stock and branded packaging, technology setup and launch training. The final package and inventory are confirmed for your location in a written quote before you commit. Rent, staffing, ongoing supplies and other running costs are funded by your kitchen.",
  },
  {
    question: "Who holds the lease and pays the premises deposit?",
    answer:
      "MealDeck holds the premises lease and pays the premises deposit, which MealDeck recovers at the end of the term. You do not pay the premises deposit. Your written premises arrangement confirms the rent you pay and the responsibilities for rates, utilities, repairs and access.",
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
      "The agreed technology package includes MealDeck, Dishbee integration, Dishbee Buzz and Haccora, together with KDS and printing, web and app ordering, WhatsApp and phone workflows, delivery system integration, supported aggregator connections, AI tools and ongoing support. Channels and integrations are configured for your kitchen, with provider approvals where required. Ongoing pricing is available on application; card processing, marketplace commissions and actual delivery charges follow the relevant third-party terms.",
  },
  {
    question: "What does the monthly service provide?",
    answer:
      "Your agreed service brings together brand and operational support, technology, local and national marketing, procurement coordination, compliance support, accounts, payroll and administration. We can manage routine menu updates and administer approved bill and salary payments using your kitchen's funds. The written service schedule confirms the included work, payment approvals and any additional services. All ongoing fees are price on application.",
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
      "The agreed accounts and administration service covers bookkeeping, reconciliations, reporting and payroll processing, with filing work, frequency and service limits confirmed in writing. Haccora is included in the technology package, alongside agreed training and compliance support. You provide accurate records and approvals, fund your bills, wages and taxes, and remain responsible for employing the team and carrying out the kitchen's required food safety checks.",
  },
  {
    question: "Are ongoing supplies and packaging included in the monthly service?",
    answer:
      "Your launch package includes the agreed opening stock and packaging. Ongoing food, ingredients and packaging are purchased through the supply programme under your quoted terms. We coordinate procurement and reconcile supply invoices and credits with the other charges, taking account of payments already made.",
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
      setFormError("Please confirm that you understand the launch package and operator responsibilities.");
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

  const serviceRows = [
    {
      name: "Brands & franchise support",
      copy: "Shared brand access, approved menus and recipes, operating guidance, team training and ongoing franchise support.",
    },
    {
      name: "Full technology & support",
      copy: "MealDeck, Dishbee integration, Dishbee Buzz and Haccora, with ordering channels, kitchen systems, delivery and aggregator integrations, AI tools and support.",
    },
    {
      name: "Local & national marketing",
      copy: "Brand creative, launch and ongoing campaigns, customer engagement and agreed local and national marketing activity.",
    },
    {
      name: "Accounts & payroll",
      copy: "Bookkeeping, bank and aggregator reconciliations, reporting and payroll processing. Filing work and service frequency are confirmed in your service schedule.",
    },
    {
      name: "Administration & payment support",
      copy: "Routine menu administration, fee and supply reconciliations, and approved bill and salary payment administration using funds provided by your kitchen.",
    },
    {
      name: "Compliance support",
      copy: "Haccora tools, food safety procedures, allergen guidance, record keeping, training and operational support within the agreed scope.",
    },
    {
      name: "Procurement & supply coordination",
      copy: "Central sourcing, replenishment coordination and branded packaging supply. Ongoing food, ingredients and packaging are purchased separately under your quoted supply terms.",
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
                an agreed location and territory, equipment, opening stock and packaging.
                We bring the technology, marketing, accounts and support together.
                You focus on good food, timely dispatch and running your kitchen team.
              </p>
              <div className="md-franchise-hero-actions">
                <a href="#apply" className="md-btn md-btn-yellow">Register your interest <ArrowRight aria-hidden="true" /></a>
                <a href="#fees" className="md-btn md-btn-outline-light">Explore the package</a>
              </div>
              <div className="md-franchise-proof">
                <span><Check aria-hidden="true" /> {marketingBrands.length} shared brands</span>
                <span><Check aria-hidden="true" /> Turnkey setup & support</span>
                <span><Check aria-hidden="true" /> You operate the kitchen</span>
              </div>
              <p className="md-franchise-hero-cost">
                <strong>All-inclusive launch package {money(programme.upfrontFeeMin)}–{money(programme.upfrontFeeMax)}</strong>
                <span>Depending on location and territory. Excludes VAT where applicable. Your written quote confirms the complete launch inventory and scope. Ongoing services are price on application; your kitchen funds its running costs and working capital.</span>
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
            <a href="#fees">Launch & monthly support</a>
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
              The shared brands, location and territory, equipment, opening supplies and launch training form
              your turnkey setup. MealDeck, Dishbee, Dishbee Buzz and Haccora connect your kitchen with ongoing
              marketing, compliance support, accounts and administration. You run the kitchen and team
              and fund the agreed operating costs.
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
              MealDeck, Dishbee integration, Dishbee Buzz and Haccora. KDS and printers. Website, app,
              WhatsApp and phone workflows. Delivery, supported aggregator connections and AI tools.
              Your complete technology package is scoped and configured for your kitchen.
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
            <h2>One all-inclusive launch package.</h2>
            <p>
              Franchise entry, brand and territory rights, the agreed equipment and hardware, opening stock,
              branded packaging, technology setup and training, brought together in a single launch quote.
              We confirm the complete inventory and setup scope for your approved location before you commit.
            </p>
          </div>
          <div className="md-franchise-setup-grid">
            <article>
              <span className="md-franchise-number">01</span>
              <h3>Franchise entry</h3>
              <strong>Brand & territory rights</strong>
              <p>Your agreed brand portfolio and territory rights, location onboarding, technology setup and launch training, confirmed for your approved kitchen.</p>
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
              <p>Your agreed opening food, ingredients, consumables and branded packaging are supplied as part of the launch inventory.</p>
            </article>
          </div>
          <div className="md-franchise-investment-note">
            <h3>A complete setup, agreed for your location.</h3>
            <p>
              MealDeck arranges the premises, holds the lease and pays the premises deposit.
              You do not pay the premises deposit. We coordinate the agreed setup, equipment,
              systems and training around your kitchen's launch plan.
            </p>
            <p>
              Your kitchen funds rent, staffing, utilities, ongoing stock and packaging, other operating bills
              and working capital. The written quote confirms the launch inclusions and upfront payment terms.
            </p>
          </div>

          <div className="md-franchise-fee-heading">
            <p className="md-kicker md-kicker-red">Once you are trading</p>
            <h3>Monthly support. Pricing on application.</h3>
            <p>
              Keep your attention on food and service. Our ongoing package brings together the support below,
              with the royalty, technology, marketing, accounts and administration terms agreed in your written quote.
              All ongoing fees are POA.
            </p>
          </div>
          <div className="md-franchise-table-wrap" tabIndex={0} role="region" aria-label="Ongoing MealDeck services">
            <table className="md-franchise-table md-franchise-services">
              <caption>Ongoing services within your agreed monthly package</caption>
              <thead><tr><th scope="col">Service</th><th scope="col">What we provide</th></tr></thead>
              <tbody>
                {serviceRows.map((service) => (
                  <tr key={service.name}><th scope="row">{service.name}</th><td>{service.copy}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="md-franchise-note">
            Your service schedule confirms the included work, approvals and service limits.
            Card processing fees charged by third parties, marketplace commissions and actual courier delivery charges
            follow the relevant provider terms. Bill and salary payment administration uses your kitchen's funds;
            you remain responsible for your staff and business liabilities.
          </p>
        </section>

        <section id="responsibilities" className="md-section md-section-cream md-franchise-divider">
          <div className="md-section-heading">
            <p className="md-kicker md-kicker-red">How we work together</p>
            <h2>A clear role on both sides.</h2>
            <p>
              Prepare good quality food, send orders out on time and lead your team.
              MealDeck coordinates the agreed setup and business support around your kitchen.
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
                    <span>Location, boundary and launch package confirmed after assessment.</span>
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
                        <span><b>{territoryStatus(territory, confirmed)}</b></span>
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
                <span>Your turnkey kitchen</span>
                <strong>One complete launch package.</strong>
                <p>Brands, location and territory, equipment, opening supplies and packaging, technology setup and training, with a full agreed inventory.</p>
                <small>
                  Your quoted launch package is payable upfront. MealDeck holds the lease and pays the premises deposit.
                  You fund the kitchen's rent, staffing, running costs and working capital.
                </small>
                <small>
                  Ongoing technology, marketing, franchise support, accounts and administration: POA.
                  We will discuss your service scope and confirm all charges in writing.
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
                    <label className="md-franchise-check"><input name="setupPackageAcknowledged" type="checkbox" required checked={form.setupPackageAcknowledged} onChange={(event) => setForm((value) => ({ ...value, setupPackageAcknowledged: event.target.checked }))} /><span>I understand that the quoted launch package is payable upfront, ongoing services are price on application, and I need working capital for my kitchen's running costs.</span></label>
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

