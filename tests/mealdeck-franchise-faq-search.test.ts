import {describe,expect,test} from "bun:test";
import {searchFranchiseFaqs} from "../src/lib/mealdeck-franchise-faq-search";

const faqs=[
  {question:"What is included in the equipment package?",answer:"The written launch proposal lists equipment and training."},
  {question:"Can I choose one brand?",answer:"Choose one or several brands. No territory is reserved."},
  {question:"How does the premises deposit work?",answer:"The landlord deposit is reflected in the launch quote."},
  {question:"What training will I receive?",answer:"Training is scoped in your written proposal."},
];
describe("approved franchise FAQ search",()=>{
  test("returns unchanged published answers, never generated content",()=>{
    const results=searchFranchiseFaqs(faqs,"landlord deposit");
    expect(results).toEqual([faqs[2]]);
    expect(results[0]?.answer).toBe(faqs[2]?.answer);
  });
  test("matches question and answer terms regardless of case",()=>{
    expect(searchFranchiseFaqs(faqs,"EQUIPMENT TRAINING")).toEqual([faqs[0]]);
  });
  test("ranks question hits above answer-only hits",()=>{
    const r=searchFranchiseFaqs(faqs,"training");
    expect(r[0]).toEqual(faqs[3]);
  });
  test("returns all approved FAQs in source order for blank search",()=>{
    expect(searchFranchiseFaqs(faqs," ")).toEqual(faqs);
  });
  test("does not leak unrelated or unapproved FAQs into results",()=>{
    expect(searchFranchiseFaqs([faqs[1]],"deposit")).toEqual([]);
  });
  test("limits results and rejects invalid pagination",()=>{
    expect(searchFranchiseFaqs(faqs,"",2)).toHaveLength(2);
    expect(searchFranchiseFaqs(faqs,"",-1)).toEqual([]);
  });
  test("normalises punctuation and accents",()=>{
    expect(searchFranchiseFaqs([{question:"Café lease",answer:"Terms apply"}],"cafe")).toHaveLength(1);
  });
});
