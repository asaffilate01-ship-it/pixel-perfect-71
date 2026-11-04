import { ComingSoonBanner } from "@/components/coming-soon";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { BackToTop } from "@/components/back-to-top";
import { SkipToMainContent } from "@/components/skip-to-main-content";
import { ThemeProvider } from "@/components/theme-provider";
import { isLaunchMenuRoute } from "@/lib/launch-menu-navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import marketingCss from "../styles.mealdeck-rebuild.css?url";
import franchiseCss from "../styles.franchise.css?url";
import franchiseBrandsCss from "../styles.franchise-brands.css?url";
import dishbeePlayCss from "../styles.dishbee-play.css?url";
import dishbeePlayPremiumCss from "../styles.dishbee-play-premium.css?url";
import marketplaceDiscoveryCss from "../styles.marketplace-discovery.css?url";
import marketplacePremiumCss from "../styles.marketplace-premium.css?url";
import launchMenusCss from "../styles.launch-menus.css?url";
import launchBasketCss from "../styles.launch-basket.css?url";
import launchCustomiserCss from "../styles.launch-customiser.css?url";
import { Toaster } from "@/components/ui/sonner";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MealDeck — One Order. Every Craving." },
      {
        name: "description",
        content: "Multi-brand food ordering. One basket, one delivery fee, every craving.",
      },
      { name: "author", content: "MealDeck" },
      { property: "og:title", content: "MealDeck — One Order. Every Craving." },
      {
        property: "og:description",
        content: "Multi-brand food ordering. One basket, one delivery fee, every craving.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "MealDeck" },
      { property: "og:locale", content: "en_GB" },
      { name: "theme-color", content: "#faf6ed", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#120a0a", media: "(prefers-color-scheme: dark)" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "stylesheet", href: marketingCss },
      { rel: "stylesheet", href: franchiseCss },
      { rel: "stylesheet", href: franchiseBrandsCss },
      { rel: "stylesheet", href: dishbeePlayCss },
      { rel: "stylesheet", href: dishbeePlayPremiumCss },
      { rel: "stylesheet", href: marketplaceDiscoveryCss },
      { rel: "stylesheet", href: marketplacePremiumCss },
      { rel: "stylesheet", href: launchMenusCss },
      { rel: "stylesheet", href: launchBasketCss },
      { rel: "stylesheet", href: launchCustomiserCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800;900&family=DM+Sans:wght@400;500;700&family=Caveat:wght@600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{localStorage.removeItem('mealdeck-theme')}catch(e){}document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'})()`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const internal =
    pathname === "/ops" ||
    pathname.startsWith("/ops/") ||
    pathname === "/kds" ||
    pathname.startsWith("/kds/");
  const basketPage = isLaunchMenuRoute(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      {!internal && <SkipToMainContent />}
      {!internal && !basketPage && <ComingSoonBanner />}
      <div id="mealdeck-main" tabIndex={-1}>
        <Outlet />
      </div>
      {!internal && !basketPage && <BackToTop />}
      {!internal && <MobileTabBar />}
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
