import { useEffect, useState } from "react";
import { Cookie, ShieldCheck, X } from "lucide-react";
import {
  MEALDECK_COOKIE_CONSENT_EVENT,
  MEALDECK_COOKIE_CONSENT_KEY,
  makeMealDeckCookieConsent,
  parseMealDeckCookieConsent,
  type MealDeckCookieConsent,
} from "@/lib/mealdeck-cookie-consent";

export const MEALDECK_OPEN_COOKIE_SETTINGS = "mealdeck-open-cookie-settings";

/**
 * Consent cannot enable a tracker by itself; integrations must test the
 * saved category before initialising. No optional scripts are loaded here.
 */
export function MealDeckCookieChoices() {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  useEffect(() => {
    let previous: MealDeckCookieConsent | null = null;
    try { previous = parseMealDeckCookieConsent(localStorage.getItem(MEALDECK_COOKIE_CONSENT_KEY)); }
    catch { /* No storage permission is never treated as consent. */ }
    setReady(true);
    setVisible(!previous);
    setAnalytics(previous?.analytics ?? false);
    setMarketing(previous?.marketing ?? false);
    const showSettings = () => { setCustomising(true); setVisible(true); };
    window.addEventListener(MEALDECK_OPEN_COOKIE_SETTINGS, showSettings);
    return () => window.removeEventListener(MEALDECK_OPEN_COOKIE_SETTINGS, showSettings);
  }, []);

  function save(analyticsAllowed: boolean, marketingAllowed: boolean) {
    const choice = makeMealDeckCookieConsent(analyticsAllowed, marketingAllowed);
    try { localStorage.setItem(MEALDECK_COOKIE_CONSENT_KEY, JSON.stringify(choice)); }
    catch { /* The choice remains effective for this visit only. */ }
    setAnalytics(choice.analytics);
    setMarketing(choice.marketing);
    setVisible(false);
    setCustomising(false);
    window.dispatchEvent(new CustomEvent(MEALDECK_COOKIE_CONSENT_EVENT, { detail: choice }));
  }

  if (!ready || !visible) return null;
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="MealDeck cookie preferences"
      className="fixed bottom-20 left-3 right-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-zinc-600 bg-zinc-950 px-5 py-5 text-white shadow-2xl sm:bottom-5"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cookie size={22} aria-hidden="true" className="text-amber-300" />
          <strong className="text-lg">Your privacy, your choice</strong>
        </div>
        <button type="button" onClick={() => save(false, false)}
          aria-label="Reject optional cookies and close" className="rounded p-1 text-zinc-300 hover:text-white">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-zinc-200">
        MealDeck uses essential storage for your basket, checkout, sign-in and security.
        Optional analytics and advertising cookies stay off unless you agree.
        You can change your choice at any time. Read our{" "}
        <a className="underline underline-offset-2" href="/privacy">privacy notice</a>.
      </p>
      {customising && (
        <fieldset className="mb-4 space-y-3 rounded-xl border border-zinc-700 p-4">
          <legend className="px-1 text-sm font-semibold">Choose optional cookies</legend>
          <div className="flex items-start gap-2 text-sm">
            <ShieldCheck size={18} aria-hidden="true" className="shrink-0 text-amber-300" />
            <span><strong>Strictly necessary — always on.</strong> Essential site functions and
              basket storage. We do not use these for advertising.</span>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={analytics} onChange={e => setAnalytics(e.target.checked)}
              className="mt-1" />
            <span><strong>Analytics (optional)</strong> — help us understand site usage. Disabled
              unless you select this.</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)}
              className="mt-1" />
            <span><strong>Advertising/personalisation (optional)</strong> — consent to future
              advertising measurement or personalised recommendations. Disabled by default.</span>
          </label>
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2 text-sm font-semibold">
        <button type="button" onClick={() => save(false, false)}
          className="rounded-lg border border-zinc-500 px-4 py-2.5 hover:border-white">
          Reject optional
        </button>
        {customising ? (
          <button type="button" onClick={() => save(analytics, marketing)}
            className="rounded-lg bg-amber-300 px-4 py-2.5 text-zinc-950 hover:bg-amber-200">
            Save my choices
          </button>
        ) : (
          <button type="button" onClick={() => setCustomising(true)}
            className="rounded-lg border border-zinc-500 px-4 py-2.5 hover:border-white">
            Customise
          </button>
        )}
        <button type="button" onClick={() => save(true, true)}
          className="rounded-lg bg-amber-300 px-4 py-2.5 text-zinc-950 hover:bg-amber-200">
          Accept optional
        </button>
      </div>
    </aside>
  );
}
