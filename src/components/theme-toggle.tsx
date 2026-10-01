import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <Button
      type="button"
      variant="glass"
      size={compact ? "icon" : "default"}
      onClick={toggleTheme}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      title={`Switch to ${dark ? "light" : "dark"} mode`}
      className={cn(
        "group/theme rounded-full border-accent/35 bg-card/90 shadow-md hover:border-accent",
        compact ? "size-11" : "h-10 px-3",
        className,
      )}
    >
      <span className="relative grid size-5 place-items-center overflow-hidden" aria-hidden="true">
        <Sun className={cn("absolute size-5 text-accent transition-all duration-300", dark ? "-rotate-90 scale-0" : "rotate-0 scale-100")} />
        <Moon className={cn("absolute size-5 text-accent transition-all duration-300", dark ? "rotate-0 scale-100" : "rotate-90 scale-0")} />
      </span>
      {!compact ? <span className="hidden xl:inline">{dark ? "Light" : "Dark"}</span> : null}
    </Button>
  );
}