import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import type { PrinterJob } from "@/lib/mealdeck-printer";
import type { PrinterQueueView } from "@/lib/mealdeck-printer-queue";

export function ReceiptQueueList({
  view,
  fresh,
  renderJob,
}: {
  view: PrinterQueueView;
  fresh: boolean;
  renderJob: (job: PrinterJob) => ReactNode;
}) {
  return (
    <>
      {view.activeJobs.length > 0 && (
        <div
          className="grid items-start gap-4 lg:grid-cols-2"
          role="group"
          aria-label="Receipts needing attention"
        >
          {view.activeJobs.map(renderJob)}
        </div>
      )}
      {fresh && view.actionCount === 0 && (
        <div className="md-ops-card p-8 text-center">
          <Printer className="mx-auto size-8 md-ops-muted" />
          <h3 className="mt-3 text-xl font-black">Receipt queue clear</h3>
          <p className="mt-2 text-sm md-ops-muted">
            Nothing is waiting to print or check. The next accepted, paid order will appear here.
          </p>
        </div>
      )}
      {view.printedJobs.length > 0 && (
        <details className="md-ops-card overflow-hidden">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-bold">
            Recently printed ({view.printedJobs.length})
          </summary>
          <div className="space-y-3 border-t md-ops-border p-4">
            <p className="text-sm md-ops-muted">
              These receipts have been confirmed printed. Open a receipt to view its details or
              request a marked copy.
            </p>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {view.printedJobs.map(renderJob)}
            </div>
          </div>
        </details>
      )}
    </>
  );
}
