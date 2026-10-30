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

const stopWords = new Set("a an the is are i can do does how what my to of for and or in it me about please".split(" "));
export function searchFranchiseGuide(query: string, packageChoice: FranchisePackage) {
  if (query.length > 300) throw new RangeError("Use a question of 300 characters or fewer.");
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter((term) => term.length > 1 && !stopWords.has(term));
  if (!terms.length) return [];
  return franchiseAnswers(packageChoice)
    .map((answer) => {
      const title = new Set(answer.question.toLowerCase().match(/[a-z0-9]+/g));
      const body = new Set(answer.answer.toLowerCase().match(/[a-z0-9]+/g));
      const matches = terms.filter((term) => title.has(term) || body.has(term));
      return { answer, score: matches.length < Math.min(2, terms.length) ? 0 : matches.reduce((sum, term) => sum + (title.has(term) ? 3 : 1), 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ answer }) => answer);
}
