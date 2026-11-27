import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, Gamepad2, UserRound } from "lucide-react";
import { isMealDeckNavCurrent } from "@/lib/mealdeck-nav-state";
import { isLaunchMenuRoute } from "@/lib/launch-menu-navigation";

type Tab = {
  label: string;
  to: "/" | "/order" | "/menus" | "/play" | "/account";
  hash?: string;
  icon: typeof Home;
};

const left: Tab[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Brands", to: "/", hash: "brands", icon: LayoutGrid },
];
const right: Tab[] = [
  { label: "Play", to: "/play", icon: Gamepad2 },
  { label: "Account", to: "/account", icon: UserRound },
];

export function MobileTabBar() {
  const { pathname, hash } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, hash: s.location.hash }),
  });

  if (
    pathname === "/franchise" ||
    pathname.startsWith("/franchise/") ||
    pathname === "/group-order" ||
    pathname === "/group-pay" ||
    isLaunchMenuRoute(pathname)
  )
    return null;

  const isActive = (t: Tab) => isMealDeckNavCurrent(pathname, hash, t);

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
          <Icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
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
          <div className="flex min-w-[70px] flex-1 justify-center sm:min-w-[80px]">
            <Link
              to="/menus"
              aria-label="Click Here to Order — browse MealDeck menus"
              aria-current={dealActive ? "page" : undefined}
              className={`relative -mt-8 flex h-20 w-[70px] shrink-0 flex-col items-center justify-center rounded-lg border border-ink/15 bg-paper px-2 shadow-xl transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-[80px] ${
                dealActive ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <span className="pointer-events-none absolute inset-1 rounded-[6px] border-[1.5px] border-primary/70" />
              <span className="flex flex-col items-center gap-0.5 text-center font-display text-[12px] font-extrabold leading-tight text-ink sm:text-[13px]">
                <span>Click</span>
                <span>Here to</span>
                <span className="text-[15px] font-black leading-tight sm:text-[17px]">Order</span>
              </span>
            </Link>
          </div>
          {right.map(item)}
        </div>
      </nav>
    </>
  );
}
