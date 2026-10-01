import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, Tag, MapPin, UtensilsCrossed } from "lucide-react";

type Tab = { label: string; to: "/" | "/order" | "/track"; hash?: string; icon: typeof Home };

const left: Tab[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Brands", to: "/", hash: "brands", icon: LayoutGrid },
];
const right: Tab[] = [
  { label: "Offers", to: "/", hash: "offers", icon: Tag },
  { label: "Track", to: "/track", icon: MapPin },
];

export function MobileTabBar() {
  const { pathname, hash } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, hash: s.location.hash }),
  });

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
        className="group relative flex flex-1 flex-col items-center justify-center gap-1 py-2 active:scale-90 transition-transform"
        aria-current={active ? "page" : undefined}
      >
        <span
          className={`grid h-8 w-12 place-items-center rounded-full transition-all duration-300 ${
            active ? "bg-primary/20 text-accent" : "text-muted-foreground"
          }`}
        >
          <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
        </span>
        <span className={`font-display text-[10px] font-semibold tracking-wide ${active ? "text-accent" : "text-muted-foreground"}`}>
          {t.label}
        </span>
      </Link>
    );
  };

  const dealActive = pathname === "/order";

  return (
    <>
      <div className="h-24 lg:hidden" aria-hidden />
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 bottom-3 z-50 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="relative flex items-stretch rounded-[1.75rem] border border-border/70 bg-card/95 px-1 shadow-2xl backdrop-blur-xl">
          {left.map(item)}
          <div className="flex flex-1 justify-center">
            <Link
              to="/order"
              aria-label="Deal me in — order now"
              className={`-mt-7 flex h-[4.5rem] w-14 rotate-[-6deg] flex-col items-center justify-center rounded-xl border-2 border-accent bg-primary text-primary-foreground shadow-xl transition-transform duration-300 active:scale-90 ${
                dealActive ? "rotate-0 scale-105" : "hover:rotate-0"
              }`}
            >
              <Spade className="size-6 fill-current" />
              <span className="mt-0.5 font-display text-[9px] font-bold uppercase tracking-widest">Deal</span>
            </Link>
          </div>
          {right.map(item)}
        </div>
      </nav>
    </>
  );
}
