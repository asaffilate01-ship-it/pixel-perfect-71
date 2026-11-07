import { Download } from "lucide-react";

export function PrinterApkDownload({ headingLevel = "h2" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;

  return (
    <section className="md-ops-card space-y-4 p-4 sm:p-5" aria-label="Senraise H10S setup app">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold uppercase tracking-[.12em] md-ops-accent">
            Version 0.1.0 · setup build
          </p>
          <Heading className="text-xl font-black">Senraise H10S setup app</Heading>
          <p className="text-sm md-ops-muted">Android 13 · 10.4 MB</p>
        </div>
        <a
          href="/downloads/mealdeck-printer-setup-h10s-0.1.0.apk"
          download="mealdeck-printer-setup-h10s-0.1.0.apk"
          className="md-ops-button md-ops-primary w-full sm:w-auto"
        >
          <Download className="size-4 shrink-0" aria-hidden="true" />
          Download H10S APK
        </a>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 md-ops-text">
        <li>
          Install the downloaded APK on your H10S, then open <strong>MealDeck Printer Setup</strong>
          .
        </li>
        <li>
          Tap <strong>Check printer connection</strong>, then{" "}
          <strong>Print one setup ticket</strong> when the connection is available.
        </li>
        <li>Inspect the paper and confirm the result in the setup app.</li>
      </ol>
      <p className="rounded-lg p-3 text-sm leading-6 md-ops-soft md-ops-text">
        <strong>Setup only.</strong> This app checks the built-in printer and prints a test ticket.
        It does not print customer orders or enable automatic receipts.
      </p>
    </section>
  );
}
