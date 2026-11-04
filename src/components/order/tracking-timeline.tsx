import { useEffect, useId, useState } from "react";
import "./tracking-timeline.css";
import { AlertCircle, Check, Clock3, PackageCheck, Timer } from "lucide-react";
import {
  formatTrackingElapsed,
  trackingElapsedSeconds,
  type TrackingPresentation,
  type TrackingStepState,
} from "@/lib/mealdeck-tracking-presentation";

type TimelineProps = { value: TrackingPresentation };

const stateText: Record<TrackingStepState, string> = {
  done: "Done",
  current: "Now",
  upcoming: "Waiting",
  review: "Needs review",
};
const ukTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});
const ukDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function TrackingTimeline({ value }: TimelineProps) {
  const headingId = useId();
  const clockKey = String(value.clockReferenceMs) + ":" + String(value.createdAtIso);
  const [clock, setClock] = useState({ key: clockKey, elapsedMs: 0 });

  useEffect(() => {
    const started = performance.now();
    const tick = () => {
      if (document.visibilityState !== "hidden") {
        setClock({ key: clockKey, elapsedMs: Math.max(0, performance.now() - started) });
      }
    };
    tick();
    if (value.elapsedAtObservationSeconds === null || value.isFinalStatus) return;
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [clockKey, value.elapsedAtObservationSeconds, value.isFinalStatus]);

  const elapsed = trackingElapsedSeconds(value, clock.key === clockKey ? clock.elapsedMs : 0);
  const duration = formatTrackingElapsed(elapsed);
  const placed = value.createdAtIso ? new Date(value.createdAtIso) : null;
  const updated = value.updatedAtIso ? new Date(value.updatedAtIso) : null;

  return (
    <section aria-labelledby={headingId} className="border-t border-border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            All your brands · One order
          </p>
          <h3 id={headingId} className="mt-1 font-display text-xl font-black">
            Your order journey
          </h3>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold">
          <PackageCheck aria-hidden="true" className="size-4 text-primary" />
          {value.fulfilmentLabel}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-background/60">
        <div className="min-w-0 border-r border-border p-4 sm:p-5">
          <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-4 shrink-0" />
            {value.paymentRecorded ? "Order placed" : "Order created"}
          </dt>
          <dd className="mt-2">
            {placed ? (
              <time dateTime={value.createdAtIso!}>
                <span className="block font-display text-2xl font-black tabular-nums">
                  {ukTime.format(placed)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {ukDate.format(placed)} · UK
                </span>
              </time>
            ) : (
              <span className="block text-sm font-semibold">Time unavailable</span>
            )}
          </dd>
        </div>
        <div className="min-w-0 p-4 sm:p-5">
          <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Timer aria-hidden="true" className="size-4 shrink-0" />
            {value.isFinalStatus ? "Elapsed at last check" : "Time since order"}
          </dt>
          <dd className="mt-2">
            {duration ? (
              <span
                role="timer"
                aria-live="off"
                className="block break-words font-display text-xl font-black tabular-nums sm:text-2xl"
              >
                {duration}
              </span>
            ) : (
              <span className="block text-sm font-semibold">Time unavailable</span>
            )}
            <span className="mt-1 block text-xs text-muted-foreground">
              {value.isFinalStatus
                ? "Measured up to the status check"
                : duration
                  ? "Elapsed since your order was created"
                  : "Waiting for the recorded order time"}
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold">
            {value.tone === "review"
              ? "Progress needs checking"
              : !value.paymentRecorded
                ? "Awaiting payment confirmation"
                : value.isFinalStatus
                  ? "Final status reported"
                  : "Order progress"}
          </span>
          {value.paymentRecorded && (
            <span className="font-semibold tabular-nums text-muted-foreground">
              Stage {value.progress.reached} of {value.progress.total}
            </span>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Order progress"
          aria-valuemin={0}
          aria-valuemax={value.progress.total}
          aria-valuenow={value.progress.reached}
          aria-valuetext={value.progress.label}
          className="h-2.5 overflow-hidden rounded-full bg-secondary"
        >
          <div
            className={
              "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 " +
              (value.tone === "review" ? "bg-destructive" : "bg-primary")
            }
            style={{ width: value.progress.percent + "%" }}
          />
        </div>
      </div>

      <ol className="mt-5 grid gap-x-6 sm:grid-cols-2">
        {value.stages.map((step, index) => (
          <li
            key={step.id}
            className="flex min-w-0 gap-3 border-b border-border/70 py-3.5"
            aria-current={step.state === "current" ? "step" : undefined}
          >
            <span
              aria-hidden="true"
              className={
                "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold " +
                (step.state === "done"
                  ? "border-primary bg-primary text-primary-foreground"
                  : step.state === "current"
                    ? "border-primary bg-primary/10 text-primary"
                    : step.state === "review"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border text-muted-foreground")
              }
            >
              {step.state === "done" ? (
                <Check className="size-4" />
              ) : step.state === "current" ? (
                <Clock3 className="size-4" />
              ) : step.state === "review" ? (
                <AlertCircle className="size-4" />
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <h4 className="font-display text-sm font-bold">{step.title}</h4>
                <span
                  className={
                    "text-[11px] font-bold " +
                    (step.state === "review"
                      ? "text-destructive"
                      : step.state === "current"
                        ? "text-primary"
                        : "text-muted-foreground")
                  }
                >
                  {stateText[step.state]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {updated ? (
          <>
            Latest recorded change:{" "}
            <time dateTime={value.updatedAtIso!}>
              {ukDate.format(updated)}, {ukTime.format(updated)} UK
            </time>
            .{" "}
          </>
        ) : (
          "The last change time is not available. "
        )}
        Milestones update when the kitchen or courier confirms a status.
      </p>
    </section>
  );
}
