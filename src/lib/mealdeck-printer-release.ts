/**
 * Pinned checksum for the signed H10S v0.2.3 publication.
 * A syntactically valid but different manifest must never upgrade the download.
 * This verifies the published manifest identity, not the physical paper receipt.
 */
export const H10S_RELEASE_VERSION = "0.2.3";
export const H10S_RELEASE_APK = "mealdeck-printer-h10s-0.2.3.apk";
export const H10S_RELEASE_SHA256 =
  "139be5b8f57b99b044b4ce571b10a43852f9e8e77c6d4843d29cadda96470681";

export function isVerifiedH10SReleaseManifest(value: unknown): boolean {
  const expected = H10S_RELEASE_SHA256 + "  " + H10S_RELEASE_APK;
  return typeof value === "string" && (value === expected || value === expected + "\n");
}
