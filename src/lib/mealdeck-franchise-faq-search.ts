/**
 * Pure search over existing, operator-approved franchise FAQs.
 * Returns the source FAQ verbatim; does not generate answers, quotes or advice.
 */
export type PublicFranchiseFaq={question:string;answer:string};
const normalise=(text:string)=>text.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("en-GB").replace(/[^a-z0-9]+/g," ").trim();
export function searchFranchiseFaqs(
  faqs:readonly PublicFranchiseFaq[],query:string,maxResults=12,
):PublicFranchiseFaq[]{
  if(!Number.isSafeInteger(maxResults)||maxResults<1||maxResults>100)return [];
  const q=normalise(query).slice(0,120);
  if(!q)return faqs.slice(0,maxResults);
  const terms=[...new Set(q.split(/\s+/))].filter(Boolean);
  if(terms.length>12)return [];
  return faqs.map((faq,index)=>{
    const question=normalise(faq.question),answer=normalise(faq.answer);
    const all=terms.every(term=>question.includes(term)||answer.includes(term));
    const exactQuestion=question.includes(q);
    const questionHits=terms.filter(term=>question.includes(term)).length;
    return {faq,index,all,score:(exactQuestion?100:0)+questionHits*10};
  }).filter(x=>x.all).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,maxResults).map(x=>x.faq);
}
