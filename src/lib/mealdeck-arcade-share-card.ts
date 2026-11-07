import { ARCADE_GAMES } from "@/lib/mealdeck-arcade-library";
import type { ArcadeShareContent } from "@/lib/mealdeck-arcade-sharing";
import { createArcadeQr, drawArcadeQr, type ArcadeQrCode } from "@/lib/mealdeck-arcade-qr";

export const ARCADE_SHARE_CARD_SIZE = 1200;
export const ARCADE_SHARE_CARD_FORMATS = {
  square: { width: 1200, height: 1200 },
  story: { width: 1080, height: 1920 },
  poster: { width: 1240, height: 1754 },
} as const;
export type ArcadeShareCardFormat = keyof typeof ARCADE_SHARE_CARD_FORMATS;

export function arcadeShareCardDimensions(format: ArcadeShareCardFormat = "square") {
  if (!Object.hasOwn(ARCADE_SHARE_CARD_FORMATS, format))
    throw new Error("Choose a supported picture format.");
  return ARCADE_SHARE_CARD_FORMATS[format];
}

export function arcadeShareCardFilename(
  content: Pick<ArcadeShareContent, "filename">,
  format: ArcadeShareCardFormat = "square",
): string {
  arcadeShareCardDimensions(format);
  return format === "square"
    ? content.filename
    : content.filename.replace(/\.png$/, `-${format}.png`);
}
const COLORS = {
  cream: "#fff6e8",
  paper: "#fffdf7",
  red: "#d5141d",
  deepRed: "#951018",
  ink: "#111111",
  muted: "#655c52",
  line: "#ddcbb0",
  yellow: "#ffe5a4",
} as const;
const DISPLAY_FONT = '"Outfit", "Arial", sans-serif';
const BODY_FONT = '"DM Sans", "Arial", sans-serif';

export interface ArcadeShareTextLayout {
  lines: string[];
  truncated: boolean;
}
export interface ArcadeShareRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bound work and remove invisible controls; no HTML or markup is interpreted. */
function cleanShareText(value: string): { text: string; truncated: boolean } {
  const bounded = value.slice(0, 2048).replace(/[\uD800-\uDBFF]$/u, "");
  const normalized = bounded
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(normalized);
  return {
    text: characters.slice(0, 360).join(""),
    truncated: value.length > bounded.length || characters.length > 360,
  };
}

