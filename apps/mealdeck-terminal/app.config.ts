import type { ExpoConfig } from "expo/config";

const origin = new URL(process.env.MEALDECK_TERMINAL_API_ORIGIN ?? "https://mealdeck.co.uk");
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== "/"
)
  throw new Error(
    "MEALDECK_TERMINAL_API_ORIGIN must be an approved HTTPS origin, without credentials or paths.",
  );

const config: ExpoConfig = {
  name: "MealDeck Staff",
  slug: "mealdeck-terminal",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "mealdeck-terminal",
  platforms: ["ios", "android"],
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  extra: { terminalApiOrigin: origin.origin },
  updates: { enabled: false },
  ios: {
    bundleIdentifier: "uk.co.mealdeck.terminal",
    supportsTablet: false,
    entitlements: { "com.apple.developer.proximity-reader.payment.acceptance": true },
    infoPlist: {
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "uk.co.mealdeck.terminal",
    allowBackup: false,
    permissions: [
      "android.permission.INTERNET",
      "android.permission.NFC",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.BLUETOOTH_SCAN",
    ],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
  },
  plugins: [
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 33,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          kotlinVersion: "2.2.0",
          usesCleartextTraffic: false,
        },
        ios: { deploymentTarget: "16.4" },
      },
    ],
    ["expo-secure-store", { configureAndroidBackup: true }],
    "./plugins/withTerminalBuild.cjs",
    [
      "@stripe/stripe-terminal-react-native",
      {
        locationWhenInUsePermission:
          "MealDeck uses your location to verify that this phone can accept payments at the authorised kitchen.",
        bluetoothAlwaysUsagePermission:
          "Stripe Terminal uses Bluetooth to connect to supported payment readers.",
        bluetoothPeripheralPermission: "Stripe Terminal needs access to supported payment readers.",
        bluetoothBackgroundMode: false,
        appDelegate: true,
        tapToPayCheck: true,
      },
    ],
  ],
};
export default config;
