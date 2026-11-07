import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

/** Public business contact only. No basket/customer/checkout data in a wa.me URL. */
export function WhatsAppOrderLink({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/whatsapp/channel", {
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? (response.json() as Promise<unknown>) : null))
      .then((value) => {
        if (!value || typeof value !== "object" || controller.signal.aborted) return;
        const result = value as { available?: unknown; url?: unknown };
        if (
          result.available === true &&
          typeof result.url === "string" &&
          /^https:\/\/wa\.me\/[1-9]\d{7,14}\?text=Hello%20Mealdeck$/.test(result.url)
        )
          setUrl(result.url);
      })
      .catch(() => {
        /* Missing readiness remains visibly coming soon. */
      });
    return () => controller.abort();
  }, []);
  const contents = (
    <>
      <MessageCircle size={16} aria-hidden="true" />{" "}
      {url ? "Order on WhatsApp · Luton" : "WhatsApp ordering — coming soon"}
    </>
  );
  return url ? (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {contents}
    </a>
  ) : (
    <span className={className}>{contents}</span>
  );
}