/** Word-wrap with bounded long-word splitting and visible ellipsis when a box is exhausted. */
export function wrapArcadeShareText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (text: string) => number,
): ArcadeShareTextLayout {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || !Number.isFinite(maxLines) || maxLines < 1)
    return { lines: [], truncated: Boolean(text) };
  const limit = Math.min(8, Math.floor(maxLines));
  const source = cleanShareText(text);
  if (!source.text) return { lines: [], truncated: source.truncated };
  const width = (line: string) => {
    const result = measure(line);
    return Number.isFinite(result) ? Math.max(0, result) : Infinity;
  };
  const lines: string[] = [];
  let line = "";
  let tooWide = false;
  for (const word of source.text.split(" ")) {
    const joined = line ? `${line} ${word}` : word;
    if (width(joined) <= maxWidth) {
      line = joined;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    if (width(word) <= maxWidth) {
      line = word;
      continue;
    }
    for (const character of Array.from(word)) {
      if (width(character) > maxWidth) {
        tooWide = true;
        continue;
      }
      if (line && width(line + character) > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  const truncated = source.truncated || tooWide || lines.length > limit;
  const visible = lines.slice(0, limit);
  if (truncated) {
    if (!visible.length && width("…") <= maxWidth) visible.push("…");
    else if (visible.length) {
      const last = Array.from(visible[visible.length - 1] ?? "");
      while (last.length && width(`${last.join("")}…`) > maxWidth) last.pop();
      visible[visible.length - 1] =
        width("…") <= maxWidth ? `${last.join("").trimEnd()}…` : last.join("");
    }
  }
  return { lines: visible.filter(Boolean), truncated };
}

/** Fit the entire original asset, including its approved transparent padding. Never crop it. */
export function containArcadeShareArtwork(
  width: number,
  height: number,
  box: ArcadeShareRectangle,
): ArcadeShareRectangle | null {
  if (
    ![width, height, box.width, box.height].every((value) => Number.isFinite(value) && value > 0) ||
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y)
  )
    return null;
  const scale = Math.min(box.width / width, box.height / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;
  return {
    x: box.x + (box.width - fittedWidth) / 2,
    y: box.y + (box.height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

function aborted(): DOMException {
  return new DOMException("Share-card creation was cancelled.", "AbortError");
}
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw aborted();
}

function loadApprovedImage(
  source: string | undefined,
  signal?: AbortSignal,
): Promise<HTMLImageElement | null> {
  checkAbort(signal);
  if (!source) return Promise.resolve(null);
  try {
    const url = new URL(source, window.location.href);
    const bundledData = /^data:image\/(?:png|webp|jpeg|svg\+xml);/i.test(source);
    if (
      !bundledData &&
      (url.origin !== window.location.origin || !["https:", "http:"].includes(url.protocol))
    )
      return Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const picture = new Image();
    picture.decoding = "async";
    picture.crossOrigin = "anonymous";
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      picture.onload = null;
      picture.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (image: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!image) picture.removeAttribute("src");
      resolve(image);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      picture.removeAttribute("src");
      reject(aborted());
    };
    const timeout = window.setTimeout(() => finish(null), 4000);
    picture.onload = () =>
      finish(picture.naturalWidth > 0 && picture.naturalHeight > 0 ? picture : null);
    picture.onerror = () => finish(null);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else picture.src = source;
  });
}

function waitForAvailableFonts(signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  if (!document.fonts?.ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(aborted());
    };
    const timeout = window.setTimeout(finish, 1200);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else void document.fonts.ready.then(finish, finish);
  });
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  box: ArcadeShareRectangle,
  radius: number,
): void {
  const { x, y, width, height } = box;
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawTextBox(
  context: CanvasRenderingContext2D,
  text: string,
  box: ArcadeShareRectangle,
  options: {
    maxSize: number;
    minSize: number;
    maxLines: number;
    color: string;
    display?: boolean;
    weight?: number;
    centeredVertically?: boolean;
  },
): void {
  const font = options.display ? DISPLAY_FONT : BODY_FONT;
  const weight = options.weight ?? 700;
  let size = options.maxSize;
  let layout: ArcadeShareTextLayout = { lines: [], truncated: false };
  while (size >= options.minSize) {
    context.font = `${weight} ${size}px ${font}`;
    const maxLines = Math.min(
      options.maxLines,
      Math.max(1, Math.floor(box.height / (size * 1.16))),
    );
    layout = wrapArcadeShareText(
      text,
      box.width,
      maxLines,
      (line) => context.measureText(line).width,
    );
    if (!layout.truncated || size <= options.minSize) break;
    size = Math.max(options.minSize, size - 2);
  }
  const lineHeight = size * 1.16;
  const top = options.centeredVertically
    ? box.y + Math.max(0, (box.height - layout.lines.length * lineHeight) / 2)
    : box.y;
  context.save();
  context.beginPath();
  context.rect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);
  context.clip();
  context.fillStyle = options.color;
  context.textAlign = "left";
  context.textBaseline = "top";
  layout.lines.forEach((line, index) => context.fillText(line, box.x, top + index * lineHeight));
  context.restore();
}

function drawContained(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  box: ArcadeShareRectangle,
  width = image.naturalWidth,
  height = image.naturalHeight,
): void {
  const fitted = containArcadeShareArtwork(width, height, box);
  if (fitted) context.drawImage(image, fitted.x, fitted.y, fitted.width, fitted.height);
}

function canvasPng(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(aborted());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      canvas.toBlob((blob) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (blob) resolve(blob);
        else reject(new Error("This browser could not create the share image."));
      }, "image/png");
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}

