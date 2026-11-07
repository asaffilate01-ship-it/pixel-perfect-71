import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Copy, Download, ExternalLink, Gamepad2, Printer, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ARCADE_GAMES } from "@/lib/mealdeck-arcade-library";
import { ARCADE_DAILY_URL } from "@/lib/mealdeck-arcade-pages";
import {
  ARCADE_PROMOTION_CLIPS,
  buildArcadePromotionContent,
  selectPromotionGame,
  supportsDailyPromotion,
  type ArcadePromotionSelection,
} from "@/lib/mealdeck-arcade-promotion";
import {
  arcadeShareCardDimensions,
  arcadeShareCardFilename,
  createArcadeShareCard,
  type ArcadeShareCardFormat,
} from "@/lib/mealdeck-arcade-share-card";
import { arcadeShareMessage } from "@/lib/mealdeck-arcade-sharing";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { mealDeckArtwork } from "@/lib/brand-logos";
import "@/styles.mealdeck-arcade-promotion.css";

const formats = [
  { id: "square", name: "Square post", dimensions: "1200 × 1200" },
  { id: "story", name: "Vertical Story", dimensions: "1080 × 1920" },
  { id: "poster", name: "QR print", dimensions: "A4 poster or A6 card" },
] as const;
type PreparedImage = { url: string; filename: string };
type PreparedKit = {
  key: string;
  images: Partial<Record<ArcadeShareCardFormat, PreparedImage>>;
};

