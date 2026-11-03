import { AlertCircle, CheckCircle2, Circle, Clock3 } from "lucide-react";
import type {
  TrackingPresentation, TrackingStepState,
} from "@/lib/mealdeck-tracking-presentation";

type TimelineProps = { value: TrackingPresentation };

const stateText: Record<TrackingStepState, string> = {
  done: "Recorded",
  current: "Current",
  upcoming: "Not yet confirmed",
  review: "Needs review",
};
const stateIcon = {
  done: CheckCircle2,
  current: Clock3,
  upcoming: Circle,
  review: AlertCircle,
};

export function TrackingTimeline({ value }: TimelineProps) {
  const updated = value.updatedAtIso
    ? new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(value.updatedAtIso))
    : null;

  return (
    <section aria-labelledby="mealdeck-tracking-timeline" className="border-t border-border p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            One basket · One handoff
          </p>
          <h3 id="mealdeck-tracking-timeline" className="mt-1 font-display text-xl font-bold">
            Your order journey
          </h3>
        </div>
        {updated ? (
          <p className="text-xs text-muted-foreground">
            Last recorded update: <time dateTime={value.updatedAtIso!}>{updated} UK</time>
          </p>
        ) : <p className="text-xs text-muted-foreground">Update time not available</p>}
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {value.stages.map((step, index) => {
          const Icon = stateIcon[step.state];
          return <li key={step.id}
            className={
              "min-w-0 rounded-2xl border p-4 " +
              (step.state === "review" ? "border-destructive/40 bg-destructive/5" :
               step.state === "current" ? "border-primary bg-primary/5" :
               "border-border bg-background/60")
            }
            aria-current={step.state === "current" ? "step" : undefined}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Step {index + 1}</span>
              <Icon aria-hidden="true" className={
                "size-5 shrink-0 " +
                (step.state === "review" ? "text-destructive" :
                 step.state === "current" ? "text-primary" :
                 step.state === "done" ? "text-emerald-600" : "text-muted-foreground")
              }/>
            </div>
            <h4 className="mt-3 font-display text-sm font-bold">{step.title}</h4>
            <p className="mt-1 text-xs font-semibold text-foreground">
              {stateText[step.state]}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</p>
          </li>;
        })}
      </ol>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        These milestones reflect recorded Dishbee or courier statuses, not a live location or
        a guaranteed ETA. Customer handoff and payment evidence are verified by the kitchen
        system separately.
      </p>
    </section>
  );
}