function drawVerticalCard(
  context: CanvasRenderingContext2D,
  content: ArcadeShareContent,
  format: "story" | "poster",
  qr: ArcadeQrCode,
  logoImage: HTMLImageElement | null,
  foodImage: HTMLImageElement | null,
): void {
  const { width, height } = ARCADE_SHARE_CARD_FORMATS[format];
  const story = format === "story";
  context.fillStyle = COLORS.cream;
  context.fillRect(0, 0, width, height);
  roundedRectangle(context, { x: 34, y: 34, width: width - 68, height: height - 68 }, 32);
  context.strokeStyle = COLORS.red;
  context.lineWidth = 3;
  context.stroke();

  if (logoImage)
    drawContained(context, logoImage, { x: 72, y: story ? 116 : 82, width: 188, height: 190 });
  else
    drawTextBox(
      context,
      "MEALDECK",
      { x: 72, y: story ? 180 : 136, width: 205, height: 64 },
      { maxSize: 34, minSize: 26, maxLines: 1, color: COLORS.deepRed, display: true, weight: 900 },
    );
  drawTextBox(
    context,
    "MEALDECK PLAY",
    { x: 292, y: story ? 128 : 92, width: width - 370, height: 48 },
    { maxSize: 28, minSize: 26, maxLines: 1, color: COLORS.deepRed, weight: 800 },
  );
  drawTextBox(
    context,
    content.gameName,
    { x: 290, y: story ? 189 : 156, width: width - 376, height: 148 },
    { maxSize: 64, minSize: 46, maxLines: 2, color: COLORS.ink, display: true, weight: 800 },
  );

  const panelTop = story ? 370 : 340;
  roundedRectangle(
    context,
    { x: 66, y: panelTop, width: width - 132, height: story ? 716 : 440 },
    28,
  );
  context.fillStyle = COLORS.paper;
  context.fill();
  context.strokeStyle = COLORS.line;
  context.lineWidth = 2;
  context.stroke();
  drawTextBox(
    context,
    content.isResult ? "ROUND FINISHED" : "COME & PLAY",
    { x: 104, y: panelTop + 38, width: width - 208, height: 44 },
    { maxSize: 26, minSize: 24, maxLines: 1, color: COLORS.muted, weight: 800 },
  );
  const foodX = width - 208;
  context.beginPath();
  context.arc(foodX, panelTop + 218, 94, 0, Math.PI * 2);
  context.fillStyle = COLORS.yellow;
  context.fill();
  if (foodImage)
    drawContained(context, foodImage, {
      x: foodX - 82,
      y: panelTop + 136,
      width: 164,
      height: 164,
    });
  drawTextBox(
    context,
    content.headline,
    { x: 104, y: panelTop + 104, width: width - 430, height: story ? 245 : 190 },
    {
      maxSize: story ? 98 : 92,
      minSize: story ? 66 : 62,
      maxLines: story ? 3 : 2,
      color: COLORS.red,
      display: true,
      weight: 800,
      centeredVertically: true,
    },
  );
  drawTextBox(
    context,
    content.detail,
    { x: 104, y: story ? 760 : 650, width: width - 208, height: story ? 112 : 78 },
    { maxSize: 36, minSize: 28, maxLines: 2, color: COLORS.ink, weight: 650 },
  );
  drawTextBox(
    context,
    content.context,
    { x: 104, y: story ? 924 : 812, width: width - 208, height: 94 },
    { maxSize: 30, minSize: 26, maxLines: 2, color: COLORS.muted, weight: 650 },
  );
  drawTextBox(
    context,
    "Scan to play",
    { x: 102, y: story ? 1140 : 930, width: width - 204, height: 91 },
    { maxSize: 66, minSize: 58, maxLines: 1, color: COLORS.ink, display: true, weight: 800 },
  );
  drawArcadeQr(context, qr, (width - qr.width) / 2, story ? 1272 : 1048);
  drawTextBox(
    context,
    content.url.replace(/^https:\/\//, ""),
    { x: 102, y: story ? 1684 : 1512, width: width - 204, height: 106 },
    { maxSize: 27, minSize: 24, maxLines: 3, color: COLORS.deepRed, weight: 750 },
  );
  drawTextBox(
    context,
    "Free to play · No sign-in needed",
    { x: 102, y: story ? 1804 : 1654, width: width - 204, height: 48 },
    { maxSize: 30, minSize: 27, maxLines: 1, color: COLORS.muted, weight: 650 },
  );
}

/** Local PNG export. Only Story/poster QR codes use the strictly validated public URL. */
export async function createArcadeShareCard(
  content: ArcadeShareContent,
  options: { signal?: AbortSignal; format?: ArcadeShareCardFormat } = {},
): Promise<Blob> {
  const { signal, format = "square" } = options;
  checkAbort(signal);
  if (typeof document === "undefined" || typeof window === "undefined")
    throw new Error("Share images can only be created in a browser.");
  const dimensions = arcadeShareCardDimensions(format);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser does not support share images.");
  try {
    // Import only our approved bundled artwork, without constructing paths from share content.
    const [logos, foods] = await Promise.allSettled([
      import("@/lib/brand-logos"),
      import("@/lib/game-food-artwork"),
    ]);
    checkAbort(signal);
    const logo = logos.status === "fulfilled" ? logos.value.mealDeckArtwork : null;
    const game = ARCADE_GAMES.find((entry) => entry.id === content.game);
    const foodSource =
      foods.status === "fulfilled" && game ? foods.value.gameFoodArtwork[game.art] : undefined;
    const [logoImage, foodImage] = await Promise.all([
      loadApprovedImage(logo?.src, signal),
      loadApprovedImage(foodSource, signal),
      waitForAvailableFonts(signal),
    ]);
    checkAbort(signal);

    if (format !== "square") {
      const qr = await createArcadeQr(content.url, {
        width: format === "story" ? 380 : 440,
        ...(signal ? { signal } : {}),
      });
      checkAbort(signal);
      drawVerticalCard(context, content, format, qr, logoImage, foodImage);
      return await canvasPng(canvas, signal);
    }

    context.fillStyle = COLORS.cream;
    context.fillRect(0, 0, 1200, 1200);
    roundedRectangle(context, { x: 36, y: 36, width: 1128, height: 1128 }, 34);
    context.strokeStyle = COLORS.red;
    context.lineWidth = 3;
    context.stroke();

    if (logoImage && logo)
      drawContained(
        context,
        logoImage,
        { x: 78, y: 64, width: 188, height: 190 },
        logo.width,
        logo.height,
      );
    else {
      drawTextBox(
        context,
        "MEALDECK",
        { x: 82, y: 112, width: 188, height: 57 },
        {
          maxSize: 32,
          minSize: 24,
          maxLines: 1,
          color: COLORS.deepRed,
          display: true,
          weight: 900,
        },
      );
      drawTextBox(
        context,
        "PLAY",
        { x: 82, y: 164, width: 188, height: 44 },
        { maxSize: 28, minSize: 24, maxLines: 1, color: COLORS.ink, display: true },
      );
    }
    drawTextBox(
      context,
      "MEALDECK PLAY",
      { x: 302, y: 86, width: 780, height: 42 },
      { maxSize: 28, minSize: 28, maxLines: 1, color: COLORS.deepRed, weight: 800 },
    );
    drawTextBox(
      context,
      content.gameName,
      { x: 300, y: 143, width: 790, height: 125 },
      { maxSize: 56, minSize: 40, maxLines: 2, color: COLORS.ink, display: true, weight: 800 },
    );

    roundedRectangle(context, { x: 72, y: 292, width: 1056, height: 610 }, 30);
    context.fillStyle = COLORS.paper;
    context.fill();
    context.strokeStyle = COLORS.line;
    context.lineWidth = 2;
    context.stroke();
    drawTextBox(
      context,
      content.isResult ? "ROUND FINISHED" : "COME & PLAY",
      { x: 116, y: 334, width: 700, height: 40 },
      { maxSize: 25, minSize: 25, maxLines: 1, color: COLORS.muted, weight: 800 },
    );

    context.beginPath();
    context.arc(974, 516, 114, 0, Math.PI * 2);
    context.fillStyle = COLORS.yellow;
    context.fill();
    if (foodImage) drawContained(context, foodImage, { x: 874, y: 416, width: 200, height: 200 });
    else
      drawTextBox(
        context,
        "PLAY",
        { x: 894, y: 482, width: 160, height: 75 },
        {
          maxSize: 52,
          minSize: 40,
          maxLines: 1,
          color: COLORS.deepRed,
          display: true,
          weight: 900,
        },
      );
    drawTextBox(
      context,
      content.headline,
      { x: 116, y: 394, width: 704, height: 254 },
      {
        maxSize: 110,
        minSize: 72,
        maxLines: 3,
        color: COLORS.red,
        display: true,
        weight: 800,
        centeredVertically: true,
      },
    );
    drawTextBox(
      context,
      content.detail,
      { x: 116, y: 680, width: 964, height: 88 },
      { maxSize: 36, minSize: 28, maxLines: 2, color: COLORS.ink, weight: 650 },
    );
    context.beginPath();
    context.moveTo(116, 787);
    context.lineTo(1084, 787);
    context.strokeStyle = COLORS.line;
    context.lineWidth = 2;
    context.stroke();
    drawTextBox(
      context,
      content.context,
      { x: 116, y: 810, width: 964, height: 66 },
      { maxSize: 28, minSize: 24, maxLines: 2, color: COLORS.muted, weight: 600 },
    );

    drawTextBox(
      context,
      "Your turn.",
      { x: 94, y: 954, width: 550, height: 112 },
      { maxSize: 80, minSize: 70, maxLines: 1, color: COLORS.ink, display: true, weight: 800 },
    );
    roundedRectangle(context, { x: 680, y: 969, width: 430, height: 78 }, 20);
    context.fillStyle = COLORS.red;
    context.fill();
    drawTextBox(
      context,
      "mealdeck.co.uk/play",
      { x: 705, y: 991, width: 380, height: 44 },
      { maxSize: 32, minSize: 28, maxLines: 1, color: COLORS.paper, weight: 800 },
    );
    drawTextBox(
      context,
      "Free to play · No sign-in needed",
      { x: 96, y: 1090, width: 1008, height: 44 },
      { maxSize: 30, minSize: 28, maxLines: 1, color: COLORS.muted, weight: 600 },
    );
    checkAbort(signal);
    return await canvasPng(canvas, signal);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
