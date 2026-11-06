import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getNetworkStateAsync, useNetworkState } from "expo-network";
import { randomUUID } from "expo-crypto";
import {
  requestNeededAndroidPermissions,
  useStripeTerminal,
  type Reader,
} from "@stripe/stripe-terminal-react-native";
import type { TerminalApi } from "./api/client";
import type { TerminalConfig } from "./api/types";
import { PaymentController } from "./payment/controller";
import { recoveryJournal } from "./security/storage";
import { presentHowToTap } from "../modules/mealdeck-tap-education";
import { SaleComposer } from "./SaleComposer";
import { Button, Card, Notice } from "./ui";
import { money, styles } from "./theme";

const prompts: Record<Reader.DisplayMessage, string> = {
  insertCard:
    "This card needs insertion. Use an approved physical reader or another card after checking this payment.",
  insertOrSwipeCard: "Use an approved physical reader or another card after checking this payment.",
  multipleContactlessCardsDetected: "Present one card or wallet at a time.",
  removeCard: "Remove the card.",
  retryCard: "Try the card again and follow the reader instructions.",
  swipeCard: "This card needs a supported physical reader.",
  tryAnotherCard: "Ask the customer to try another card.",
  tryAnotherReadMethod: "This card needs another payment method. Check the current attempt first.",
  checkMobileDevice: "Ask the customer to check their wallet device.",
  cardRemovedTooEarly: "Keep the card against the phone until the reader has finished.",
};
const activePhases = new Set(["loading", "preparing", "collecting", "confirming", "checking"]);
const readableSdkError = (error: { code?: string; message?: string }) =>
  (
    error.message ||
    error.code ||
    "This phone could not connect. Check its permissions, internet connection and device requirements."
  ).replace(/(?:pi_\w+_secret_\w+|(?:sk|rk)_(?:live|test)_\w+)/g, "[redacted]");

