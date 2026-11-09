import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getMealDeckPublicBackend } from "@/lib/mealdeck-backend.functions";
import { readAuthEmailConfirmation } from "@/lib/mealdeck-auth-email-links";
import { readCustomerTokenConfirmation } from "@/lib/mealdeck-customer-email";
import logo from "@/assets/mealdeck-logo.png";

type TokenLink = NonNullable<ReturnType<typeof readCustomerTokenConfirmation>>;

export function AuthEmailConfirmation() {
  const originalFragment = useRef<string | null>(null);
  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  const [tokenLink, setTokenLink] = useState<TokenLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [failure, setFailure] = useState("");
  const [choosePassword, setChoosePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  useEffect(() => {
    let active = true;
    const fragment = originalFragment.current ?? window.location.hash;
    originalFragment.current = fragment;
    // Keep the one-time link out of history/address-bar copying after parsing.
    if (fragment) window.history.replaceState(window.history.state, "", window.location.pathname);
    const customer = readCustomerTokenConfirmation(fragment);
    if (customer) {
      setTokenLink(customer);
      setLoading(false);
      return;
    }
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

  async function continueWithToken() {
    if (!tokenLink || continuing) return;
    setContinuing(true);
    setFailure("");
    try {
      const { verifyCustomerEmailLink } = await import("@/lib/mealdeck-customer-browser");
      await verifyCustomerEmailLink(tokenLink.tokenHash, tokenLink.type);
      if (tokenLink.type === "recovery") {
        setChoosePassword(true);
        setContinuing(false);
        return;
      }
      window.location.assign(tokenLink.next);
    } catch {
      setFailure(
        "This link has expired or was already used. Request a fresh email from your MealDeck account page.",
      );
      setContinuing(false);
    }
  }

  async function savePassword() {
    if (savingPassword) return;
    setSavingPassword(true);
    setFailure("");
    try {
      const { setCustomerPassword } = await import("@/lib/mealdeck-customer-browser");
      await setCustomerPassword(password);
      window.location.assign("/account");
    } catch (reason) {
      setFailure(
        reason instanceof Error && reason.message
          ? reason.message
          : "Your password could not be saved. Please try again.",
      );
      setSavingPassword(false);
    }
  }

  const ready = Boolean(providerUrl || tokenLink);
  return (
    <main className="md-auth-confirm">
      <section className="md-auth-confirm-card" aria-labelledby="auth-confirm-title">
        <div className="md-auth-confirm-brand">
          <img src={logo} alt="MealDeck" />
        </div>
        <div className="md-auth-confirm-content">
          <p className="md-auth-confirm-eyebrow">Account security</p>
          <h1 id="auth-confirm-title">
            {choosePassword ? "Choose a new password" : "Continue securely to MealDeck"}
          </h1>
          {loading ? (
            <p role="status">Checking the secure account connection…</p>
          ) : choosePassword ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void savePassword();
              }}
            >
              <label className="md-account-field">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={savingPassword}
                />
              </label>
              <button type="submit" disabled={savingPassword}>
                {savingPassword ? "Saving…" : "Save password"}
              </button>
            </form>
          ) : ready ? (
            <>
              <p>Choose Continue to finish your requested MealDeck email confirmation.</p>
              <button
                type="button"
                disabled={continuing}
                onClick={() => {
                  if (tokenLink) {
                    void continueWithToken();
                    return;
                  }
                  if (!providerUrl || continuing) return;
                  setContinuing(true);
                  // Only a deliberate button press navigates. No token exchange runs on page load.
                  window.location.assign(providerUrl);
                }}
              >
                {continuing ? "Opening secure confirmation…" : "Continue"}
              </button>
              {!tokenLink && (
                <p className="md-auth-confirm-help">
                  Use the browser or device where you started. If this email opened somewhere else,
                  enter the email's one-time code on the original MealDeck screen.
                </p>
              )}
            </>
          ) : (
            <>
              <p role="alert">
                This link could not be checked. Open the latest MealDeck email again, or enter its
                code on the screen where you requested it.
              </p>
              <Link to="/account" search={{ signin: 1 }} className="md-auth-confirm-link">
                Go to your account
              </Link>
            </>
          )}
          {failure && <p role="alert">{failure}</p>}
          <p className="md-auth-confirm-help">
            Only continue if you requested the email. Keep its link and code private.
          </p>
        </div>
      </section>
    </main>
  );
}
