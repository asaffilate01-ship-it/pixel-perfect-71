import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { COMING_SOON } from "@/lib/launch-status";
import { getWhatsAppHandoffContact } from "@/lib/whatsapp-assistance.functions";
import { createWhatsAppBasketUrl } from "@/lib/whatsapp-assistance";
import { brandById, type CartLine, type FulfilmentType, type LocationKey } from "@/lib/mealdeck";

type Props = {
  location: LocationKey;
  fulfilment: FulfilmentType;
  lines: readonly CartLine[];
};

/** An optional conversation handoff, NOT a bypass of Dishbee checkout. */
export function WhatsAppBasketHandoff({ location, fulfilment, lines }: Props) {
  const getContact = useServerFn(getWhatsAppHandoffContact);
  const contact = useQuery({
    queryKey: ["mealdeck", "whatsapp-handoff", location],
    queryFn: () => getContact({ data: { location } }),
    enabled: !COMING_SOON && lines.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  if (COMING_SOON || !lines.length || !contact.data?.available) return null;

  const url = createWhatsAppBasketUrl(contact.data.phone, {
    location,
    fulfilment,
    lines: lines.map((line) => ({
      brandName: brandById(line.brandId)?.name ?? "MealDeck",
      name: line.name,
      quantity: line.quantity,
      selectedModifiers: line.selectedModifiers.map((modifier) => ({ name: modifier.name })),
    })),
  });

  if (!url) return null;

  return (
    <aside className="mt-5 space-y-3 rounded-xl bg-secondary/50 p-4" aria-label="WhatsApp basket assistance">
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold">Prefer to ask on WhatsApp?</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Share the dishes in your basket with our connected support channel.
            We will confirm the live details before any order is placed.
          </p>
        </div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Ask about this basket
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Sends only dish names, quantities and selected options. Your address, phone,
        payment details and displayed prices are not shared. A chat is not a paid order.
      </p>
    </aside>
  );
}
