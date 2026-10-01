import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PostCard } from "@/components/post-card";
import { posts } from "@/lib/blog";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/blog/")({
  head: () =>
    seo({
      title: "The Deck Blog — Food Guides for Luton & St Albans | MealDeck",
      description: "Food guides, group ordering tips and offers for Luton and St Albans. French tacos, smash burgers, desi food and more from the MealDeck table.",
      path: "/blog",
      keywords: "food blog Luton, food delivery St Albans, takeaway Luton, best food Luton",
    }),
  component: BlogIndex,
});

function BlogIndex() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-accent">♠ The Deck Blog ♥</p>
        <h1 className="mt-3 font-display text-4xl font-black sm:text-6xl">Cards on the table.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Food guides, group-order tactics and the latest hands from MealDeck in Luton and St Albans.
        </p>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => <PostCard key={p.slug} post={p} />)}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
