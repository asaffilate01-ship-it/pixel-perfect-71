import { COMING_SOON, COMING_SOON_MESSAGE } from "./launch-status.ts";
import { brandFaqs, faqs } from "./franchise-faqs.ts";

export type FranchisePackage = "full_mealdeck" | "selected_brands";
export const franchiseFaqId = (question: string) =>
  `faq-${question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`;

export function franchiseAnswers(packageChoice: FranchisePackage) {
  return [...brandFaqs, ...(packageChoice === "full_mealdeck" ? faqs : [])].map((faq) => ({
    ...faq,
    id: franchiseFaqId(faq.question),
    source: `https://mealdeck.co.uk/franchise#${franchiseFaqId(faq.question)}`,
  }));
}

const stopWords = new Set("a an the is are i can do does how what my to of for and or in it me about please much need would like know tell you your we our have has will with get".split(" "));
// Small, explicit vocabulary keeps retrieval inspectable without changing public copy.
const vocabulary = new Map<string, string>();
for (const group of [
  ["cost", "costs", "price", "prices", "pricing", "fee", "fees", "money", "charges"],
  ["staff", "staffing", "employees", "employee", "recruitment", "hiring"],
  ["equipment", "appliances", "appliance", "kit"],
  ["territory", "territories", "area", "areas"],
  ["training", "onboarding", "train"],
  ["accountancy", "accounting", "bookkeeping", "accounts"],
  ["profit", "profits", "earnings"],
  ["brand", "brands"],
  ["kitchen", "kitchens"],
  ["deposit", "deposits"],
] as const) for (const term of group) vocabulary.set(term, group[0]);

function tokens(text: string) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((term) => term.length > 1 && !stopWords.has(term))
    .map((term) => vocabulary.get(term) ?? term));
}

export function franchiseGuideContext() {
  return {
    sourceType: "bundled_public_faqs",
    liveAvailabilityChecked: false,
    launchGate: COMING_SOON ? "coming_soon" : "not_gated_in_this_revision",
    message: COMING_SOON ? COMING_SOON_MESSAGE : "Check the live website for current ordering and registration availability.",
    canSubmitEnquiry: false,
    canReserveTerritory: false,
    canQuotePersonalisedPrice: false,
    enquiryUrl: "https://mealdeck.co.uk/franchise#apply",
  };
}

export function searchFranchiseGuide(query: string, packageChoice: FranchisePackage) {
  if (query.length > 300) throw new RangeError("Use a question of 300 characters or fewer.");
  const terms = [...tokens(query)];
  if (!terms.length) return [];
  return franchiseAnswers(packageChoice)
    .map((answer) => {
      const title = tokens(answer.question);
      const body = tokens(answer.answer);
      const matches = terms.filter((term) => title.has(term) || body.has(term));
      // Require meaningful overlap; a long unrelated prompt must not match one keyword.
      const minimumMatches = Math.max(1, Math.ceil(terms.length / 2));
      return { answer, score: matches.length < minimumMatches ? 0 : matches.reduce((sum, term) => sum + (title.has(term) ? 3 : 1), 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ answer }) => answer);
}
