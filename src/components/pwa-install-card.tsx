import { useId, useState } from "react";
import { ArrowDownToLine, Check, RefreshCw, Smartphone } from "lucide-react";
import { useMealDeckPwa } from "@/lib/mealdeck-pwa-context";

export function PwaInstallCard({ appName = "MealDeck" }: { appName?: string }) {
  const { installed, canInstall, updateReady, install, update } = useMealDeckPwa();
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const helpId = useId();

  async function requestInstall() {
    setBusy(true);
    const result = await install();
    setBusy(false);
    setMessage(
      result === "accepted"
        ? `Finish adding ${appName} in your browser’s installation window.`
        : result === "dismissed"
          ? `You can add ${appName} later from your browser menu.`
          : "Open your browser menu to see installation options.",
    );
    if (result !== "accepted") setHelpOpen(true);
  }

  return (
    <section className="md-install-card" aria-label={`${appName} on your home screen`}>
      <div className="md-install-heading">
        <span className="md-install-icon" aria-hidden="true">
          <Smartphone size={25} />
        </span>
        <div>
          <h3>
            {installed
              ? `Your ${appName} app`
              : appName === "MealDeck"
                ? "A place on your home screen."
                : `Install ${appName}`}
          </h3>
          <p>
            {appName !== "MealDeck"
              ? "A dedicated staff app. Authorised sign-in is required every time your session expires."
              : installed
                ? "Your favourite menus, ready to explore."
                : "Open the deck in one tap. Keep your favourites close."}
          </p>
        </div>
      </div>
      {installed ? (
        <p className="md-install-confirmed">
          <Check size={17} aria-hidden="true" /> Running as an app
        </p>
      ) : canInstall ? (
        <button
          type="button"
          className="md-install-button"
          disabled={busy}
          onClick={() => void requestInstall()}
        >
          <ArrowDownToLine size={18} aria-hidden="true" />
          {busy ? "Opening installation…" : `Install ${appName}`}
        </button>
      ) : (
        <button
          type="button"
          className="md-install-button"
          aria-expanded={helpOpen}
          aria-controls={helpId}
          onClick={() => setHelpOpen((open) => !open)}
        >
          <ArrowDownToLine size={18} aria-hidden="true" /> Add to home screen
        </button>
      )}
      <div id={helpId} className="md-install-help" hidden={!helpOpen || installed}>
        <p>
          <strong>iPhone or iPad</strong> Open this site in Safari, tap Share, then Add to Home
          Screen.
        </p>
        <p>
          <strong>Android or desktop</strong> Open your browser menu and choose Install app or Add
          to Home screen when available.
        </p>
      </div>
      {message && !installed && (
        <p className="md-install-message" role="status">
          {message}
        </p>
      )}
      {updateReady && (
        <div className="md-install-update">
          <p>A new version of MealDeck is ready. Updating refreshes this page.</p>
          <button type="button" onClick={update}>
            <RefreshCw size={17} aria-hidden="true" /> Update app
          </button>
        </div>
      )}
    </section>
  );
}
