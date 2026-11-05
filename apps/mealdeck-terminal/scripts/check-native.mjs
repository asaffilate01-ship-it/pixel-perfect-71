import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(file, "utf8");
const application = read("android/app/src/main/java/uk/co/mealdeck/terminal/MainApplication.kt");
const guard = application.indexOf("if (TapToPay.isInTapToPayProcess())");
assert.ok(guard > application.indexOf("super.onCreate()"));
assert.ok(guard < application.indexOf("TerminalApplicationDelegate.onCreate(this)"));
assert.ok(guard < application.indexOf("loadReactNative(this)"));
assert.match(read("android/build.gradle"), /kotlin-gradle-plugin:2\.2\.0/);
assert.match(read("android/gradle.properties"), /android\.minSdkVersion=33/);
assert.match(read("android/gradle/wrapper/gradle-wrapper.properties"), /gradle-9\.0\.0-bin\.zip/);
assert.match(read("android/app/src/main/AndroidManifest.xml"), /android\.permission\.NFC/);
assert.match(
  read("ios/MealDeckStaff/MealDeckStaff.entitlements"),
  /com\.apple\.developer\.proximity-reader\.payment\.acceptance/,
);
assert.match(read("ios/MealDeckStaff/Info.plist"), /NSLocationWhenInUseUsageDescription/);
assert.match(read("ios/Podfile"), /exactVersion.*6\.0\.0/);
const result = spawnSync(
  "node_modules/.bin/expo-modules-autolinking",
  ["resolve", "--platform", "apple", "--json"],
  { encoding: "utf8" },
);
assert.equal(result.status, 0, result.stderr);
const resolved = JSON.parse(result.stdout);
assert.ok(
  resolved.modules.some((entry) =>
    entry.modules?.some((module) => module.class === "MealDeckTapEducationModule"),
  ),
);
console.log(
  "Native configuration verified: process guard, Kotlin, Gradle, permissions, entitlement, exact Stripe iOS package and education autolinking.",
);
