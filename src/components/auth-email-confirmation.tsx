import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getMealDeckPublicBackend } from "@/lib/mealdeck-backend.functions";
import { readAuthEmailConfirmation } from "@/lib/mealdeck-auth-email-links";
import logo from "@/assets/mealdeck-logo.png";

export function AuthEmailConfirmation() {
  const originalFragment = useRef<string | null>(null);
  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);
  useEffect(() => {
    let active = true;
    const fragment = originalFragment.current ?? window.location.hash;
    originalFragment.current = fragment;
    // Keep the one-time link out of history/address-bar copying after parsing.
    if (fragment) window.history.replaceState(window.history.state, "", window.location.pathname);
    void getMealDeckPublicBackend()
      .then((result) => {
        if (active && result.status === "ready")
          setProviderUrl(readAuthEmailConfirmation(fragment, result.backend.url));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="md-auth-confirm">
      <section className="md-auth-confirm-card" aria-labelledby="auth-confirm-title">
        <div className="md-auth-confirm-brand">
          <img src={logo} alt="MealDeck" />
        </div>
        <div className="md-auth-confirm-content">
          <p className="md-auth-confirm-eyebrow">Account security</p>
          <h1 id="auth-confirm-title">Continue securely to MealDeck</h1>
          {loading ? (
            <p role="status">Checking the secure account connection…</p>
          ) : providerUrl ? (
            <>
              <p>
                Choose Continue to open your requested email confirmation with MealDeck's sign-in
                service.
              </p>
              <button
                type="button"
                disabled={continuing}
                onClick={() => {
                  if (!providerUrl || continuing) return;
                  setContinuing(true);
                  // Only a deliberate button press navigates. No token exchange runs on page load.
                  window.location.assign(providerUrl);
                }}
              >
                {continuing ? "Opening secure confirmation…" : "Continue"}
              </button>
              <p className="md-auth-confirm-help">
                Use the browser or device where you started. If this email opened somewhere else,
                enter the email's one-time code on the original MealDeck screen.
              </p>
            </>
          ) : (
            <>
              <p role="alert">
                This link could not be checked. Open the latest MealDeck email again, or enter its
                code on the screen where you requested it.
              </p>
              <Link to="/account" className="md-auth-confirm-link">
                Go to your account
              </Link>
            </>
          )}
          <p className="md-auth-confirm-help">
            Only continue if you requested the email. Keep its link and code private.
          </p>
        </div>
      </section>
    </main>
  );
}
