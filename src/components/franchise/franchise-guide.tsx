import { COMING_SOON } from "@/lib/launch-status";
import { useState } from "react";
import { searchFranchiseGuide, type FranchisePackage } from "@/lib/franchise-knowledge";

export function FranchiseGuide({ packageChoice }: { packageChoice: FranchisePackage }) {
  const [query, setQuery] = useState("");
  const results = searchFranchiseGuide(query, packageChoice);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 mb-6" aria-labelledby="franchise-guide-title">
      <h3 id="franchise-guide-title" className="text-xl font-semibold">Find a franchise answer</h3>
      <p className="text-sm text-muted-foreground mt-2">Search our published FAQs. Personal quotes and territory availability need an enquiry.</p>
      <label htmlFor="franchise-guide-search" className="block text-sm font-medium mt-4 mb-2">What would you like to know?</label>
      <input id="franchise-guide-search" type="search" maxLength={300} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try equipment, training or territory" className="w-full rounded-lg border border-input bg-background px-3 py-3 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
      {query && <button type="button" className="mt-2 text-sm underline" onClick={() => { setQuery(""); document.getElementById("franchise-guide-search")?.focus(); }}>Clear search</button>}
      <div className="flex flex-wrap gap-2 mt-3" aria-label="Suggested topics">
        {["Equipment", "Training", "Territory", "Cost"].map((topic) => <button key={topic} type="button" onClick={() => setQuery(topic)} className="rounded-full border border-border px-3 py-2 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{topic}</button>)}
      </div>
      <p className="text-sm text-muted-foreground mt-3" role="status">{query.trim() ? `${results.length} related published answer${results.length === 1 ? "" : "s"}` : "Choose a topic or search the guide."}</p>
      {results.map((result) => <article key={result.id} className="mt-4 border-t border-border pt-4"><h4 className="font-semibold">{result.question}</h4><p className="text-sm mt-2 leading-relaxed">{result.answer}</p><a className="inline-block text-sm underline mt-2" href={`#${result.id}`} onClick={() => { const target = document.getElementById(result.id); if (target instanceof HTMLDetailsElement) target.open = true; }}>View in FAQs</a></article>)}
      {COMING_SOON && <p className="mt-3 text-sm text-muted-foreground">You can explore the guide now. Registration is not open yet.</p>}
      {query.trim() && !results.length && <p className="mt-3 text-sm">We don’t have a published answer for that question. <a href="#apply" className="underline">View enquiry options</a>.</p>}
    </section>
  );
}
