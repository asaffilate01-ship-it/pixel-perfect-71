import { Download } from "lucide-react";
import { useEffect, useState } from "react";

export function PrinterApkDownload({ headingLevel = "h2" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  // An unsigned APK must never replace the existing signed printer. The
  // release workflow writes a checksum only after verifying signer continuity.
  const [updatePublished, setUpdatePublished] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/downloads/mealdeck-printer-h10s-0.2.3.apk.sha256", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const checksum = (await response.text()).trim();
        if (/^[a-f0-9]{64}  mealdeck-printer-h10s-0\.2\.3\.apk$/.test(checksum))
          setUpdatePublished(true);
      })
      .catch(() => {
        // Retain v0.2.2 if no verified signed update is published.
      });
    return () => controller.abort();
  }, []);
  const version = updatePublished ? "0.2.3" : "0.2.2";

  return (
    <section className="md-ops-card space-y-4 p-4 sm:p-5" aria-label="Senraise H10S receipt app">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold uppercase tracking-[.12em] md-ops-accent">
            Version {version} · receipt app
          </p>
          <Heading className="text-xl font-black">H10S automatic receipts</Heading>
          <p className="text-sm md-ops-muted">Android 13 · sign in with your printer account</p>
        </div>
        <a
          href={`/downloads/mealdeck-printer-h10s-${version}.apk`}
          download={`mealdeck-printer-h10s-${version}.apk`}
          className="md-ops-button md-ops-primary w-full sm:w-auto"
        >
          <Download className="size-4 shrink-0" aria-hidden="true" />
          Download receipt APK
        </a>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 md-ops-text">
        <li>
          Install or update on your H10S and open <strong>MealDeck Printer</strong>. Keep the
          existing app installed when updating so its receipt history is retained.
        </li>
        <li>
          Sign in, select your kitchen, check the connection and tap{" "}
          <strong>Start auto-print</strong>.
        </li>
        <li>
          Accept orders on KDS or this Printer screen. The app sends their receipts automatically.
        </li>
      </ol>
      <p className="rounded-lg p-3 text-sm leading-6 md-ops-soft md-ops-text">
        Check the first complete paper receipt. Older waiting receipts need an explicit print
        action; an interrupted receipt is held for inspection. Automatic printing is controlled in
        the H10S app.
      </p>
      <details className="text-sm leading-6 md-ops-muted">
        <summary className="min-h-11 cursor-pointer font-bold">
          Need the connection test app?
        </summary>
        <p className="mt-2">
          The earlier setup app only prints a fixed test ticket. It can remain installed alongside
          the receipt app.
        </p>
        <a
          href="/downloads/mealdeck-printer-setup-h10s-0.1.0.apk"
          download="mealdeck-printer-setup-h10s-0.1.0.apk"
          className="md-ops-button md-ops-secondary mt-3"
        >
          Download setup test APK
        </a>
      </details>
    </section>
  );
}
