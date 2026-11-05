import { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Image, Platform, ScrollView, Text, View } from "react-native";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { enableAppSwitcherProtectionAsync, usePreventScreenCapture } from "expo-screen-capture";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StripeTerminalProvider } from "@stripe/stripe-terminal-react-native";
import { TerminalApi } from "./src/api/client";
import { trustedOrigin } from "./src/api/types";
import { useStaffAuth } from "./src/security/use-staff-auth";
import { SignIn } from "./src/SignIn";
import { TerminalConsole } from "./src/TerminalConsole";
import { Button, Card, Notice } from "./src/ui";
import { styles } from "./src/theme";
import logo from "./assets/logo.png";

const localeConfig = { type: "cardLanguagePreferenceIfAvailable" } as const;
function StaffApp() {
  usePreventScreenCapture("mealdeck-staff");
  useEffect(() => {
    if (Platform.OS === "ios") void enableAppSwitcherProtectionAsync(1).catch(() => {});
  }, []);
  const origin = trustedOrigin(String(Constants.expoConfig?.extra?.terminalApiOrigin ?? ""));
  const auth = useStaffAuth(origin);
  const api = useMemo(
    () => new TerminalApi(origin, auth.token, fetch, auth.onAuthFailure),
    [origin, auth.token, auth.onAuthFailure],
  );
  const tokenProvider = useCallback(() => api.connectionToken(), [api]);
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} accessibilityLabel="MealDeck" />
        <Text style={styles.headerText}>Staff payments</Text>
      </View>
      {auth.session ? (
        <StripeTerminalProvider
          key={auth.session.user.id}
          tokenProvider={tokenProvider}
          localeConfig={localeConfig}
          logLevel="none"
        >
          <TerminalConsole api={api} staffId={auth.session.user.id} onSignOut={auth.signOut} />
        </StripeTerminalProvider>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {auth.loading && (
            <Card>
              <ActivityIndicator color="#c9121d" />
              <Text style={styles.body}>
                Checking the MealDeck server and secure staff session…
              </Text>
            </Card>
          )}
          {!!auth.error && <Notice warning>{auth.error}</Notice>}
          {!auth.loading && auth.client && (
            <SignIn client={auth.client} mfaFactor={auth.mfaFactor} />
          )}
          {!auth.loading && !auth.client && (
            <Button title="Retry staff setup" onPress={auth.retry} />
          )}
          <Text style={styles.small}>
            Android and iPhone Tap to Pay use an approved native staff build. Internet access and
            authorised kitchen payment access are required.
          </Text>
          <Text style={styles.small}>MealDeck · 313 Brands Ltd · Powered by Dishbee</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StaffApp />
    </SafeAreaProvider>
  );
}
