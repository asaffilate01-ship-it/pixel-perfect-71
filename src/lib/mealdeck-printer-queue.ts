import type { PrinterJob } from "./mealdeck-printer";

/** Presentation only: keep the complete server board for claims and automatic printing. */
export function printerQueueView(
  jobs: readonly PrinterJob[],
  localHolds: readonly { jobId: string }[],
) {
  const heldIds = new Set(localHolds.map((hold) => hold.jobId));
  const activeJobs: PrinterJob[] = [];
  const printedJobs: PrinterJob[] = [];
  for (const job of jobs) {
    // A server paper confirmation cannot resolve an outstanding local printer record.
    if (job.status === "printed" && !heldIds.has(job.jobId)) printedJobs.push(job);
    else activeJobs.push(job);
  }
  return {
    activeJobs,
    printedJobs,
    actionCount: new Set([...activeJobs.map((job) => job.jobId), ...heldIds]).size,
    hasLocalHolds: heldIds.size > 0,
  };
}

export type PrinterQueueView = ReturnType<typeof printerQueueView>;
