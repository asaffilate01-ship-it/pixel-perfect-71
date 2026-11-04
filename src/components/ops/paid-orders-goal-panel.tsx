import type {WeeklyPaidGoal} from "@/lib/mealdeck-weekly-paid-goal";

export type PaidGoalLocation={
  city:"Luton"|"St Albans";
  status:"ready"|"no_access"|"not_configured"|"unavailable";
  goal:WeeklyPaidGoal|null;
};
const number=(n:number)=>new Intl.NumberFormat("en-GB").format(n);
export function PaidOrdersGoalPanel({locations}:{locations:readonly PaidGoalLocation[]}) {
  const luton=locations.find(x=>x.city==="Luton");
  const stalbans=locations.find(x=>x.city==="St Albans");
  const both=luton?.status==="ready"&&stalbans?.status==="ready"&&!!luton.goal&&!!stalbans.goal;
  const combinedWeekToDate=both?luton.goal!.currentWeekToDate+stalbans.goal!.currentWeekToDate:null;
  const combinedLastWeek=both?luton.goal!.lastComplete+stalbans.goal!.lastComplete:null;
  return <section aria-labelledby="mealdeck-paid-goal" className="md-ops-card p-5 sm:p-7">
    <p className="text-xs font-black uppercase tracking-[0.18em] md-ops-accent">MealDeck · Product goal</p>
    <h2 id="mealdeck-paid-goal" className="mt-2 max-w-3xl text-2xl font-black tracking-tight sm:text-3xl">
      Diners in Luton and St Albans get the meals they’re craving
    </h2>
    <p className="mt-2 text-sm md-ops-muted">Measured by: <strong>orders paid for each week</strong>, using recorded MealDeck payment timestamps.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl md-ops-inverse p-5 text-white">
        <p className="text-sm font-semibold md-ops-inverse-muted">Both locations · This week so far</p>
        <p className="mt-2 text-4xl font-black tabular-nums">{combinedWeekToDate===null?"—":number(combinedWeekToDate)}</p>
        <p className="mt-1 text-xs md-ops-inverse-muted">{both?"Monday to the latest reporting date":"Available when both authorised location reports load"}</p>
      </div>
      <div className="rounded-2xl md-ops-wash p-5 md-ops-ink">
        <p className="text-sm font-semibold">Both locations · Last completed week</p>
        <p className="mt-2 text-4xl font-black tabular-nums">{combinedLastWeek===null?"—":number(combinedLastWeek)}</p>
        <p className="mt-1 text-xs md-ops-muted">Monday–Sunday; never compare a partial week to a full one</p>
      </div>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {(["Luton","St Albans"] as const).map(city=>{
        const site=locations.find(x=>x.city===city);
        const goal=site?.status==="ready"?site.goal:null;
        return <article key={city} className="rounded-2xl border md-ops-border p-4 sm:p-5">
          <h3 className="text-lg font-black">{city}</h3>
          {!goal?<p role="status" className="mt-3 text-sm md-ops-muted">
            {site?.status==="no_access"?"Your role does not include analytics access for this location."
              :site?.status==="not_configured"?"No uniquely configured location was found."
              :"Verified weekly figures are unavailable. No zero sales have been assumed."}
          </p>:<>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><p className="text-xs md-ops-muted">This week so far</p>
                <p className="mt-1 text-2xl font-black tabular-nums">{number(goal.currentWeekToDate)}</p></div>
              <div><p className="text-xs md-ops-muted">Last full week</p>
                <p className="mt-1 text-2xl font-black tabular-nums">{number(goal.lastComplete)}</p></div>
            </div>
            <p className="mt-2 text-xs md-ops-muted">Versus preceding full week:
              <strong className="ml-1">{goal.completeWeekChange>0?"+":""}{number(goal.completeWeekChange)} orders</strong>
            </p>
            <div className="mt-4 space-y-2" aria-label={city+" paid orders by reporting week"}>
              {goal.weeks.map(week=><div key={week.startsOn} className="flex items-center justify-between gap-3 border-b md-ops-divider py-1.5 text-sm">
                <span className="md-ops-muted">{week.startsOn} {week.period==="week_to_date"?"· Week to date":""}</span>
                <strong className="tabular-nums">{number(week.orders)}</strong>
              </div>)}
            </div>
          </>}
        </article>;
      })}
    </div>
    <p className="mt-4 text-xs md-ops-muted">
      Reporting uses MealDeck’s recorded payment dates. Each paid order counts once, regardless of the number of brands or payers.
      This is a recorded paid-order KPI, not a bank-settlement, refund-adjusted or delivery-completion measure.
      No figures are fabricated if an authorised data source is missing.
    </p>
  </section>;
}
