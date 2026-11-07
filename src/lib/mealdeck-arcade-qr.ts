import { arcadeGameLink, isArcadeGameId, parseArcadeSearch } from "./mealdeck-arcade-library";

const PUBLIC_PLAY_PAGES = new Set([
  "https://mealdeck.co.uk/play",
  "https://mealdeck.co.uk/play/daily",
  "https://mealdeck.co.uk/play/receipt",
]);
export const ARCADE_QR_QUIET_ZONE = 4;

/** Only our playable public destinations, with the exact allowlisted setup query. */
export function isPublicArcadeQrUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  if (PUBLIC_PLAY_PAGES.has(value)) return true;
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://mealdeck.co.uk" ||
      url.username ||
      url.password ||
      url.hash ||
      url.href !== value
    )
      return false;
    const game =
      url.pathname === "/play"
        ? url.searchParams.get("game")
        : url.pathname.startsWith("/play/")
          ? url.pathname.slice("/play/".length)
          : undefined;
    if (!isArcadeGameId(game)) return false;
    const keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length) return false;
    if (keys.some((key) => !["game", "brand", "daily", "size"].includes(key))) return false;
    const search = parseArcadeSearch({ ...Object.fromEntries(url.searchParams), game });
    const canonical = new URL(
      arcadeGameLink(game, search.brand, { daily: search.daily, size: search.size }),
    );
    // The default Food Pairs skin may be omitted. Existing public query links
    // remain playable too; validate their exact public fields before encoding.
    if (!url.searchParams.has("brand")) canonical.searchParams.delete("brand");
    if (url.pathname === "/play") {
      const params = new URLSearchParams({ game });
      canonical.searchParams.forEach((entry, key) => params.set(key, entry));
      canonical.pathname = "/play";
      canonical.search = params.toString();
    }
    return value === canonical.href;
  } catch {
    return false;
  }
}

export type ArcadeQrCode = {
  url: string;
  /** The encoded grid excludes its white quiet zone. */
  data: Uint8Array;
  modules: number;
  quietZone: number;
  modulePixels: number;
  /** Exact integer-module output size, including the quiet zone. */
  width: number;
};

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("QR creation was cancelled.", "AbortError");
}

/** Keep every module an integer number of pixels, including all four white border modules. */
export function arcadeQrPixelLayout(modules: number, requestedWidth = 360) {
  if (!Number.isInteger(modules) || modules < 21 || modules > 177 || (modules - 21) % 4 !== 0)
    throw new RangeError("Use a valid QR grid size.");
  if (!Number.isFinite(requestedWidth) || requestedWidth < 128 || requestedWidth > 1600)
    throw new RangeError("Choose a QR image width from 128 to 1600 pixels.");
  const totalModules = modules + ARCADE_QR_QUIET_ZONE * 2;
  const modulePixels = Math.floor(requestedWidth / totalModules);
  if (modulePixels < 2) throw new RangeError("The QR image is too small for this destination.");
  return {
    modulePixels,
    width: modulePixels * totalModules,
    quietZone: ARCADE_QR_QUIET_ZONE,
  };
}

/** Lazy, local encoding. No external QR service, identifiers, tracking or uploads. */
export async function createArcadeQr(
  url: string,
  { width = 360, signal }: { width?: number; signal?: AbortSignal } = {},
): Promise<ArcadeQrCode> {
  checkAbort(signal);
  if (!isPublicArcadeQrUrl(url)) throw new Error("Choose a public MealDeck game link.");
  const { create } = await import("qrcode");
  checkAbort(signal);
  const encoded = create(url, { errorCorrectionLevel: "M" });
  const layout = arcadeQrPixelLayout(encoded.modules.size, width);
  return {
    url,
    data: new Uint8Array(encoded.modules.data),
    modules: encoded.modules.size,
    ...layout,
  };
}

/** Draw directly at native resolution; never resample or decorate the quiet zone. */
export function drawArcadeQr(
  context: CanvasRenderingContext2D,
  qr: ArcadeQrCode,
  x: number,
  y: number,
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  context.save();
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(left, top, qr.width, qr.width);
  context.fillStyle = "#000000";
  for (let row = 0; row < qr.modules; row++) {
    for (let column = 0; column < qr.modules; column++) {
      if (qr.data[row * qr.modules + column]) {
        context.fillRect(
          left + (column + qr.quietZone) * qr.modulePixels,
          top + (row + qr.quietZone) * qr.modulePixels,
          qr.modulePixels,
          qr.modulePixels,
        );
      }
    }
  }
  context.restore();
}

/** Browser export, called only after the visitor asks to prepare an image. */
export async function createMealDeckPlayQrDataUrl(
  url: string,
  options: { width?: number; signal?: AbortSignal } = {},
): Promise<string> {
  checkAbort(options.signal);
  if (typeof document === "undefined") throw new Error("QR images need a browser.");
  const qr = await createArcadeQr(url, options);
  checkAbort(options.signal);
  const canvas = document.createElement("canvas");
  canvas.width = qr.width;
  canvas.height = qr.width;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the QR image.");
    drawArcadeQr(context, qr, 0, 0);
    checkAbort(options.signal);
    return canvas.toDataURL("image/png");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
