import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateLaunchMenuSearch } from "@/lib/launch-menu-navigation";

export const Route = createFileRoute("/menu")({
  validateSearch: validateLaunchMenuSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/menus",
      search: validateLaunchMenuSearch(search),
      replace: true,
      statusCode: 308,
    });
  },
});
