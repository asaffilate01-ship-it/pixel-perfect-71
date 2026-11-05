import { createFileRoute } from "@tanstack/react-router";
import { AuthEmailConfirmation } from "@/components/auth-email-confirmation";
import { seo } from "@/lib/seo";
import confirmationCss from "../styles.auth-confirm.css?url";

export const Route = createFileRoute("/auth/confirm")({
  headers: () => ({
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  }),
  head: () => {
    const metadata = seo({
      title: "Secure email confirmation | MealDeck",
      description: "Continue your requested MealDeck account confirmation securely.",
      path: "/auth/confirm",
    });
    return {
      ...metadata,
      meta: [
        ...metadata.meta,
        { name: "robots", content: "noindex, nofollow, noarchive" },
        { name: "referrer", content: "no-referrer" },
      ],
      links: [...metadata.links, { rel: "stylesheet", href: confirmationCss }],
    };
  },
  component: AuthEmailConfirmation,
});
