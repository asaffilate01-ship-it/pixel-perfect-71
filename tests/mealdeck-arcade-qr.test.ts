import { describe, expect, test } from "bun:test";
import jsQR from "jsqr";
import { ARCADE_GAMES, arcadeGameLink } from "../src/lib/mealdeck-arcade-library";
import {
  ARCADE_QR_QUIET_ZONE,
  arcadeQrPixelLayout,
  createArcadeQr,
  createMealDeckPlayQrDataUrl,
  drawArcadeQr,
  isPublicArcadeQrUrl,
  type ArcadeQrCode,
} from "../src/lib/mealdeck-arcade-qr";

function raster(qr: ArcadeQrCode) {
  const pixels = new Uint8ClampedArray(qr.width * qr.width * 4).fill(255);
  const context = {
    fillStyle: "#ffffff",
    imageSmoothingEnabled: true,
    save() {},
    restore() {},
    fillRect(left: number, top: number, width: number, height: number) {
      for (const value of [left, top, width, height])
        if (!Number.isInteger(value)) throw new Error("QR modules must use whole pixels.");
      const colour = this.fillStyle === "#000000" ? 0 : 255;
      for (let y = top; y < top + height; y++) {
        for (let x = left; x < left + width; x++) {
          const offset = (y * qr.width + x) * 4;
          pixels[offset] = colour;
          pixels[offset + 1] = colour;
          pixels[offset + 2] = colour;
          pixels[offset + 3] = 255;
        }
      }
    },
  };
  drawArcadeQr(context as unknown as CanvasRenderingContext2D, qr, 0, 0);
  return pixels;
}

describe("Public MealDeck game QR destinations", () => {
  test("accepts playable public hubs and exact catalogue game links", () => {
    for (const path of ["/play", "/play/daily", "/play/receipt"])
      expect(isPublicArcadeQrUrl(`https://mealdeck.co.uk${path}`)).toBe(true);
    for (const game of ARCADE_GAMES)
      expect(isPublicArcadeQrUrl(arcadeGameLink(game.id))).toBe(true);
    expect(isPublicArcadeQrUrl(arcadeGameLink("pairs", "skorch"))).toBe(true);
    expect(isPublicArcadeQrUrl("https://mealdeck.co.uk/play/pairs")).toBe(true);
    expect(isPublicArcadeQrUrl("https://mealdeck.co.uk/play?game=snack-trail")).toBe(true);
    expect(
      isPublicArcadeQrUrl("https://mealdeck.co.uk/play?game=sauce-switch&daily=2026-11-07&size=4"),
    ).toBe(true);
    expect(
      isPublicArcadeQrUrl(
        arcadeGameLink("bento-sudoku", undefined, { daily: "2028-02-29", size: 6 }),
      ),
    ).toBe(true);
  });

  test("rejects foreign, private, ambiguous and augmented links instead of stripping information", () => {
    for (const url of [
      "https://example.com/play/menu-quest",
      "http://mealdeck.co.uk/play/menu-quest",
      "https://mealdeck.co.uk.evil.example/play/menu-quest",
      "https://mealdeck.co.uk@evil.example/play/menu-quest",
      "https://user@mealdeck.co.uk/play/menu-quest",
      "//mealdeck.co.uk/play/menu-quest",
      "/play/menu-quest",
      "javascript:alert(1)",
      "https://mealdeck.co.uk/account",
      "https://mealdeck.co.uk/play/promote",
      "https://mealdeck.co.uk/play/unknown",
      "https://mealdeck.co.uk/play/../account",
      `${arcadeGameLink("menu-quest")}#private-token`,
      `${arcadeGameLink("menu-quest")}?token=private`,
      `${arcadeGameLink("menu-quest")}?utm_source=private`,
      `${arcadeGameLink("sauce-switch")}?size=6`,
      `${arcadeGameLink("sauce-switch")}?daily=2026-02-29&size=3`,
      `${arcadeGameLink("sauce-switch")}?size=3&size=4`,
      `${arcadeGameLink("sauce-switch")}?game=sauce-switch`,
      `${arcadeGameLink("pantry-sweep")}?daily=2026-11-07`,
      "https://mealdeck.co.uk/play/daily?token=private",
      "https://mealdeck.co.uk/play/receipt?order=private",
      ` ${arcadeGameLink("menu-quest")}`,
      `${arcadeGameLink("menu-quest")} `,
      "x".repeat(513),
      null,
      {},
    ])
      expect(isPublicArcadeQrUrl(url)).toBe(false);
  });
});

describe("QR raster and independent scanner", () => {
  test("all 19 game links decode from the exact drawn integer-pixel output", async () => {
    for (const game of ARCADE_GAMES) {
      const url = arcadeGameLink(game.id);
      const qr = await createArcadeQr(url, { width: 380 });
      expect(jsQR(raster(qr), qr.width, qr.width)?.data).toBe(url);
      expect(qr.width).toBeLessThanOrEqual(380);
      expect(qr.modulePixels).toBeGreaterThanOrEqual(2);
      expect(qr.width).toBe((qr.modules + 8) * qr.modulePixels);
    }
  });

  test("daily dates, board sizes and hub destinations survive Story and print QR exports", async () => {
    const urls = [
      "https://mealdeck.co.uk/play",
      "https://mealdeck.co.uk/play/daily",
      "https://mealdeck.co.uk/play/receipt",
      arcadeGameLink("pairs", "skorch"),
      arcadeGameLink("menu-quest", undefined, { daily: "2028-02-29" }),
      ...[3, 4].map((size) =>
        arcadeGameLink("sauce-switch", undefined, { daily: "2026-11-07", size }),
      ),
      ...[4, 6].map((size) =>
        arcadeGameLink("bento-sudoku", undefined, { daily: "2026-11-07", size }),
      ),
    ];
    for (const url of urls) {
      for (const width of [380, 440]) {
        const qr = await createArcadeQr(url, { width });
        const pixels = raster(qr);
        expect(jsQR(pixels, qr.width, qr.width)?.data).toBe(url);
        const border = qr.quietZone * qr.modulePixels;
        let whiteBorder = true;
        for (let y = 0; y < qr.width; y++) {
          for (let x = 0; x < qr.width; x++) {
            if (x < border || y < border || x >= qr.width - border || y >= qr.width - border)
              whiteBorder &&= pixels[(y * qr.width + x) * 4] === 255;
          }
        }
        expect(whiteBorder).toBe(true);
        expect(qr.quietZone).toBe(ARCADE_QR_QUIET_ZONE);
      }
    }
  });

  test("bounds sizes and fails cleanly for invalid links, cancellation and non-browser image export", async () => {
    for (const width of [0, -1, 127, 1601, NaN, Infinity])
      expect(() => arcadeQrPixelLayout(33, width)).toThrow();
    for (const modules of [0, 20, 22, 178, 33.5, NaN])
      expect(() => arcadeQrPixelLayout(modules, 360)).toThrow();
    expect(() => arcadeQrPixelLayout(177, 128)).toThrow();
    await expect(createArcadeQr("https://mealdeck.co.uk/account")).rejects.toThrow(
      "public MealDeck",
    );
    const controller = new AbortController();
    const pending = createArcadeQr(arcadeGameLink("menu-quest"), { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(createMealDeckPlayQrDataUrl(arcadeGameLink("menu-quest"))).rejects.toThrow(
      "browser",
    );
    await expect(
      createMealDeckPlayQrDataUrl(arcadeGameLink("menu-quest"), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
