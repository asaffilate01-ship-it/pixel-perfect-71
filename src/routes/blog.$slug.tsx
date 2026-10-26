import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Facebook, Link2, MessageCircle, Twitter, Linkedin, Check } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { getPost, posts } from "@/lib/blog";
import { SITE_URL, ldScript, seo } from "@/lib/seo";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getPost(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const base = seo({
      title: `${loaderData.title} | MealDeck`,
      description: loaderData.excerpt,
      path: `/blog/${params.slug}`,
      image: `${SITE_URL}${loaderData.image}`,
      type: "article",
      keywords: loaderData.keywords,
    });
    return {
      ...base,
      scripts: [
        ldScript({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: loaderData.title,
          description: loaderData.excerpt,
          image: `${SITE_URL}${loaderData.image}`,
          datePublished: loaderData.date,
          author: { "@type": "Organization", name: "MealDeck" },
          publisher: { "@type": "Organization", name: "MealDeck", logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.png` } },
          mainEntityOfPage: `${SITE_URL}/blog/${params.slug}`,
        }),
      ],
    };
  },
  notFoundComponent: () => (
    <div className="p-16 text-center">
      <p>That card isn't in the deck.</p>
      <Link to="/blog" className="text-accent underline">Back to the blog</Link>
    </div>
  ),
  component: PostPage,
});

function Share({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: "Share on WhatsApp", href: `https://wa.me/?text=${t}%20${u}`, Icon: MessageCircle },
    { label: "Share on Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, Icon: Facebook },
    { label: "Share on X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`, Icon: Twitter },
    { label: "Share on LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, Icon: Linkedin },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-display text-sm font-bold uppercase tracking-widest text-accent">Deal it out:</span>
      {links.map(({ label, href, Icon }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
          className="channel-chip grid size-11 place-items-center rounded-full border border-accent/60 bg-primary text-primary-foreground shadow-lg transition-transform hover:-translate-y-1">
          <Icon className="size-5" />
        </a>
      ))}
      <button
        aria-label="Copy link"
        onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="grid size-11 place-items-center rounded-full border border-accent/60 bg-card text-foreground shadow-lg transition-transform hover:-translate-y-1"
      >
        {copied ? <Check className="size-5 text-accent" /> : <Link2 className="size-5" />}
      </button>
    </div>
  );
}

function PostPage() {
  const post = Route.useLoaderData();
  const url = `${SITE_URL}/blog/${post.slug}`;
  const more = posts.filter((p) => p.slug !== post.slug).slice(0, 3);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link to="/blog" className="text-sm text-muted-foreground hover:text-accent">← Back to the Deck Blog</Link>
        <p className="mt-6 font-display text-sm font-bold uppercase tracking-[0.3em] text-accent">{post.rank}{post.suit} · {post.tag}</p>
        <h1 className="mt-3 font-display text-4xl font-black leading-tight sm:text-5xl">{post.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {new Date(post.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <div className="mt-8 overflow-hidden rounded-2xl border-4 border-accent/70 shadow-2xl">
          <img src={post.image} alt={post.title} width={1200} height={630} className="w-full object-cover" />
        </div>
        <div className="mt-6"><Share url={url} title={post.title} /></div>
        <article className="mt-10 space-y-6 text-lg leading-relaxed text-foreground/90">
          {post.body.map((b, i) => (
            <section key={i}>
              {b.h && <h2 className="mb-2 font-display text-2xl font-black text-accent">♦ {b.h}</h2>}
              <p>{b.p}</p>
            </section>
          ))}
        </article>
        <div className="mt-12 rounded-2xl border border-accent/50 bg-card p-8 text-center">
          <p className="font-display text-2xl font-black">Your hand is waiting.</p>
          <Button asChild size="lg" className="mt-4"><Link to="/order">Coming soon</Link></Button>
        </div>
        <div className="mt-10"><Share url={url} title={post.title} /></div>
      </main>
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <h2 className="font-display text-3xl font-black">Next card in the deck</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {more.map((p) => <PostCard key={p.slug} post={p} />)}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
