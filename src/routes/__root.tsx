import { MobileTabBar } from "@/components/mobile-tab-bar";
import { BackToTop } from "@/components/back-to-top";
import { SkipToMainContent } from "@/components/skip-to-main-content";
import { ThemeProvider } from "@/components/theme-provider";
import { MealDeckPageLoading } from "@/components/mealdeck-page-loading";
import { PwaConnectionNotice, PwaProvider } from "@/components/pwa-provider";
import { isMealDeckStaffPath, mealDeckPwaSurface } from "@/lib/mealdeck-pwa-surface";
import { MEALDECK_BUSINESS } from "@/lib/business-identity";
import { seo, SITE_DESCRIPTION } from "@/lib/seo";
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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isRouteAssetError, recoverMealDeckRoute } from "@/lib/mealdeck-route-recovery";

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
import { ArcadeProgressProvider } from "@/components/play/arcade-progress";

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
  const [retrying, setRetrying] = useState(false);
  const retryInFlight = useRef(false);
  const assetError = isRouteAssetError(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  async function retry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetrying(true);
    let reloading = false;
    try {
      await recoverMealDeckRoute(error, {
        invalidate: () => router.invalidate({ sync: true }),
        reset,
        reload: () => {
          window.location.reload();
          reloading = true;
        },
      });
    } catch (retryError) {
      reportLovableError(retryError, { boundary: "tanstack_root_retry" });
    } finally {
      if (!reloading) {
        retryInFlight.current = false;
        setRetrying(false);
      }
    }
  }

  if (retrying) return <MealDeckPageLoading />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {assetError ? "This page needs a refresh" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {assetError
            ? "Check your connection, then reload to get the latest page."
            : "Something went wrong on our end. You can try again or head back home."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void retry()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {assetError ? "Reload page" : "Try again"}
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      ...seo({
        title: `${MEALDECK_BUSINESS.tradingName} — ${MEALDECK_BUSINESS.tagline}`,
        description: SITE_DESCRIPTION,
        path: "/",
      }).meta,
      { name: "author", content: "MealDeck" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "MealDeck" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { name: "theme-color", content: "#faf6ed", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#120a0a", media: "(prefers-color-scheme: dark)" },
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const app = mealDeckPwaSurface(pathname);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href={app.manifest} />
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
  const internal = isMealDeckStaffPath(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <PwaProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        {!internal && <SkipToMainContent />}
        {!internal && <PwaConnectionNotice />}
        <div id="mealdeck-main" tabIndex={-1}>
          {/* The URL can change before the outgoing route unmounts. Keep its
              context in place throughout navigation, including delayed loads. */}
          <ArcadeProgressProvider>
            <Outlet />
          </ArcadeProgressProvider>
        </div>
        {!internal && <BackToTop />}
        {!internal && <MobileTabBar />}
        <Toaster position="top-center" />
      </PwaProvider>
    </QueryClientProvider>
  );
}
