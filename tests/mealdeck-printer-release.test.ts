import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  H10S_RELEASE_APK,
  H10S_RELEASE_SHA256,
  H10S_RELEASE_VERSION,
  isVerifiedH10SReleaseManifest,
} from "../src/lib/mealdeck-printer-release";

const releasedManifest = readFileSync(
  new URL("../public/downloads/mealdeck-printer-h10s-0.2.3.apk.sha256", import.meta.url),
  "utf8",
);

describe("signed H10S v0.2.3 download advertisement", () => {
  test("only the reviewed release manifest can enable the v0.2.3 download", () => {
    expect(H10S_RELEASE_VERSION).toBe("0.2.3");
    expect(H10S_RELEASE_APK).toBe("mealdeck-printer-h10s-0.2.3.apk");
    expect(H10S_RELEASE_SHA256).toBe(
      "139be5b8f57b99b044b4ce571b10a43852f9e8e77c6d4843d29cadda96470681",
    );
    expect(isVerifiedH10SReleaseManifest(releasedManifest)).toBe(true);
    expect(isVerifiedH10SReleaseManifest(releasedManifest.trimEnd())).toBe(true);
  });

  test("rejects a different checksum even when it looks like a valid sha256 manifest", () => {
    const expected = H10S_RELEASE_SHA256 + "  " + H10S_RELEASE_APK + "\n";
    for (const untrusted of [
      "0".repeat(64) + "  " + H10S_RELEASE_APK + "\n",
      H10S_RELEASE_SHA256 + "  mealdeck-printer-h10s-0.2.2.apk\n",
      expected + "other file\n",
      " " + expected,
      expected + "\n",
      "<html>not found</html>",
      undefined,
      null,
    ]) {
      expect(isVerifiedH10SReleaseManifest(untrusted)).toBe(false);
    }
  });

  test("browser download remains gated by the pinned manifest check", () => {
    const component = readFileSync(
      new URL("../src/components/ops/printer-apk-download.tsx", import.meta.url),
      "utf8",
    );
    expect(component).toContain("isVerifiedH10SReleaseManifest(checksum)");
    expect(component).toContain('const [updatePublished, setUpdatePublished] = useState(false)');
    expect(component).toContain('const version = updatePublished ? H10S_RELEASE_VERSION : "0.2.2"');
    expect(component).not.toContain("^[a-f0-9]{64}");
  });
});
