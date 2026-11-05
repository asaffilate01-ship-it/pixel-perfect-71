const {
  withProjectBuildGradle,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withPodfile,
} = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = function withTerminalBuild(config) {
  config = withPodfile(config, (mod) => {
    const marker = "# MealDeck: pin the reviewed Stripe Terminal native package";
    if (!mod.modResults.contents.includes(marker)) {
      const pin = `\n    ${marker}\n    ([installer.pods_project] + installer.aggregate_targets.map(&:user_project)).compact.uniq.each do |project|\n      project.root_object.package_references.each do |reference|\n        if reference.respond_to?(:repositoryURL) && reference.repositoryURL == 'https://github.com/stripe/stripe-terminal-ios-spm'\n          reference.requirement = { 'kind' => 'exactVersion', 'version' => '6.0.0' }\n        end\n      end\n      project.save\n    end\n`;
      const tail = /\n  end\nend\s*$/;
      if (!tail.test(mod.modResults.contents))
        throw new Error("Review the new CocoaPods template before pinning Stripe Terminal.");
      mod.modResults.contents = mod.modResults.contents.replace(tail, pin + "\n  end\nend\n");
    }
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    const guard = /\s*if\s*\(TapToPay\.isInTapToPayProcess\(\)\)\s*\{\s*return\s*\}/g;
    if (!mod.modResults.contents.includes("TapToPay.isInTapToPayProcess"))
      throw new Error(
        "Stripe's Tap to Pay process guard was not installed. Review the native plugin order.",
      );
    mod.modResults.contents = mod.modResults.contents
      .replace(guard, "")
      .replace(
        "super.onCreate()",
        "super.onCreate()\n    if (TapToPay.isInTapToPayProcess()) { return }",
      );
    return mod;
  });
  config = withProjectBuildGradle(config, (mod) => {
    // Stripe Terminal 6 needs Kotlin >=2.2. Set the compiler dependency as well as the property.
    const original = mod.modResults.contents;
    let source = original.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]*)?['"]\)/g,
      'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.0")',
    );
    if (!source.includes("kotlin-gradle-plugin:2.2.0"))
      throw new Error("Review the new Android template before selecting its Kotlin compiler.");
    mod.modResults.contents = source;
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const features = manifest["uses-feature"] ?? [];
    if (!features.some((feature) => feature.$["android:name"] === "android.hardware.nfc"))
      features.push({ $: { "android:name": "android.hardware.nfc", "android:required": "true" } });
    manifest["uses-feature"] = features;
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const file = path.join(
        mod.modRequest.platformProjectRoot,
        "gradle/wrapper/gradle-wrapper.properties",
      );
      const source = await fs.readFile(file, "utf8");
      await fs.writeFile(
        file,
        source.replace(/gradle-[\d.]+-(?:all|bin)\.zip/g, "gradle-9.0.0-bin.zip"),
      );
      return mod;
    },
  ]);
};
