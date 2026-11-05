import { useEffect, useId, useState } from "react";
import { ArrowDownToLine, Smartphone, X } from "lucide-react";
import { useMealDeckPwa } from "@/lib/mealdeck-pwa-context";
import "@/styles.launch-opening.css";

const DISMISS_KEY = "mealdeck-menu-install-dismissed";

/** An invitation on menu entry. Native prompts only follow a deliberate tap. */
export function MenuInstallPrompt() {
  const { installed, canInstall, install } = useMealDeckPwa();
  const [dismissed, setDismissed] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const helpId = useId();

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "yes");
    } catch {
      // Installation and the menu still work when browser storage is unavailable.
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "yes");
    } catch {
      // The invitation stays dismissed for this mounted menu.
    }
  }

  async function openInstall() {
    if (!canInstall) {
      setHelp((value) => !value);
      return;
    }
    setBusy(true);
    const result = await install();
    setBusy(false);
    setMessage(
      result === "accepted"
        ? "Finish adding MealDeck in your browser’s installation window."
        : result === "dismissed"
          ? "No problem. You can install later from More in the menu."
          : "You can add MealDeck from your browser menu.",
    );
    if (result === "unavailable") setHelp(true);
  }

  if (installed || dismissed) return null;

  return (
    <aside className="lm-install-invitation" aria-label="Get the MealDeck app">
      <div className="lm-install-invitation-main">
        <Smartphone size={25} aria-hidden="true" />
        <div>
          <strong>The MealDeck app.</strong>
          <p>Add to your home screen.</p>
        </div>
        <button
          type="button"
          className="lm-install-invitation-action"
          disabled={busy}
          aria-expanded={help}
          aria-controls={helpId}
          onClick={() => void openInstall()}
        >
          <ArrowDownToLine size={17} aria-hidden="true" />
          {busy ? "Opening…" : "Install"}
        </button>
        <button
          type="button"
          className="lm-install-invitation-close"
          onClick={dismiss}
          aria-label="Dismiss app installation invitation"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="lm-install-instructions" id={helpId} hidden={!help}>
        <p>
          <strong>iPhone / iPad:</strong> open MealDeck in Safari, tap Share, then Add to Home
          Screen.
        </p>
        <p>
          <strong>Android / computer:</strong> open your browser menu and choose Install app or Add
          to Home screen, when offered.
        </p>
        <p>Installing is optional. You can keep browsing and ordering on the website.</p>
      </div>
      {message && (
        <p className="lm-install-status" role="status">
          {message}
        </p>
      )}
    </aside>
  );
}
