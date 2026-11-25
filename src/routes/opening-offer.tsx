import { createFileRoute, redirect } from "@tanstack/react-router";

// Preserve old campaign links without advertising or reactivating expired pricing.
// Original terms remain in Git history; server pricing and order history are untouched.
export const Route = createFileRoute("/opening-offer")({
  beforeLoad: () => {
    throw redirect({ to: "/offers", statusCode: 301, replace: true });
  },
});