export function ArcadePromotionKit() {
  const id = useId();
  const [selection, setSelection] = useState<ArcadePromotionSelection>({
    game: "menu-quest",
    daily: false,
    date: "",
    size: 4,
  });
  const [format, setFormat] = useState<ArcadeShareCardFormat>("square");
  const [printSize, setPrintSize] = useState<"poster" | "table-card">("poster");
  const [prepared, setPrepared] = useState<PreparedKit | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState("");
  const [mounted, setMounted] = useState(false);
  const [printReadyKey, setPrintReadyKey] = useState("");
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const dailyLinkRef = useRef<HTMLInputElement>(null);
  const generation = useRef(Symbol("promotion"));
  const controller = useRef<AbortController | null>(null);
  const objectUrls = useRef<string[]>([]);
  const selectionContent = useMemo(() => {
    try {
      return { content: buildArcadePromotionContent(selection), error: "" };
    } catch {
      return { content: null, error: "Choose a real puzzle date between 2000 and 2099." };
    }
  }, [selection]);
  const { content, error } = selectionContent;
  const contentKey = content ? `${content.url}\n${content.text}` : "invalid-selection";
  const caption = content ? arcadeShareMessage(content) : "";
  const activeGame = ARCADE_GAMES.find((game) => game.id === selection.game)!;
  const activeKit = prepared?.key === contentKey ? prepared : null;
  const image = activeKit?.images[format];
  const printImage = activeKit?.images.poster;
  const clip = ARCADE_PROMOTION_CLIPS[selection.game];
  const dimensions = arcadeShareCardDimensions(format);

  useEffect(() => {
    setMounted(true);
    setSelection((value) => ({ ...value, date: new Date().toISOString().slice(0, 10) }));
  }, []);

  useEffect(() => {
    // Browser Print remains an ordinary page print until a real print image exists.
    document.body.classList.toggle("md-play-promotion-page", Boolean(printImage));
    return () => document.body.classList.remove("md-play-promotion-page");
  }, [printImage]);

  useEffect(() => {
    generation.current = Symbol("promotion");
    controller.current?.abort();
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setPrepared(null);
    setPreparing(false);
    setPrintReadyKey("");
    setStatus("");
    return () => {
      generation.current = Symbol("promotion");
      controller.current?.abort();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    };
  }, [contentKey]);

  async function prepareImages() {
    if (!content || preparing) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const version = Symbol("promotion");
    generation.current = version;
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setPrepared(null);
    setPrintReadyKey("");
    setPreparing(true);
    setStatus("Preparing your post, Story and QR print…");
    try {
      const results = await Promise.allSettled(
        formats.map(({ id: selectedFormat }) =>
          createArcadeShareCard(content, { format: selectedFormat, signal: current.signal }),
        ),
      );
      if (current.signal.aborted || generation.current !== version) return;
      const images: PreparedKit["images"] = {};
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const selectedFormat = formats[index]!.id;
        const url = URL.createObjectURL(result.value);
        objectUrls.current.push(url);
        images[selectedFormat] = {
          url,
          filename: arcadeShareCardFilename(content, selectedFormat),
        };
      });
      setPrepared({ key: contentKey, images });
      setStatus(
        Object.keys(images).length === formats.length
          ? "Your images are ready. Choose a format to download or print."
          : "Some images could not be prepared. Available downloads are below; you can also copy the caption and link.",
      );
    } catch {
      if (current.signal.aborted || generation.current !== version) return;
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
      setStatus(
        "Images are unavailable in this browser. You can still copy the caption and game link.",
      );
    } finally {
      if (!current.signal.aborted && generation.current === version) setPreparing(false);
    }
  }

  async function copy(value: string, kind: "caption" | "link" | "daily link") {
    const version = generation.current;
    try {
      await navigator.clipboard.writeText(value);
      if (version === generation.current)
        setStatus(
          `${kind === "caption" ? "Caption" : kind === "daily link" ? "Daily link" : "Game link"} copied. Choose where to share it.`,
        );
    } catch {
      if (version !== generation.current) return;
      setStatus(`Select and copy the ${kind} below.`);
      const field =
        kind === "caption"
          ? captionRef.current
          : kind === "daily link"
            ? dailyLinkRef.current
            : linkRef.current;
      field?.focus();
      field?.select();
    }
  }

  function print() {
    if (!printImage || printReadyKey !== contentKey) return;
    if (typeof window.print !== "function") {
      setStatus("Use Download QR print, then print the saved image from your device.");
      return;
    }
    window.print();
    setStatus("Print options opened. Your printer or Save as PDF handles the output.");
  }

  return (
    <div className="md-marketing-shell dp-shell md-promotion-shell">
      <SiteHeader />
      <main className="md-promo-main">
        <a className="md-promo-back" href="/play">
          <ArrowLeft size={17} aria-hidden="true" /> Back to the games
        </a>
        <header className="md-promo-intro">
          <div>
            <p className="md-promo-eyebrow">
              <Gamepad2 size={18} aria-hidden="true" /> MEALDECK PLAY · PROMOTION KIT
            </p>
            <h1>Give someone their next game.</h1>
            <p>
              Choose from {ARCADE_GAMES.length} free games. Make a post, a Story or a QR card for
              the table, then share it your way.
            </p>
          </div>
          <img
            src={mealDeckArtwork.src}
            width={mealDeckArtwork.width}
            height={mealDeckArtwork.height}
            alt="MealDeck"
          />
        </header>

        <div className="md-promo-workbench">
          <section className="md-promo-controls" aria-labelledby={`${id}-choose`}>
            <p className="md-promo-step">01 · Choose your challenge</p>
            <h2 id={`${id}-choose`}>What are we playing?</h2>
            <label htmlFor={`${id}-game`}>Game</label>
            <select
              id={`${id}-game`}
              value={selection.game}
              onChange={(event) =>
                setSelection((value) => selectPromotionGame(value, event.target.value))
              }
            >
              {ARCADE_GAMES.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
            <p className="md-promo-game-description">{activeGame.description}</p>

            {supportsDailyPromotion(selection.game) && (
              <fieldset className="md-promo-mode">
                <legend>Challenge</legend>
                <label>
                  <input
                    type="radio"
                    name={`${id}-challenge`}
                    checked={!selection.daily}
                    onChange={() => setSelection((value) => ({ ...value, daily: false }))}
                  />{" "}
                  Fresh game
                </label>
                <label>
                  <input
                    type="radio"
                    name={`${id}-challenge`}
                    checked={selection.daily}
                    onChange={() => setSelection((value) => ({ ...value, daily: true }))}
                  />{" "}
                  Daily puzzle
                </label>
              </fieldset>
            )}
            {(selection.game === "sauce-switch" || selection.game === "bento-sudoku") && (
              <>
                <label htmlFor={`${id}-size`}>Board size</label>
                <select
                  id={`${id}-size`}
                  value={selection.size}
                  onChange={(event) =>
                    setSelection((value) => ({
                      ...value,
                      size: Number(event.target.value) as 3 | 4 | 6,
                    }))
                  }
                >
                  {(selection.game === "sauce-switch" ? [3, 4] : [4, 6]).map((size) => (
                    <option key={size} value={size}>
                      {size} × {size}
                    </option>
                  ))}
                </select>
              </>
            )}
            {selection.daily && (
              <>
                <label htmlFor={`${id}-date`}>Puzzle date · UTC</label>
                <input
                  id={`${id}-date`}
                  type="date"
                  min="2000-01-01"
                  max="2099-12-31"
                  value={selection.date}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-date-note`}
                  onChange={(event) =>
                    setSelection((value) => ({ ...value, date: event.target.value }))
                  }
                />
                <p id={`${id}-date-note`} className="md-promo-help">
                  This link keeps the chosen date and size, so friends can play the same daily
                  puzzle.
                </p>
              </>
            )}
            {error && (
              <p className="md-promo-error" role="alert">
                {error}
              </p>
            )}
            {content && (
              <a
                className="md-promo-try"
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Try this game <ExternalLink size={15} aria-hidden="true" />
                <span className="sr-only"> in a new tab</span>
              </a>
            )}

            <div className="md-promo-caption">
              <p className="md-promo-step">02 · Keep the words handy</p>
              <label htmlFor={`${id}-caption`}>Ready-to-use caption</label>
              <textarea
                id={`${id}-caption`}
                ref={captionRef}
                value={caption}
                readOnly
                rows={7}
                onFocus={(event) => event.target.select()}
              />
              <div className="md-promo-inline-actions">
                <button
                  type="button"
                  disabled={!content}
                  onClick={() => void copy(caption, "caption")}
                >
                  <Copy size={16} aria-hidden="true" /> Copy caption
                </button>
                <button
                  type="button"
                  disabled={!content}
                  onClick={() => content && void copy(content.url, "link")}
                >
                  <Copy size={16} aria-hidden="true" /> Copy link
                </button>
              </div>
              <label htmlFor={`${id}-link`}>Game link</label>
              <input
                id={`${id}-link`}
                ref={linkRef}
                readOnly
                value={content?.url ?? ""}
                onFocus={(event) => event.target.select()}
              />
            </div>
          </section>

          <section className="md-promo-exports" aria-labelledby={`${id}-make`}>
            <div className="md-promo-export-heading">
              <div>
                <p className="md-promo-step">03 · Make it yours to share</p>
                <h2 id={`${id}-make`}>Post. Story. Table.</h2>
              </div>
              <button
                type="button"
                className="md-promo-primary"
                disabled={!content || preparing}
                onClick={() => void prepareImages()}
              >
                <Sparkles size={18} aria-hidden="true" />
                {preparing
                  ? "Preparing images…"
                  : activeKit
                    ? "Prepare again"
                    : "Prepare downloads"}
              </button>
            </div>
            <fieldset className="md-promo-formats">
              <legend>Preview format</legend>
              <div>
                {formats.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={format === item.id}
                    onClick={() => setFormat(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <span>{item.dimensions}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="md-promo-preview-stage" aria-busy={preparing}>
              <div className="md-promo-art" data-format={format}>
                {image ? (
                  <img
                    src={image.url}
                    width={dimensions.width}
                    height={dimensions.height}
                    alt={`${activeGame.name} ${format === "poster" ? "QR print" : format}. ${content?.headline}. ${content?.context}.`}
                  />
                ) : (
                  <div className="md-promo-placeholder">
                    <img src={gameFoodArtwork[activeGame.art]} alt="" />
                    <span>MEALDECK PLAY</span>
                    <strong>{activeGame.name}</strong>
                    <p>
                      {preparing
                        ? "Preparing your images…"
                        : "Choose Prepare downloads to preview your artwork."}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <p className="md-promo-status" role="status" aria-live="polite" aria-atomic="true">
              {status}
            </p>
            {image && (
              <a className="md-promo-download" href={image.url} download={image.filename}>
                <Download size={18} aria-hidden="true" /> Download{" "}
                {format === "square" ? "square post" : format === "story" ? "Story" : "QR print"}
                <span>PNG</span>
              </a>
            )}
            {format === "poster" && (
              <div className="md-promo-print-options">
                <fieldset>
                  <legend>Print layout</legend>
                  <label>
                    <input
                      type="radio"
                      name={`${id}-print`}
                      checked={printSize === "poster"}
                      onChange={() => setPrintSize("poster")}
                    />{" "}
                    A4 poster
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`${id}-print`}
                      checked={printSize === "table-card"}
                      onChange={() => setPrintSize("table-card")}
                    />{" "}
                    A6 table card
                  </label>
                </fieldset>
                <button
                  type="button"
                  disabled={!printImage || printReadyKey !== contentKey}
                  onClick={print}
                >
                  <Printer size={18} aria-hidden="true" /> Print{" "}
                  {printSize === "poster" ? "poster" : "table card"}
                </button>
                <p className="md-promo-help">
                  Use A4 paper at 100% scale.{" "}
                  {printSize === "table-card"
                    ? "The A6 card sits on one sheet; cut it out for a table holder."
                    : "The poster fits inside the page margins."}{" "}
                  Scan the printed code before putting it on display.
                </p>
              </div>
            )}
            <p className="md-promo-help">
              The Story and print layouts include a QR code for the selected game. Add the copied
              link to your post or Story so people on the same phone can open it too.
            </p>
          </section>
        </div>

        {clip && (
          <section className="md-promo-clip" aria-labelledby={`${id}-clip-title`}>
            <div>
              <p className="md-promo-step">A little gameplay, ready to go</p>
              <h2 id={`${id}-clip-title`}>{activeGame.name} in action.</h2>
              <p id={`${id}-clip-description`}>
                An 11-second, silent preview with captions and a game-link QR code. Press play to
                watch, then save it for your own post.
              </p>
              <a
                className="md-promo-download"
                href={clip.video}
                download={`mealdeck-${selection.game}-preview.mp4`}
              >
                <Download size={18} aria-hidden="true" /> Download clip<span>MP4</span>
              </a>
            </div>
            <video
              key={clip.video}
              controls
              playsInline
              preload="none"
              poster={clip.poster}
              width={720}
              height={1280}
              aria-labelledby={`${id}-clip-title`}
              aria-describedby={`${id}-clip-description`}
            >
              <source src={clip.video} type="video/mp4" />
              Your browser cannot play this clip. Use Download clip to save it.
            </video>
          </section>
        )}

        <section className="md-promo-note" aria-labelledby={`${id}-daily-hub`}>
          <div>
            <h2 id={`${id}-daily-hub`}>Something new each day.</h2>
            <p>
              Dated challenges keep their original puzzle. For a link that opens
              <a href={ARCADE_DAILY_URL}> today’s daily challenge</a>, use this permanent link.
            </p>
            <div className="md-promo-daily-copy">
              <input
                ref={dailyLinkRef}
                aria-label="Permanent daily challenge link"
                readOnly
                value={ARCADE_DAILY_URL}
                onFocus={(event) => event.target.select()}
              />
              <button type="button" onClick={() => void copy(ARCADE_DAILY_URL, "daily link")}>
                <Copy size={16} aria-hidden="true" />
                {status.startsWith("Daily link copied") ? "Daily link copied" : "Copy daily link"}
              </button>
            </div>
          </div>
          <p>
            MealDeck games are free and just for fun. Playing or sharing does not earn prizes,
            discounts or loyalty points.
          </p>
        </section>
      </main>
      <SiteFooter />
      {mounted &&
        createPortal(
          <div className="md-promo-print-sheet" data-size={printSize} aria-hidden="true">
            {printImage && (
              <img
                src={printImage.url}
                alt=""
                width={1240}
                height={1754}
                onLoad={(event) => {
                  if (event.currentTarget.currentSrc === printImage.url)
                    setPrintReadyKey(contentKey);
                }}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
