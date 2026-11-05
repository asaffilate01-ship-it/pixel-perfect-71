import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  createClient,
  processLock,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { TerminalApi } from "../api/client";
import { refreshTokenKey, secureDelete, secureRead, secureWrite } from "./storage";

export function useStaffAuth(origin: string) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const keyRef = useRef(refreshTokenKey);
  const [session, setSession] = useState<Session | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mfaFactor, setMfaFactor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    let appSubscription: ReturnType<typeof AppState.addEventListener> | undefined;
    async function start() {
      setLoading(true);
      setError("");
      setSession(null);
      try {
        const bootstrap = await new TerminalApi(origin, async () => null).bootstrap();
        if (!bootstrap.auth)
          throw new Error(
            bootstrap.message || "Staff sign-in is not configured on this MealDeck server.",
          );
        const auth = createClient(bootstrap.auth.url, bootstrap.auth.publishableKey, {
          auth: {
            persistSession: false,
            detectSessionInUrl: false,
            autoRefreshToken: true,
            lock: processLock,
          },
        });
        const storageKey = refreshTokenKey + "-" + new URL(bootstrap.auth.url).hostname;
        keyRef.current = storageKey;
        clientRef.current = auth;
        async function accept(next: Session | null) {
          try {
            if (!next) {
              await secureDelete(storageKey);
              if (active) {
                setSession(null);
                setMfaFactor(null);
              }
              return;
            }
            // Only the short refresh token is persisted. Access tokens remain in memory.
            await secureWrite(storageKey, next.refresh_token);
            const { data: assurance, error: assuranceError } =
              await auth.auth.mfa.getAuthenticatorAssuranceLevel();
            if (assuranceError) throw assuranceError;
            if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
              const factors = await auth.auth.mfa.listFactors();
              const factor = factors.data?.totp.find((entry) => entry.status === "verified");
              if (!factor)
                throw new Error(
                  "Complete your staff account's second-factor setup with your manager.",
                );
              if (active) {
                setMfaFactor(factor.id);
                setSession(null);
              }
            } else if (active) {
              setMfaFactor(null);
              setSession(next);
            }
          } catch {
            if (active) {
              setSession(null);
              setError(
                "This phone could not safely restore the staff session. Sign in again or ask your manager to check secure storage.",
              );
            }
          }
        }
        const saved = await secureRead(storageKey);
        if (saved) {
          const restored = await auth.auth.refreshSession({ refresh_token: saved });
          if (restored.error) await secureDelete(storageKey);
          else await accept(restored.data.session);
        }
        if (!active) {
          auth.auth.stopAutoRefresh();
          return;
        }
        const subscription = auth.auth.onAuthStateChange((event, next) => {
          if (event === "INITIAL_SESSION") return;
          // Return synchronously: never call another Auth method while its notification lock is held.
          setTimeout(() => {
            if (active) void accept(next);
          }, 0);
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
        appSubscription = AppState.addEventListener("change", (state) => {
          if (state === "active") auth.auth.startAutoRefresh();
          else auth.auth.stopAutoRefresh();
        });
        if (AppState.currentState === "active") auth.auth.startAutoRefresh();
        setClient(auth);
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error ? failure.message : "Staff sign-in could not be loaded.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void start();
    return () => {
      active = false;
      unsubscribe();
      appSubscription?.remove();
      clientRef.current?.auth.stopAutoRefresh();
    };
  }, [origin, revision]);

  const token = useCallback(async () => {
    const value = await clientRef.current?.auth.getSession();
    if (value?.error) throw value.error;
    return value?.data.session?.access_token ?? null;
  }, []);
  const signOut = useCallback(async () => {
    // Do not delete payment recovery: the next authorised session must reconcile it.
    await secureDelete(keyRef.current);
    await clientRef.current?.auth.signOut({ scope: "local" });
    setSession(null);
    setMfaFactor(null);
  }, []);
  const onAuthFailure = useCallback(
    (failure: { code: string; status: number }) => {
      if (failure.code === "mfa_required") {
        setSession(null);
        void clientRef.current?.auth.mfa
          .listFactors()
          .then(({ data, error: factorError }) => {
            const factor = data?.totp.find((entry) => entry.status === "verified");
            if (factorError || !factor)
              setError(
                "Your staff account requires a second factor. Ask your manager to check the account's authenticator setup.",
              );
            else {
              setMfaFactor(factor.id);
              setError("");
            }
          })
          .catch(() => {
            setMfaFactor(null);
            setError(
              "Reconnect and sign in again to complete your staff account's second-factor check.",
            );
          });
      } else if (failure.status === 401) {
        void signOut().catch(() => {
          setSession(null);
          setError("Sign in again to check the saved payment attempt.");
        });
      }
    },
    [signOut],
  );
  return {
    session,
    client,
    loading,
    error,
    mfaFactor,
    token,
    signOut,
    onAuthFailure,
    retry: () => setRevision((value) => value + 1),
  };
}
