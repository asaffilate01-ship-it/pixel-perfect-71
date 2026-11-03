/**
 * Return a trusted HTTPS courier-tracking URL or nothing. This belongs only
 * on the server; never accept an allowlist supplied by the browser.
 *
 * Configure MEALDECK_TRACKING_ALLOWED_HOSTS with exact approved providers'
 * hostnames (comma-separated). An empty configuration hides external links.
 */
const MAX_TRACKING_URL_LENGTH = 2048;

function validHostname(host: string): boolean {
  if (host.length < 4 || host.length > 253 || host.endsWith(".") ||
      !/^[a-z0-9.-]+$/.test(host) || !host.includes(".") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.endsWith(".local")) {
    return false;
  }
  return host.split(".").every(label =>
    label.length > 0 && label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

export function safeCourierTrackingUrl(
  candidate: unknown,
  configuredHosts: string | undefined,
): string | null {
  if (typeof candidate !== "string" || !candidate.length ||
      candidate.length > MAX_TRACKING_URL_LENGTH ||
      candidate !== candidate.trim() || candidate.includes("\\")) {
    return null;
  }
  const approved = (configuredHosts ?? "").split(",")
    .map(value => value.trim().toLowerCase())
    .filter(validHostname);
  if (!approved.length) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || !validHostname(url.hostname)) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!approved.some(allowed => host === allowed || host.endsWith("." + allowed))) {
    return null;
  }
  // Fragments need not be forwarded with public courier tracking links.
  url.hash = "";
  return url.toString();
}
