import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import "./staff-mobile-navigation.css";

export type StaffMobileNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: number;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
  expanded?: boolean;
  controls?: string;
  buttonRef?: (element: HTMLButtonElement | null) => void;
};

/** Presentation only: callers supply actions from their existing authorised workspace. */
export function StaffMobileNav({
  label,
  items,
  hidden = false,
}: {
  label: string;
  items: readonly StaffMobileNavItem[];
  hidden?: boolean;
}) {
  return (
    <nav
      className="md-staff-bottom-nav"
      aria-label={label}
      hidden={hidden}
      style={{ "--md-staff-nav-columns": items.length } as CSSProperties}
    >
      {items.map(({ icon: Icon, ...item }) => {
        const badge = Math.max(0, Math.floor(item.badge ?? 0));
        const content = (
          <>
            <span className="md-staff-nav-icon">
              <Icon aria-hidden="true" />
              {badge > 0 && (
                <span className="md-staff-nav-badge" aria-hidden="true">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            <span className="md-staff-nav-label">{item.label}</span>
          </>
        );
        const common = {
          className: "md-staff-nav-item",
          "data-active": item.active ? "true" : undefined,
          "aria-label": badge > 0 ? `${item.label}, ${badge}` : item.label,
          "aria-controls": item.controls,
          "aria-expanded": item.expanded,
        };
        return item.href ? (
          <a
            key={item.id}
            {...common}
            href={item.disabled ? undefined : item.href}
            aria-current={item.active ? "page" : undefined}
            aria-disabled={item.disabled || undefined}
            tabIndex={item.disabled ? -1 : undefined}
            onClick={item.disabled ? undefined : item.onClick}
          >
            {content}
          </a>
        ) : (
          <button
            key={item.id}
            ref={item.buttonRef}
            {...common}
            type="button"
            disabled={item.disabled}
            aria-pressed={item.expanded === undefined ? item.active : undefined}
            onClick={item.onClick}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}

/** The same modal becomes a thumb-friendly sheet on mobile and a dialog on desktop. */
export function StaffMobileSheet({
  id,
  open,
  onOpenChange,
  title,
  description,
  children,
  onCloseAutoFocus,
}: {
  id?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 801px)");
    const closeOnDesktop = () => {
      if (desktop.matches) onOpenChange(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [open, onOpenChange]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id={id}
        className="md-ops md-staff-sheet"
        overlayClassName="md-staff-sheet-overlay"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="md-staff-sheet-heading">
          <span className="md-staff-sheet-handle" aria-hidden="true" />
          <DialogTitle ref={titleRef} tabIndex={-1} className="md-staff-sheet-title">
            {title}
          </DialogTitle>
          <DialogDescription className="md-staff-sheet-description">
            {description}
          </DialogDescription>
        </div>
        <div className="md-staff-sheet-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
