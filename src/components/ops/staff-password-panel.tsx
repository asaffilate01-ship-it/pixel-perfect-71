import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMealDeckOpsClient } from "@/lib/mealdeck-ops-browser";
import { STAFF_PASSWORD_ACCOUNTS } from "@/lib/mealdeck-staff-passwords";
import { setStaffPassword } from "@/lib/mealdeck-staff-passwords.functions";

export function StaffPasswordPanel() {
  const [email, setEmail] = useState<string>(STAFF_PASSWORD_ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [confirmEmailOwnership, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const save = useServerFn(setStaffPassword);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (password !== repeat) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const client = getMealDeckOpsClient();
      const session = await client.auth.getSession();
      if (session.error || !session.data.session) throw new Error("Sign in as the MealDeck owner first.");
      const result = await save({ data: { email, password, confirmEmailOwnership }, headers: {
        Authorization: "Bearer " + session.data.session.access_token,
      } });
      setNotice(`Password set for ${result.email}.${result.emailVerified ? "" : " Email verification is still required before sign-in."}`);
      setConfirm(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The password could not be set."); }
    finally { setPassword(""); setRepeat(""); setBusy(false); }
  }
  return <section className="md-ops-card p-5 space-y-4" aria-labelledby="staff-password-title">
    <h2 id="staff-password-title" className="text-lg font-semibold md-ops-text">Account passwords</h2>
    <form onSubmit={submit} className="space-y-4 max-w-lg">
      <label className="block text-sm md-ops-text">Account
        <select className="md-ops-field mt-1 w-full" value={email} disabled={busy} onChange={(e) => { setEmail(e.target.value); setPassword(""); setRepeat(""); setConfirm(false); setNotice(""); setError(""); }}>
          {STAFF_PASSWORD_ACCOUNTS.map((a) => <option key={a.email}>{a.email}</option>)}
        </select>
      </label>
      <label className="block text-sm md-ops-text">New password
        <input className="md-ops-field mt-1 w-full" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="block text-sm md-ops-text">Repeat password
        <input className="md-ops-field mt-1 w-full" type="password" autoComplete="new-password" required disabled={busy} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      <label className="flex items-start gap-3 text-sm md-ops-text">
        <input type="checkbox" checked={confirmEmailOwnership} disabled={busy} onChange={(e) => setConfirm(e.target.checked)} />
        I confirm this address belongs to MealDeck and approve marking this internal account’s email verified.
      </label>
      <Button type="submit" disabled={busy} className="md-ops-button md-ops-primary"><KeyRound size={16} />{busy ? "Saving…" : "Set password"}</Button>
      {error && <p role="alert" className="md-ops-status md-ops-status-error">{error}</p>}
      {notice && <p role="status" className="text-sm md-ops-text">{notice}</p>}
    </form>
  </section>;
}