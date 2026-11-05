import { createFileRoute } from "@tanstack/react-router";
import { GroupOrderPlanner } from "@/components/group-order-planner";
import { seo } from "@/lib/seo";
import groupCss from "../styles.mealdeck-group.css?url";

export const Route = createFileRoute("/group-order")({
  head: () => {
    const metadata = seo({
      title: "Group orders — everyone chooses, one order together | MealDeck",
      description:
        "Invite your friends to choose from five MealDeck menus. Collect their replies, review separate numbered bags and take one group order to collection checkout.",
      path: "/group-order",
    });
    return {
      ...metadata,
      meta: [
        ...metadata.meta,
        { name: "robots", content: "noindex, nofollow" },
        { name: "referrer", content: "same-origin" },
      ],
      links: [...metadata.links, { rel: "stylesheet", href: groupCss }],
    };
  },
  component: GroupOrderPlanner,
});
