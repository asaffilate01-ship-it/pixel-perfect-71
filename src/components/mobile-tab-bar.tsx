import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, Gamepad2, MapPin } from "lucide-react";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { isLaunchMenuRoute } from "@/lib/launch-menu-navigation";

type Tab = {
  label: string;
  to: "/" | "/order" | "/menus" | "/track" | "/play";
  hash?: string;
  icon: typeof Home;
};

const left: Tab[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Brands", to: "/", hash: "brands", icon: LayoutGrid },
];
const right: Tab[] = [
  { label: "Play", to: "/play", icon: Gamepad2 },
  { label: "Track", to: "/track", icon: MapPin },
];

export function MobileTabBar() {
  const { pathname, hash } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, hash: s.location.hash }),
  });

  if (
    pathname === "/franchise" ||
    pathname.startsWith("/franchise/") ||
    isLaunchMenuRoute(pathname)
  )
    return null;

  const isActive = (t: Tab) =>
    t.to === pathname && (t.hash ? hash === t.hash : !hash || t.to !== "/");

  const item = (t: Tab) => {
    const active = isActive(t);
    const Icon = t.icon;
    return (
      <Link
        key={t.label}
        to={t.to}
        {...(t.hash ? { hash: t.hash } : {})}
        className="group relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95"
        aria-current={active ? "page" : undefined}
      >
        <span
          className={`grid h-8 w-12 place-items-center rounded-full transition-all duration-300 ${
            active ? "bg-primary/20 text-accent" : "text-muted-foreground"
          }`}
        >
          <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
        </span>
        <span
          className={`font-display text-xs font-semibold tracking-wide ${active ? "text-accent" : "text-muted-foreground"}`}
        >
          {t.label}
        </span>
      </Link>
    );
  };

  const dealActive = pathname === "/order";

  return (
    <>
      <div
        className="lg:hidden"
        aria-hidden="true"
        style={{ height: "calc(116px + var(--md-mobile-safe-bottom))" }}
      />
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 z-50 lg:hidden"
        style={{ bottom: "calc(12px + var(--md-mobile-safe-bottom))" }}
      >
        <div className="relative flex items-stretch rounded-[1.75rem] border border-border/70 bg-card px-1 shadow-2xl">
          {left.map(item)}
          <div className="flex flex-1 justify-center">
            <Link
              to="/menus"
              aria-label="Order Now — browse MealDeck menus"
              aria-current={dealActive ? "page" : undefined}
              className={`relative -mt-8 flex h-20 w-[68px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent flex-col items-center justify-center rounded-lg border border-ink/15 bg-paper shadow-xl transition-transform duration-300 active:scale-90 ${
                dealActive ? "scale-105" : ""
              }`}
            >
              <span className="pointer-events-none absolute inset-1 rounded-[6px] border-[1.5px] border-primary/70" />
              <MealDeckLogo decorative className="h-8 w-8" />
              <span className="mt-1 flex flex-col items-center font-display text-[10px] font-black uppercase leading-[1.05] tracking-[0.04em] text-ink">
                <span>Order</span>
                <span>Now</span>
              </span>
            </Link>
          </div>
          {right.map(item)}
        </div>
      </nav>
    </>
  );
}
