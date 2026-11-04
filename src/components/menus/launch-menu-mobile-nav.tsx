import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

type MenuChoice = { id: string; name: string };

/** Native phone pickers keep every brand and section within reach without sideways rails. */
export function LaunchMenuMobileNav({
  brandId,
  brandName,
  brands,
  sections,
  activeSection,
  search,
  count,
  onBrand,
  onSection,
  onSearch,
}: {
  brandId: string;
  brandName: string;
  brands: MenuChoice[];
  sections: MenuChoice[];
  activeSection: string | undefined;
  search: string;
  count: number;
  onBrand: (id: string) => void;
  onSection: (id: string | undefined) => void;
  onSearch: (value: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus({ preventScroll: true });
  }, [searchOpen]);
  useEffect(() => setSearchOpen(false), [brandId]);

  function closeSearch() {
    setSearchOpen(false);
    onSearch("");
    searchButtonRef.current?.focus({ preventScroll: true });
  }

  return (
    <div id="launch-mobile-controls" className="lm-mobile-controls" data-search-open={searchOpen}>
      <div className="lm-mobile-selectors">
        <label className="lm-mobile-select">
          <span>Brand</span>
          <select
            aria-label="Choose menu brand"
            value={brandId}
            onChange={(event) => onBrand(event.target.value)}
          >
            {brands.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <label className="lm-mobile-select">
          <span>Section</span>
          <select
            aria-label="Choose menu section"
            value={activeSection ?? ""}
            onChange={(event) => onSection(event.target.value || undefined)}
          >
            <option value="">All items</option>
            {sections.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <button
          type="button"
          className="lm-mobile-search-toggle"
          ref={searchButtonRef}
          aria-label={searchOpen ? "Close menu search" : "Search this menu"}
          aria-expanded={searchOpen}
          aria-controls="launch-mobile-search"
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        >
          {searchOpen ? <X size={20} /> : <Search size={20} />}
        </button>
      </div>
      <div id="launch-mobile-search" className="lm-mobile-search" hidden={!searchOpen}>
        <label className="lm-search">
          <span className="sr-only">Search {brandName} menu</span>
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={"Search " + brandName + "…"}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") closeSearch();
            }}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear menu search"
              onClick={() => {
                onSearch("");
                inputRef.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          )}
        </label>
      </div>
      <p className="lm-mobile-result-count" role="status">
        {count} {count === 1 ? "item" : "items"}
        {search && " matching “" + search + "”"}
      </p>
    </div>
  );
}