export function TerminalConsole({
  api,
  staffId,
  onSignOut,
}: {
  api: TerminalApi;
  staffId: string;
  onSignOut(): Promise<void>;
}) {
  const [config, setConfig] = useState<TerminalConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [readerMessage, setReaderMessage] = useState(
    "Check this phone before connecting Tap to Pay.",
  );
  const [readerBusy, setReaderBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [educated, setEducated] = useState(Platform.OS !== "ios");
  const [educationFallback, setEducationFallback] = useState(false);
  const [reference, setReference] = useState("");
  const [saleOpen, setSaleOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const network = useNetworkState();
  const sdk = useStripeTerminal({
    onDidRequestReaderDisplayMessage: (value) => setReaderMessage(prompts[value]),
    onDidRequestReaderInput: () =>
      setReaderMessage(
        "Present a contactless card or wallet. Follow the secure reader instructions.",
      ),
    onDidStartReaderReconnect: () =>
      setReaderMessage(
        "Reader connection interrupted. Reconnecting; check the same payment before retrying.",
      ),
    onDidSucceedReaderReconnect: () =>
      setReaderMessage("Reader reconnected. Any interrupted payment still needs a server check."),
    onDidFailReaderReconnect: () =>
      setReaderMessage(
        "Reader disconnected. Reconnect this phone, then check the existing payment.",
      ),
    onDidDisconnect: () =>
      setReaderMessage("Reader disconnected. Existing payment recovery has been kept."),
  });
  const sdkRef = useRef(sdk);
  sdkRef.current = sdk;
  const configRef = useRef(config);
  configRef.current = config;
  const [controller] = useState(
    () =>
      new PaymentController({
        api,
        sdk: {
          retrieve: (secret) => sdkRef.current.retrievePaymentIntent(secret),
          collect: (paymentIntent) =>
            sdkRef.current.collectPaymentMethod({
              paymentIntent,
              skipTipping: true,
              skipDonation: true,
              customerCancellation: "enableIfAvailable",
              requestDynamicCurrencyConversion: false,
            }),
          confirm: (paymentIntent) => sdkRef.current.confirmPaymentIntent({ paymentIntent }),
          cancelCollection: () => sdkRef.current.cancelCollectPaymentMethod(),
        },
        journal: recoveryJournal(staffId),
        online: async () => {
          const value = await getNetworkStateAsync();
          return value.isConnected === true && value.isInternetReachable === true;
        },
        canCollect: () => configRef.current?.ready === true && !!sdkRef.current.connectedReader,
        liveMode: () => configRef.current?.mode === "live",
        uuid: randomUUID,
      }),
  );
  const payment = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const active = activePhases.has(payment.phase);

  const refreshConfig = useCallback(async () => {
    try {
      const next = await api.config();
      setConfig(next);
      setConfigError("");
      if (!next.simulationAllowed) setSimulated(false);
    } catch (error) {
      setConfig(null);
      setConfigError(
        error instanceof Error ? error.message : "Staff permissions could not be checked.",
      );
    }
  }, [api]);
  useEffect(() => {
    void refreshConfig();
    void controller.restore();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshConfig();
        if (controller.getSnapshot().recovery) void controller.reconcile();
      }
    });
    return () => {
      listener.remove();
      void sdkRef.current
        .disconnectReader()
        .then(() => sdkRef.current.clearCachedCredentials())
        .catch(() => {});
    };
  }, [controller, refreshConfig]);

  async function educate() {
    setReaderBusy(true);
    try {
      const result = await presentHowToTap();
      if (result === "fallback") setEducationFallback(true);
      else {
        setEducated(true);
        setReaderMessage("After closing Apple's How to Tap guide, check and connect this phone.");
      }
    } catch (error) {
      setReaderMessage(error instanceof Error ? error.message : "How to Tap could not be opened.");
    } finally {
      setReaderBusy(false);
    }
  }

  async function discover() {
    if (readerBusy || !config?.ready || !educated) return;
    setReaderBusy(true);
    try {
      const fresh = await api.config();
      setConfig(fresh);
      if (!fresh.ready) throw new Error(fresh.message);
      if (Platform.OS === "android") {
        const granted = await requestNeededAndroidPermissions({
          accessFineLocation: {
            title: "Allow payment location checks",
            message:
              "Stripe Terminal needs location and nearby-device permissions to check this phone and accept payments at the authorised kitchen.",
            buttonPositive: "Continue",
          },
        });
        if (!granted)
          throw new Error(
            "Allow the required location and nearby-device permissions in Settings, then check this phone again.",
          );
      }
      if (!initialized) {
        const result = await sdk.initialize();
        if (result.error) throw new Error(readableSdkError(result.error));
        setInitialized(true);
      }
      const result = await sdk.discoverReaders({
        discoveryMethod: "tapToPay",
        simulated: fresh.mode === "test" && fresh.simulationAllowed && simulated,
      });
      if (result.error) throw new Error(readableSdkError(result.error));
      setReaderMessage("Choose this phone below to connect it to the authorised kitchen.");
    } catch (error) {
      setReaderMessage(error instanceof Error ? error.message : "This phone could not be checked.");
    } finally {
      setReaderBusy(false);
    }
  }

  async function connect(reader: Reader.Type) {
    if (readerBusy || !config?.stripeLocationId) return;
    setReaderBusy(true);
    try {
      const result = await sdk.connectReader({
        discoveryMethod: "tapToPay",
        reader,
        locationId: config.stripeLocationId,
        merchantDisplayName: "MealDeck",
        autoReconnectOnUnexpectedDisconnect: true,
      });
      if (result.error) throw new Error(readableSdkError(result.error));
      setReaderMessage("Tap to Pay connected. Review the order before asking the customer to tap.");
    } catch (error) {
      setReaderMessage(error instanceof Error ? error.message : "Tap to Pay could not connect.");
    } finally {
      setReaderBusy(false);
    }
  }

  async function signOut() {
    if (active || readerBusy || signingOut) return;
    setSigningOut(true);
    try {
      if (sdk.connectedReader) {
        const disconnected = await sdk.disconnectReader();
        if (disconnected?.error) throw new Error("Disconnect this reader before signing out.");
      }
      if (initialized) {
        const cleared = await sdk.clearCachedCredentials();
        if (cleared.error)
          throw new Error(
            "Reader credentials could not be cleared. Restart this app before another staff member signs in.",
          );
      }
      await onSignOut();
    } catch (error) {
      setReaderMessage(error instanceof Error ? error.message : "Sign-out could not be completed.");
    } finally {
      setSigningOut(false);
    }
  }

  const amount = payment.order?.remainingPence ?? payment.quote?.totalPence ?? 0;
  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.row}>
            <Text style={styles.heading}>{config?.kitchen.name ?? "Checking kitchen access"}</Text>
            <Text style={styles.label}>
              {config?.mode === "live" ? "LIVE" : config?.mode === "test" ? "TEST MODE" : ""}
            </Text>
          </View>
          {config?.mode === "test" && (
            <Notice warning>
              Test payments only. Do not use this mode to take real customer payment.
            </Notice>
          )}
          {!!configError && <Notice warning>{configError}</Notice>}
          {config && !config.ready && <Notice warning>{config.message}</Notice>}
          {(network.isConnected === false || network.isInternetReachable === false) && (
            <Notice warning>
              Offline. New payments are unavailable. Reconnect to check any existing attempt.
            </Notice>
          )}
          <Button
            secondary
            title="Refresh staff payment access"
            disabled={active || readerBusy}
            onPress={() => void refreshConfig()}
          />
        </Card>
        <Card>
          <Text style={styles.heading}>
            Tap to Pay on {Platform.OS === "ios" ? "iPhone" : "Android"}
          </Text>
          <Notice>{readerMessage}</Notice>
          {Platform.OS === "ios" && (
            <Button
              secondary
              title="Open How to Tap"
              disabled={active || readerBusy}
              onPress={() => void educate()}
            />
          )}
          {!sdk.connectedReader && (
            <>
              <Text style={styles.small}>
                {Platform.OS === "ios"
                  ? "Use a supported, updated iPhone with the approved native app. The first connection may require the business's Apple account to review Apple's terms."
                  : "Use a supported NFC Android phone with current security updates, Google Play services, an unmodified OS and a locked bootloader. Turn off Developer options for real Tap to Pay. The SDK checks eligibility."}
              </Text>
              {config?.mode === "test" && config.simulationAllowed && (
                <View style={styles.row}>
                  <Text style={[styles.body, { flex: 1 }]}>Simulated reader · test mode only</Text>
                  <Switch
                    accessibilityLabel="Use simulated test reader"
                    value={simulated}
                    disabled={readerBusy || active}
                    onValueChange={setSimulated}
                  />
                </View>
              )}
              <Button
                title={readerBusy ? "Checking this phone…" : "Check this phone"}
                disabled={!config?.ready || readerBusy || active || !educated}
                onPress={() => void discover()}
              />
              {sdk.discoveredReaders.map((reader) => (
                <Button
                  key={reader.serialNumber ?? reader.id}
                  title={simulated ? "Connect simulated test reader" : "Connect this phone"}
                  disabled={readerBusy || active}
                  onPress={() => void connect(reader)}
                />
              ))}
            </>
          )}
          <Button
            secondary
            title="View supported device requirements"
            disabled={active}
            onPress={() =>
              void Linking.openURL(
                "https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=" +
                  (Platform.OS === "ios" ? "ios" : "android"),
              )
            }
          />
        </Card>
        {!payment.recovery && (
          <Card>
            <Text style={styles.heading}>New or existing order</Text>
            <Button
              title="New walk-in or kerbside sale"
              disabled={!config?.ready || !config.canCreateSale || active}
              onPress={() => setSaleOpen(true)}
            />
            {config && !config.canCreateSale && (
              <Text style={styles.small}>
                New staff sales are unavailable until this kitchen's sale permissions and pricing
                are configured.
              </Text>
            )}
            <Text style={styles.label}>Existing order reference or handoff code</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Order reference or handoff code"
              value={reference}
              onChangeText={setReference}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!active}
              maxLength={64}
            />
            <Button
              secondary
              title="Find original order"
              disabled={active || !reference.trim()}
              onPress={() => void controller.lookup(reference)}
            />
          </Card>
        )}
        <Card>
          <Text style={styles.heading}>
            {payment.phase === "paid"
              ? "Payment confirmed by MealDeck"
              : payment.quote
                ? "Review the kitchen quote"
                : payment.order
                  ? "Review the original order"
                  : "Payment status"}
          </Text>
          {!!payment.order && (
            <>
              <Text style={styles.body}>
                {payment.order.orderNumber ? `Order ${payment.order.orderNumber}` : `Reference ${payment.order.orderId}`}
              </Text>
              {!!payment.order.handoffCode && (
                <Text style={styles.small}>Collection code {payment.order.handoffCode}</Text>
              )}
              <Text style={styles.small}>
                {payment.order.kitchenName} ·{" "}
                {payment.order.fulfilment === "curbside" ? "Kerbside" : "Pickup / walk-in"}
              </Text>
              {payment.order.lines.map((line, index) => (
                <View key={index} style={{ gap: 4 }}>
                  <View style={styles.row}>
                    <Text style={[styles.body, { flex: 1 }]}>
                      {line.quantity} × {line.name}
                    </Text>
                    <Text style={styles.label}>{money(line.linePence)}</Text>
                  </View>
                  {!!line.description && <Text style={styles.small}>{line.description}</Text>}
                </View>
              ))}
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={styles.body}>Order total</Text>
                <Text style={styles.body}>{money(payment.order.totalPence)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.body}>Already paid</Text>
                <Text style={styles.body}>{money(payment.order.paidPence)}</Text>
              </View>
            </>
          )}
          {!!payment.quote && (
            <>
              {payment.quote.lines.map((line) => (
                <View key={line.lineId} style={{ gap: 4 }}>
                  <View style={styles.row}>
                    <Text style={[styles.body, { flex: 1 }]}>
                      {line.quantity} × {line.name}
                    </Text>
                    <Text style={styles.label}>{money(line.line_pence)}</Text>
                  </View>
                  {!!line.modifiers.length && (
                    <Text style={styles.small}>
                      {line.modifiers.map((value) => value.name).join(" · ")}
                    </Text>
                  )}
                </View>
              ))}
              <View style={styles.row}>
                <Text style={styles.body}>Before discount</Text>
                <Text style={styles.body}>{money(payment.quote.grossPence)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.body}>Kitchen discount</Text>
                <Text style={styles.body}>−{money(payment.quote.discountPence)}</Text>
              </View>
              <Text style={styles.small}>
                {payment.quote.packingPlan.cutleryRequested
                  ? "Include cutlery"
                  : "No cutlery requested"}{" "}
                · {payment.quote.packingPlan.bags.length} bag
                {payment.quote.packingPlan.bags.length === 1 ? "" : "s"}
              </Text>
              {payment.quote.collectionEstimateMinutes !== null && (
                <Text style={styles.small}>
                  Kitchen collection estimate: {payment.quote.collectionEstimateMinutes} minutes
                  after payment.
                </Text>
              )}
            </>
          )}
          {(payment.order || payment.quote) && (
            <>
              <Text style={styles.label}>Balance to collect</Text>
              <Text style={styles.amount}>{money(amount)}</Text>
            </>
          )}
          <Notice
            warning={
              payment.phase === "pending" || payment.phase === "hold" || payment.phase === "error"
            }
          >
            {payment.message}
          </Notice>
          {active && (
            <ActivityIndicator color="#c9121d" accessibilityLabel="Payment operation in progress" />
          )}
          {payment.phase === "paid" && (
            <Text style={styles.body}>
              Payment is confirmed. Kitchen acceptance, preparation, packing and handoff continue on
              the shared order.
            </Text>
          )}
          {["review", "retryable"].includes(payment.phase) && (
            <Button
              title={
                (payment.recovery ? "Retry the same payment · " : "Take payment · ") + money(amount)
              }
              disabled={
                !config?.ready ||
                !sdk.connectedReader ||
                amount <= 0 ||
                (payment.order !== null && !payment.order.canCollect) ||
                active
              }
              onPress={() => void controller.collect()}
            />
          )}
          {!!payment.recovery && (
            <>
              <Button
                secondary
                title="Check existing payment"
                disabled={active}
                onPress={() => void controller.reconcile()}
              />
              {!payment.order && (
                <Button
                  secondary
                  title="Recover original payment request"
                  disabled={active || !config?.ready}
                  onPress={() => void controller.retryPreparation()}
                />
              )}
              <Button
                secondary
                title={
                  payment.phase === "collecting"
                    ? "Cancel card collection"
                    : "Cancel this unpaid attempt"
                }
                disabled={active && payment.phase !== "collecting"}
                onPress={() => void controller.cancel()}
              />
              <Text style={styles.small}>
                This device keeps the original recovery reference. Do not charge on another device
                while the result is uncertain.
              </Text>
            </>
          )}
          {payment.phase === "error" && !payment.recovery && (
            <Button
              secondary
              title="Check saved payment recovery"
              onPress={() => void controller.restore()}
            />
          )}
        </Card>
        <Button
          secondary
          title={signingOut ? "Signing out…" : "Sign out of staff account"}
          disabled={active || readerBusy || signingOut}
          onPress={() => void signOut()}
        />
        <Text style={styles.small}>
          MealDeck is a trading name of 313 Brands Ltd. Powered by Dishbee.
        </Text>
      </ScrollView>
      <SaleComposer
        visible={saleOpen}
        api={api}
        onClose={() => setSaleOpen(false)}
        onQuote={(quote) => {
          controller.reviewQuote(quote);
          setSaleOpen(false);
        }}
      />
      <Modal
        visible={educationFallback}
        animationType="slide"
        onRequestClose={() => setEducationFallback(false)}
      >
        <SafeAreaView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>How to Tap on iPhone</Text>
            <Card>
              <Text style={styles.body}>
                1. Review the customer's order and amount, then select Take payment.
              </Text>
              <Text style={styles.body}>
                2. Ask the customer to hold their contactless card horizontally at the top of the
                iPhone, or bring their wallet device close to the top.
              </Text>
              <Text style={styles.body}>
                3. Keep the card or wallet in place until the secure reader screen finishes. If
                asked for a PIN, the customer enters it directly in the secure reader screen.
              </Text>
              <Text style={styles.body}>
                4. Wait for MealDeck to confirm payment. If the card needs insertion, reconcile this
                attempt before using an approved physical reader or another payment method.
              </Text>
            </Card>
            <Notice>
              Use an updated, supported iPhone. On iOS 18 and later, this app opens Apple's current
              merchant education directly.
            </Notice>
            <Button
              title="I've read How to Tap"
              onPress={() => {
                setEducated(true);
                setEducationFallback(false);
              }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
