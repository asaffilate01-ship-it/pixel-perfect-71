import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  label: string;
};

type OriginalPlacement = {
  value: string;
  priority: string;
};

// Coarsen the row unit for large queues rather than depending on a browser's
// maximum number of implicit grid tracks or abandoning packing when busy.
const MAX_PACKED_ROWS = 1000;

/** Packs natural-height cards without changing their parent, keys or order. */
export function KdsTicketGrid({ children, className = "md-kds-ticket-grid", label }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") {
      return;
    }

    const cards = new Map<HTMLElement, OriginalPlacement>();
    let disposed = false;
    let frame = 0;
    let observedWidth: number | undefined;

    const restoreCard = (card: HTMLElement, original: OriginalPlacement) => {
      if (original.value) {
        card.style.setProperty("grid-row-end", original.value, original.priority);
      } else {
        card.style.removeProperty("grid-row-end");
      }
    };

    const resetPlacement = () => {
      grid.removeAttribute("data-packed");
      grid.style.removeProperty("--kds-measured-row");
      for (const [card, original] of cards) restoreCard(card, original);
    };

    const measure = () => {
      frame = 0;
      if (disposed) return;

      const style = window.getComputedStyle(grid);
      // Used grid tracks resolve to pixel lengths. Unsupported/subgrid layouts
      // keep the ordinary CSS layout instead of guessing their column count.
      const columns = style.gridTemplateColumns
        .split(/\s+/)
        .filter((track) => /^\d+(?:\.\d+)?px$/.test(track)).length;
      const trackValue = style.getPropertyValue("--kds-grid-row").trim();
      const rowSize = /^\d+(?:\.\d+)?px$/.test(trackValue) ? Number.parseFloat(trackValue) : 0;
      const gutter = Number.parseFloat(style.columnGap);

      if (
        !grid.isConnected ||
        grid.getBoundingClientRect().width <= 0 ||
        (style.display !== "grid" && style.display !== "inline-grid") ||
        columns < 2 ||
        !Number.isFinite(rowSize) ||
        rowSize < 1 ||
        !Number.isFinite(gutter) ||
        gutter < 0
      ) {
        resetPlacement();
        return;
      }

      // Read every natural border-box height before writing any placement.
      const measurements = [...grid.children]
        .filter((child): child is HTMLElement => child instanceof HTMLElement && cards.has(child))
        .map((card) => ({
          card,
          height: card.getBoundingClientRect().height,
        }));
      if (measurements.some(({ height }) => !Number.isFinite(height) || height < 0)) {
        resetPlacement();
        return;
      }

      let measuredRow = rowSize;
      let usedRows = 0;
      let placements: { card: HTMLElement; rows: number }[] = [];
      // Reuse the measurements if a longer queue needs a coarser row unit.
      // No additional layout reads or writes occur in these bounded passes.
      for (let attempt = 0; attempt < 8; attempt++) {
        const columnEnds = Array<number>(columns).fill(0);
        placements = measurements.map(({ card, height }) => {
          const rows = Math.max(1, Math.ceil((height + gutter) / measuredRow));
          // Estimate sparse single-column-wide placement solely for the track
          // budget. The actual DOM and column assignment remain untouched.
          const column = columnEnds.indexOf(Math.min(...columnEnds));
          columnEnds[column] = (columnEnds[column] ?? 0) + rows;
          return { card, rows };
        });
        usedRows = Math.max(...columnEnds);
        if (usedRows <= MAX_PACKED_ROWS) break;
        measuredRow = Math.max(
          measuredRow + 1,
          Math.ceil((measuredRow * usedRows) / MAX_PACKED_ROWS),
        );
      }
      if (
        !Number.isFinite(measuredRow) ||
        !Number.isFinite(usedRows) ||
        usedRows > MAX_PACKED_ROWS
      ) {
        resetPlacement();
        return;
      }

      grid.style.setProperty("--kds-measured-row", `${measuredRow}px`);
      grid.setAttribute("data-packed", "true");
      for (const { card, rows } of placements) {
        const value = `span ${rows}`;
        if (card.style.gridRowEnd !== value) card.style.gridRowEnd = value;
      }
    };

    const schedule = () => {
      if (!disposed && !frame) frame = window.requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === grid) {
          // Packing changes grid height. Only width changes should schedule
          // another measurement, avoiding a self-triggered observer loop.
          if (entry.contentRect.width === observedWidth) continue;
          observedWidth = entry.contentRect.width;
        }
        schedule();
      }
    });

    const syncChildren = () => {
      const current = new Set(
        [...grid.children].filter((child): child is HTMLElement => child instanceof HTMLElement),
      );
      for (const [card, original] of cards) {
        if (current.has(card)) continue;
        resizeObserver.unobserve(card);
        restoreCard(card, original);
        cards.delete(card);
      }
      for (const card of current) {
        if (cards.has(card)) continue;
        cards.set(card, {
          value: card.style.getPropertyValue("grid-row-end"),
          priority: card.style.getPropertyPriority("grid-row-end"),
        });
        resizeObserver.observe(card, { box: "border-box" });
      }
      schedule();
    };

    const mutationObserver = new MutationObserver(syncChildren);
    mutationObserver.observe(grid, { childList: true });
    resizeObserver.observe(grid);
    syncChildren();

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      resetPlacement();
    };
  }, []);

  return (
    <div ref={gridRef} className={className} aria-label={label}>
      {children}
    </div>
  );
}
