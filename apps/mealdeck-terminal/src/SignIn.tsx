import { useState } from "react";
import { Text, TextInput } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button, Card, Notice } from "./ui";
import { styles } from "./theme";

export function SignIn({
  client,
  mfaFactor,
}: {
  client: SupabaseClient;
  mfaFactor: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(kind: "password" | "send" | "verify" | "mfa") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result =
        kind === "mfa" && mfaFactor
          ? await client.auth.mfa.challengeAndVerify({ factorId: mfaFactor, code })
          : kind === "send"
            ? await client.auth.signInWithOtp({
                email: email.trim(),
                options: { shouldCreateUser: false },
              })
            : kind === "verify"
              ? await client.auth.verifyOtp({ email: email.trim(), token: code, type: "email" })
              : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (kind === "send") {
        setSent(true);
        setMessage(
          "Enter the sign-in code from your staff email. Ask your manager if your email template currently provides a link instead of a code.",
        );
      } else {
        setPassword("");
        setCode("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text style={styles.title}>{mfaFactor ? "Verify your staff sign-in" : "Staff sign-in"}</Text>
      <Text style={styles.body}>
        Use your invited MealDeck staff account. Payment access is checked with the kitchen after
        sign-in.
      </Text>
      {!mfaFactor && (
        <>
          <Text style={styles.label}>Staff email</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Staff email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            editable={!busy && !sent}
          />
        </>
      )}
      {mfaFactor || sent ? (
        <>
          <Text style={styles.label}>{mfaFactor ? "Authenticator code" : "Email code"}</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Sign-in code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={10}
            editable={!busy}
          />
          <Button
            title={busy ? "Verifying…" : "Verify code"}
            disabled={busy || code.length < 6}
            onPress={() => void submit(mfaFactor ? "mfa" : "verify")}
          />
          {!mfaFactor && (
            <Button
              secondary
              title="Use password instead"
              disabled={busy}
              onPress={() => {
                setSent(false);
                setCode("");
              }}
            />
          )}
        </>
      ) : (
        <>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Staff password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!busy}
          />
          <Button
            title={busy ? "Signing in…" : "Sign in"}
            disabled={busy || !email.trim() || !password}
            onPress={() => void submit("password")}
          />
          <Button
            secondary
            title="Email me a sign-in code"
            disabled={busy || !email.trim()}
            onPress={() => void submit("send")}
          />
        </>
      )}
      {!!message && <Notice warning>{message}</Notice>}
    </Card>
  );
}
