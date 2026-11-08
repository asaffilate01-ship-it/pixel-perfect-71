import { createFileRoute, Link } from "@tanstack/react-router";
import { Bike, LockKeyhole, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { seo } from "@/lib/seo";

/**
 * Closed driver entry point. Do not load jobs, offer sign-in, or request GPS
 * until a dedicated authenticated, scoped driver API has been deployed.
 */
export const Route = createFileRoute("/driver")({
  head: () => {
    const tags=seo({title:"Driver workspace | MealDeck",description:"Private MealDeck delivery driver access.",path:"/driver"});
    return {...tags,meta:[...tags.meta,
      {name:"robots",content:"noindex, nofollow, noarchive"},
      {name:"referrer",content:"no-referrer"}]};
  },
  component: DriverWorkspace,
});

function DriverWorkspace() {
  return (
    <main className="min-h-screen bg-[#fff6e8] px-4 py-8 text-[#111111]">
      <div className="mx-auto max-w-lg">
        <header className="mb-8 flex items-center gap-3">
          <MealDeckLogo decorative className="h-12 w-12" />
          <div><p className="text-xs font-bold uppercase tracking-widest text-[#951018]">MealDeck fleet</p>
          <h1 className="text-2xl font-bold">Driver workspace</h1></div>
        </header>
        <section className="rounded-3xl border border-[#eadbcf] bg-white p-6 shadow-sm" aria-labelledby="driver-access-heading">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff6e8] text-[#951018]"><LockKeyhole aria-hidden="true" /></div>
          <h2 id="driver-access-heading" className="text-xl font-bold">Driver access not yet enabled</h2>
          <p className="mt-2 text-sm leading-6 text-[#514743]">
            This private workspace is being prepared for MealDeck's own delivery team.
            No live orders, customer addresses or driver location are available here yet.
          </p>
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex gap-3"><Bike className="h-5 w-5 shrink-0 text-[#951018]" aria-hidden="true" /><span>Assigned deliveries and shift availability, after verified sign-in</span></div>
            <div className="flex gap-3"><PackageCheck className="h-5 w-5 shrink-0 text-[#951018]" aria-hidden="true" /><span>Kitchen collection and customer handover verification</span></div>
            <div className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-[#951018]" aria-hidden="true" /><span>Optional location sharing only when on shift with an active job</span></div>
            <div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-[#951018]" aria-hidden="true" /><span>Payment and delivery status remain server-verified</span></div>
          </div>
          <p role="status" className="mt-6 rounded-xl bg-[#fff6e8] p-3 text-sm font-semibold text-[#951018]">
            Commissioning required. Do not use this page to dispatch or complete orders.
          </p>
          <Link to="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5141d]">
            Return to MealDeck
          </Link>
        </section>
      </div>
    </main>
  );
}
