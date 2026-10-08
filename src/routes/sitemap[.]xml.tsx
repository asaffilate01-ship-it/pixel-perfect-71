import { createFileRoute } from "@tanstack/react-router";
import { posts } from "@/lib/blog";
import { SITE_URL } from "@/lib/seo";
import { FRANCHISE_BRAND_IDS } from "@/lib/franchise-selection";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const paths = ["/", "/luton", "/st-albans", "/order", "/franchise", ...FRANCHISE_BRAND_IDS.map((id) => `/franchise/${id}`), "/blog", ...posts.map((p) => `/blog/${p.slug}`)];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
          .map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`)
          .join("\n")}\n</urlset>`;
        return new Response(xml, { headers: { "Content-Type": "application/xml" } });
      },
    },
  },
});
