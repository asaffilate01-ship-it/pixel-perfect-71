import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/whatsapp/channel")({
  server: {
    handlers: {
      GET: async () => {
        const [{ readWhatsAppConfig, WHATSAPP_NO_STORE }, { createWhatsappStore }] =
          await Promise.all([
            import("@/lib/mealdeck-whatsapp-transport.server"),
            import("@/lib/mealdeck-whatsapp-store.server"),
          ]);
        const config = readWhatsAppConfig(process.env);
        const available = !!(config?.orderingEnabled && createWhatsappStore(process.env));
        return Response.json(
          available && config
            ? {
                available: true,
                url: `https://wa.me/${config.businessNumber}?text=Hello%20Mealdeck`,
              }
            : { available: false },
          { headers: WHATSAPP_NO_STORE },
        );
      },
    },
  },
});
