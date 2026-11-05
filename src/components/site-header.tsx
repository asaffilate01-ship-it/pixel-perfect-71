import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { isMealDeckNavCurrent } from "@/lib/mealdeck-nav-state";
import { ArrowRight, MapPin, Menu, X } from "lucide-react";
import { MealDeckLogo } from "@/components/mealdeck-logo";

const navItems = [
  { label: "Brands", to: "/", hash: "brands" },
  { label: "Offers", to: "/", hash: "offers" },
  { label: "How it works", to: "/", hash: "how" },
  { label: "Locations", to: "/", hash: "locations" },
] as const;

export function SiteHeader({ context, nav = true }: { context?: ReactNode; nav?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuId=useId();
  const triggerRef=useRef<HTMLButtonElement>(null);
  const firstLinkRef=useRef<HTMLAnchorElement>(null);
  const {pathname,hash}=useRouterState({select:state=>({
    pathname:state.location.pathname,hash:state.location.hash,
  })});
  useEffect(()=>{setOpen(false);},[pathname,hash]);
  useEffect(()=>{
    if(!open)return;
    firstLinkRef.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown",onKeyDown);
    return()=>document.removeEventListener("keydown",onKeyDown);
  },[open]);
  const current=(to:string,targetHash?:string)=>isMealDeckNavCurrent(pathname,hash,{to,hash:targetHash});
  const active=(to:string,targetHash?:string)=>current(to,targetHash)?"is-current":undefined;

  return (
    <header className="md-site-header">
      <div className="md-header-inner">
        <Link to="/" className="md-header-logo" aria-label="MealDeck home">
          <MealDeckLogo />
        </Link>

        {nav ? (
          <nav className="md-desktop-nav" aria-label="Main navigation">
            <Link to="/" aria-current={current("/")?"page":undefined} className={active("/")}>Home</Link>
            <Link to="/menus" aria-current={current("/menus")?"page":undefined} className={active("/menus")}>Menus</Link>
            {navItems.map((item) => (
              <Link key={item.label} to={item.to} hash={item.hash} aria-current={current(item.to,item.hash)?"location":undefined} className={active(item.to,item.hash)}>{item.label}</Link>
            ))}
            <Link to="/play" aria-current={current("/play")?"page":undefined} className={active("/play")}>Play &amp; Rewards</Link>
            <Link to="/franchise" aria-current={current("/franchise")?"page":undefined} className={active("/franchise")}>Franchises</Link>
            <Link to="/blog" aria-current={current("/blog")?"page":undefined} className={active("/blog")}>Blog</Link>
            <Link to="/track" aria-current={current("/track")?"page":undefined} className={active("/track")}>Track</Link>
          </nav>
        ) : null}

        <div className="md-header-actions">
          {context ?? (
            <>
              <Link to="/luton" className="md-header-location"><MapPin /> Luton</Link>
              <Link to="/menus" className="md-btn md-btn-yellow">Browse menus <ArrowRight /></Link>
            </>
          )}
          {nav ? (
            <button
              type="button"
              className="md-mobile-menu-button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls={menuId}
              ref={triggerRef}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X /> : <Menu />}
            </button>
          ) : null}
        </div>
      </div>

      {nav && open ? (
        <nav id={menuId} className="md-mobile-nav" aria-label="Mobile navigation">
          <Link to="/" ref={firstLinkRef} onClick={() => setOpen(false)} aria-current={current("/")?"page":undefined} className={active("/")}>Home</Link>
          <Link to="/menus" onClick={() => setOpen(false)} aria-current={current("/menus")?"page":undefined} className={active("/menus")}>Menus</Link>
          {navItems.map((item) => (
            <Link key={item.label} to={item.to} hash={item.hash} onClick={() => setOpen(false)} aria-current={current(item.to,item.hash)?"location":undefined} className={active(item.to,item.hash)}>{item.label}</Link>
          ))}
          <Link to="/luton" onClick={() => setOpen(false)} aria-current={current("/luton")?"page":undefined} className={active("/luton")}>Luton</Link>
          <Link to="/st-albans" onClick={() => setOpen(false)} aria-current={current("/st-albans")?"page":undefined} className={active("/st-albans")}>St Albans · Coming soon</Link>
          <Link to="/bedford" onClick={() => setOpen(false)} aria-current={current("/bedford")?"page":undefined} className={active("/bedford")}>Bedford · Coming soon</Link>
          <Link to="/play" onClick={() => setOpen(false)} aria-current={current("/play")?"page":undefined} className={active("/play")}>Play &amp; Rewards</Link>
          <Link to="/franchise" onClick={() => setOpen(false)} aria-current={current("/franchise")?"page":undefined} className={active("/franchise")}>Franchises</Link>
          <Link to="/blog" onClick={() => setOpen(false)} aria-current={current("/blog")?"page":undefined} className={active("/blog")}>Blog</Link>
          <Link to="/track" onClick={() => setOpen(false)} aria-current={current("/track")?"page":undefined} className={active("/track")}>Track order</Link>
          <Link to="/menus" className="md-btn md-btn-yellow" onClick={() => setOpen(false)}>Browse menus <ArrowRight /></Link>
        </nav>
      ) : null}
    </header>
  );
}
