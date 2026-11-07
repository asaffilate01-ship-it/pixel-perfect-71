import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Copy, Download, Link2, MessageCircle, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  arcadeShareMessage,
  arcadeWhatsAppLink,
  buildArcadeShareContent,
  type ArcadeShareRequest,
} from "@/lib/mealdeck-arcade-sharing";
import { createArcadeShareCard } from "@/lib/mealdeck-arcade-share-card";
import "@/styles.mealdeck-arcade-share.css";

type ShareDialogProps = {
  request: ArcadeShareRequest | null;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
};

export function ArcadeShareDialog({ request, onClose, returnFocusRef }: ShareDialogProps) {
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {request && <ShareContents request={request} returnFocusRef={returnFocusRef} />}
    </Dialog>
  );
}

function ShareContents({
  request,
  returnFocusRef,
}: Omit<ShareDialogProps, "onClose" | "request"> & { request: ArcadeShareRequest }) {
  const content = useMemo(() => buildArcadeShareContent(request), [request]);
  const message = arcadeShareMessage(content);
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const manualRef = useRef<HTMLTextAreaElement>(null);
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [cardError, setCardError] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [fileShareAvailable, setFileShareAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const [manualText, setManualText] = useState<string | null>(null);
  const [viewportStyle, setViewportStyle] = useState<CSSProperties>({});
  const alive = useRef(true);
  const sharing = useRef(false);

  useEffect(() => {
    alive.current = true;
    try {
      setNativeAvailable(
        typeof navigator.share === "function" &&
          (typeof navigator.canShare !== "function" ||
            navigator.canShare({ title: content.title, text: content.text, url: content.url })),
      );
    } catch {
      setNativeAvailable(false);
    }
    return () => {
      alive.current = false;
    };
  }, [content]);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setCard(null);
    setCardError(false);
    setFileShareAvailable(false);
    void createArcadeShareCard(content, { signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        const file = new File([blob], content.filename, { type: "image/png" });
        objectUrl = URL.createObjectURL(blob);
        setCard({ file, url: objectUrl });
        try {
          setFileShareAvailable(
            typeof navigator.share === "function" &&
              typeof navigator.canShare === "function" &&
              navigator.canShare({ files: [file] }),
          );
        } catch {
          setFileShareAvailable(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCardError(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [content]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () =>
      setViewportStyle({
        "--md-share-height": `${Math.min(viewport?.height ?? window.innerHeight, window.innerHeight)}px`,
        "--md-share-bottom": `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      } as CSSProperties);
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      if (!alive.current) return;
      setStatus(`${label} copied. Choose where to share it.`);
      setManualText(null);
    } catch {
      if (!alive.current) return;
      setManualText(value);
      setShowMessage(true);
      setStatus(`Select and copy the ${label.toLowerCase()} below.`);
      requestAnimationFrame(() => {
        if (alive.current) {
          manualRef.current?.focus();
          manualRef.current?.select();
        }
      });
    }
  }

  async function share(withCard: boolean) {
    if (sharing.current || (withCard && !card)) return;
    sharing.current = true;
    setBusy(true);
    setStatus("");
    try {
      // Keep this call directly in the click handler. The card is prepared beforehand.
      await navigator.share(
        withCard && card
          ? { files: [card.file], title: content.title }
          : { title: content.title, text: content.text, url: content.url },
      );
      if (alive.current) setStatus("Share options opened. Your chosen app handles the post.");
    } catch (error) {
      if (!alive.current) return;
      const name = error instanceof Error ? error.name : "";
      if (name !== "AbortError") {
        setStatus("Sharing is unavailable here. Copy the message or download the card instead.");
      }
    } finally {
      sharing.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <DialogContent
      className="md-arcade-share"
      overlayClassName="md-arcade-share-overlay"
      style={viewportStyle}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        titleRef.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (returnFocusRef.current?.isConnected)
          returnFocusRef.current.focus({ preventScroll: true });
      }}
    >
      <header className="md-arcade-share__heading">
        <DialogTitle ref={titleRef} tabIndex={-1}>
          {content.isResult ? "Your round. Their turn." : "Save a friend a seat."}
        </DialogTitle>
        <DialogDescription>
          {content.isResult
            ? `Share your ${content.gameName} result and invite a friend to play.`
            : `Invite someone to try ${content.gameName}. Free to play, with no sign-in.`}
        </DialogDescription>
      </header>
      <div className="md-arcade-share__body">
        <div className="md-arcade-share__preview" aria-busy={!card && !cardError}>
          {card ? (
            <img
              src={card.url}
              alt={`${content.gameName}. ${content.headline}. ${content.detail} ${content.context}`}
              width={1200}
              height={1200}
            />
          ) : (
            <div>
              <span>MEALDECK PLAY</span>
              <strong>{content.gameName}</strong>
              <p>{content.headline}</p>
              <small>
                {cardError
                  ? "The picture is unavailable. You can still share the message and link."
                  : "Preparing your card…"}
              </small>
            </div>
          )}
        </div>
        <div className="md-arcade-share__choices">
          <div className="md-arcade-share__actions">
            {nativeAvailable ? (
              <button
                type="button"
                className="is-primary"
                disabled={busy}
                onClick={() => void share(false)}
              >
                <Share2 size={18} aria-hidden="true" />{" "}
                {content.isResult ? "Share result" : "Share invite"}
              </button>
            ) : (
              <button
                type="button"
                className="is-primary"
                onClick={() => void copy(message, "Message")}
              >
                <Copy size={18} aria-hidden="true" /> Copy message
              </button>
            )}
            <a href={arcadeWhatsAppLink(content)} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={18} aria-hidden="true" /> WhatsApp
            </a>
            {fileShareAvailable && (
              <button type="button" disabled={busy || !card} onClick={() => void share(true)}>
                <Share2 size={18} aria-hidden="true" /> Share picture
              </button>
            )}
            {card && (
              <a href={card.url} download={content.filename}>
                <Download size={18} aria-hidden="true" /> Download card
              </a>
            )}
            <button type="button" onClick={() => void copy(content.url, "Game link")}>
              <Link2 size={18} aria-hidden="true" /> Copy game link
            </button>
            {nativeAvailable && (
              <button type="button" onClick={() => void copy(message, "Message")}>
                <Copy size={18} aria-hidden="true" /> Copy message
              </button>
            )}
          </div>
          <p
            className="md-arcade-share__status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {status}
          </p>
          <p className="md-arcade-share__tip">
            For a Story or Status, save the card and add the copied game link in your chosen app.
          </p>
          <details
            open={showMessage}
            onToggle={(event) => setShowMessage(event.currentTarget.open)}
          >
            <summary>Message and game link</summary>
            <label htmlFor={`${id}-message`}>
              {manualText ? "Select to copy" : "Ready to share"}
            </label>
            <textarea
              id={`${id}-message`}
              ref={manualRef}
              readOnly
              value={manualText ?? message}
              rows={5}
              onFocus={(event) => event.target.select()}
            />
          </details>
          <p className="md-arcade-share__scope">
            {content.isResult ? "A result from your playbook. " : ""}You choose the recipient and
            send from your app.
          </p>
        </div>
      </div>
    </DialogContent>
  );
}
