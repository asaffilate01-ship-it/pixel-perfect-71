import { createFileRoute } from "@tanstack/react-router";
import { CustomerAccount } from "@/components/customer-account";
import { seo } from "@/lib/seo";
import { customerReturnTarget, type CustomerReturnTarget } from "@/lib/mealdeck-customer-return";
import accountCss from "../styles.customer-account.css?url";

export const Route = createFileRoute("/account")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: CustomerReturnTarget } => ({
    returnTo: customerReturnTarget(search["returnTo"]),
  }),
  head: () => {
    const metadata = seo({
      title: "Your account & preferences | MealDeck",
      description:
        "Register with a verified email, manage your details and choose how you hear from MealDeck.",
      path: "/account",
    });
    return {
      ...metadata,
      meta: [...metadata.meta, { name: "robots", content: "noindex, nofollow" }],
      links: [...metadata.links, { rel: "stylesheet", href: accountCss }],
    };
  },
  component: AccountPage,
});

function AccountPage() {
  const { returnTo } = Route.useSearch();
  return <CustomerAccount returnTo={returnTo ?? "/menus"} />;
}
