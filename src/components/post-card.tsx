import { Link } from "@tanstack/react-router";
import type { Post } from "@/lib/blog";

export function PostCard({ post }: { post: Post }) {
  const red = post.suit === "♥" || post.suit === "♦";
  const ink = red ? "text-primary" : "text-background";
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border-4 border-accent/70 bg-paper text-ink shadow-xl transition-transform duration-300 hover:-translate-y-2 hover:rotate-[-1deg]"
    >
      <span className={`absolute left-3 top-2 z-10 flex flex-col items-center font-display text-xl font-black leading-none ${ink}`}>
        {post.rank}<span>{post.suit}</span>
      </span>
      <span className={`absolute bottom-2 right-3 z-10 flex rotate-180 flex-col items-center font-display text-xl font-black leading-none ${ink}`}>
        {post.rank}<span>{post.suit}</span>
      </span>
      <div className="m-3 mt-12 overflow-hidden rounded-lg border-2 border-primary/60">
        <img src={post.image} alt={post.title} width={1200} height={630} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="flex flex-1 flex-col px-6 pb-12">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">{post.tag}</span>
        <h3 className="mt-2 font-display text-xl font-black leading-tight text-ink">{post.title}</h3>
        <p className="mt-2 text-sm text-ink/75">{post.excerpt}</p>
      </div>
    </Link>
  );
}
