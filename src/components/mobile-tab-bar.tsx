import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, Gamepad2, MapPin } from "lucide-react";
import { suitArtwork } from "@/lib/food-suit-artwork";
import backEmblem from "@/assets/mealdeck-back-emblem.png";

type Tab = { label: string; to: "/" | "/order" | "/track" | "/play"; hash?: string; icon: typeof Home };

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

  if (pathname === "/franchise" || pathname.startsWith("/franchise/")) return null;

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
              aria-label="Order now"
              className={`relative -mt-8 flex h-20 w-14 rotate-[-6deg] flex-col items-center justify-center rounded-lg border border-ink/15 bg-paper shadow-xl transition-transform duration-300 active:scale-90 ${
                dealActive ? "rotate-0 scale-105" : "hover:rotate-0"
              }`}
            >
              <span className="pointer-events-none absolute inset-1 rounded-[6px] border-[1.5px] border-primary/70" />
              <span className="absolute left-1.5 top-1 flex flex-col items-center font-display text-[10px] font-black leading-[0.85] text-primary">
                A<img src={suitArtwork.burger} alt="" className="mt-0.5 h-2.5 w-2.5 object-contain" />
              </span>
              <span className="absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center font-display text-[10px] font-black leading-[0.85] text-primary">
                A<img src={suitArtwork.burger} alt="" className="mt-0.5 h-2.5 w-2.5 object-contain" />
              </span>
              <img src={backEmblem} alt="" className="h-[18px] w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />
              <span className="mt-1 font-display text-[9px] font-black uppercase tracking-widest text-ink">Order</span>
            </Link>
          </div>
          {right.map(item)}
        </div>
      </nav>
    </>
  );
}
