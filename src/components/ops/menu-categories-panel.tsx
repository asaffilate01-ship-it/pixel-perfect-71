import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { RefreshCcw } from "lucide-react";
import { OpsRequestError } from "@/lib/mealdeck-ops-browser";
import {
  listMenuCategories,
  updateMenuCategory,
  type OpsMenuCategory,
} from "@/lib/mealdeck-ops-menu-structure";
import {
  menuCategoryChanged,
  menuCategoryDraft,
  menuCategoryDraftChanged,
  validateMenuChoiceName,
  type MenuCategoryDraft,
} from "@/lib/mealdeck-menu-choice-editor";

type Props = {
  tenantId: string;
  canRead: boolean;
  canWrite: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: (category: OpsMenuCategory) => Promise<void> | void;
};

export function MenuCategoriesPanel({
  tenantId,
  canRead,
  canWrite,
  disabled = false,
  onBusyChange,
  onSaved,
}: Props) {
  const id = useId();
  const sequence = useRef(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<OpsMenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [editing, setEditing] = useState<OpsMenuCategory | null>(null);
  const [draft, setDraft] = useState<MenuCategoryDraft>({ name: "", active: false });
  const [conflict, setConflict] = useState(false);
  const [requested, setRequested] = useState<OpsMenuCategory | null>(null);
  const current = rows.find((row) => row.category_id === editing?.category_id);
  const dirty = !!editing && menuCategoryDraftChanged(draft, editing);
  const needsReview = conflict || (!!editing && !!current && menuCategoryChanged(editing, current));
  const locked = disabled || busy || loading;
  const cancelRequests = useCallback(() => {
    sequence.current++;
  }, []);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    const cycle = ++sequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await listMenuCategories(tenantId);
      if (cycle === sequence.current) setRows(next);
    } catch (error) {
      if (cycle === sequence.current)
        setLoadError(error instanceof Error ? error.message : "Categories could not be loaded.");
    } finally {
      if (cycle === sequence.current) setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    setRows([]);
    setEditing(null);
    setRequested(null);
    setSaveError("");
    setNotice("");
    setConflict(false);
    void load();
    return cancelRequests;
  }, [load, cancelRequests]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function choose(row: OpsMenuCategory, discard = false) {
    if (locked) return;
    if (!discard && editing?.category_id === row.category_id) {
      nameInput.current?.focus({ preventScroll: true });
      nameInput.current?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (!discard && editing?.category_id !== row.category_id && dirty) {
      setRequested(row);
      return;
    }
    setEditing(row);
    setDraft(menuCategoryDraft(row));
    setRequested(null);
    setSaveError("");
    setNotice("");
    setConflict(false);
    window.requestAnimationFrame(() => {
      nameInput.current?.focus({ preventScroll: true });
      nameInput.current?.scrollIntoView({ block: "nearest" });
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || !editing || !current || locked || loadError || needsReview || !dirty) return;
    const checked = validateMenuChoiceName(draft.name, "category");
    if (!checked.valid) {
      setSaveError(checked.message);
      nameInput.current?.focus();
      return;
    }
    const cycle = sequence.current;
    setBusy(true);
    onBusyChange?.(true);
    setSaveError("");
    setNotice("");
    try {
      const saved = await updateMenuCategory(tenantId, editing, {
        name: checked.name,
        active: draft.active,
      });
      if (cycle !== sequence.current) return;
      setRows((previous) =>
        previous.map((row) => (row.category_id === saved.category_id ? saved : row)),
      );
      setEditing(saved);
      setDraft(menuCategoryDraft(saved));
      setNotice(
        `${saved.category_name} saved. ${saved.active ? "Available products in this category can appear on the menu." : `${saved.affected_item_count} products in this category are hidden from new orders.`}`,
      );
      try {
        await onSaved?.(saved);
      } catch {
        setNotice(
          `${saved.category_name} was saved. Refresh the product list to see the latest category.`,
        );
      }
    } catch (error) {
      if (cycle !== sequence.current) return;
      if (error instanceof OpsRequestError && error.code === "conflict") {
        setConflict(true);
        setSaveError(
          "This category changed on another screen. Your edits are kept. Review the latest saved category before saving again.",
        );
      } else
        setSaveError(
          error instanceof Error ? error.message : "The category could not be saved. Please retry.",
        );
    } finally {
      if (cycle === sequence.current) setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function reviewLatest() {
    if (!editing || locked) return;
    const selected = editing.category_id;
    const cycle = ++sequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await listMenuCategories(tenantId);
      if (cycle !== sequence.current) return;
      setRows(next);
      const latest = next.find((row) => row.category_id === selected);
      if (!latest) {
        setEditing(null);
        setSaveError("This category is no longer available to edit.");
        return;
      }
      setEditing(latest);
      setConflict(false);
      setSaveError("");
      setNotice(
        `Latest saved: ${latest.category_name} · ${latest.active ? "Available" : "Hidden"}. Your edits are still in the form. Review them before saving.`,
      );
    } catch (error) {
      if (cycle === sequence.current)
        setLoadError(
          error instanceof Error ? error.message : "The latest category could not be loaded.",
        );
    } finally {
      if (cycle === sequence.current) setLoading(false);
    }
  }

  const brands = [...new Map(rows.map((row) => [row.brand_id, row.brand_name])).entries()];
  const filtered = rows.filter(
    (row) =>
      (!brand || row.brand_id === brand) &&
      `${row.brand_name} ${row.category_name}`
        .toLocaleLowerCase("en-GB")
        .includes(query.trim().toLocaleLowerCase("en-GB")),
  );

  return (
    <section className="md-ops-card md-menu-structure" aria-labelledby={id + "-heading"}>
      <div className="md-menu-structure-heading">
        <div>
          <p className="md-menu-eyebrow">Organise the menu</p>
          <h2 id={id + "-heading"}>Categories</h2>
          <p className="md-ops-muted">
            Rename a section or hide its products together. The change applies across this business.
          </p>
        </div>
        {canRead && (
          <button
            type="button"
            className="md-ops-button md-ops-secondary"
            disabled={locked}
            onClick={() => void load()}
          >
            <RefreshCcw className="size-4" aria-hidden="true" /> Reload categories
          </button>
        )}
      </div>
      {!canRead ? (
        <p className="md-ops-muted mt-4">
          A business-wide menu role is required to view categories.
        </p>
      ) : (
        <>
          {loading && (
            <p role="status" className="md-ops-muted mt-4">
              Loading categories…
            </p>
          )}
          {loadError && (
            <p role="alert" className="md-menu-error mt-4">
              {loadError}
            </p>
          )}
          <div className="md-menu-structure-grid">
            <div>
              <div className="md-menu-structure-filters">
                <label htmlFor={id + "-search"}>
                  Search categories
                  <input
                    id={id + "-search"}
                    className="md-ops-field"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Burgers, drinks, sides…"
                  />
                </label>
                <label htmlFor={id + "-brand"}>
                  Brand
                  <select
                    id={id + "-brand"}
                    className="md-ops-field"
                    value={brand}
                    onChange={(event) => setBrand(event.target.value)}
                  >
                    <option value="">All brands</option>
                    {brands.map(([value, name]) => (
                      <option key={value} value={value}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="md-ops-muted mt-3 text-xs">
                {filtered.length} of {rows.length} categories
              </p>
              <ul className="md-menu-structure-list" aria-label="Saved menu categories">
                {filtered.map((row) => (
                  <li
                    key={row.category_id}
                    className={editing?.category_id === row.category_id ? "is-selected" : undefined}
                  >
                    <div>
                      <p className="md-menu-eyebrow">{row.brand_name}</p>
                      <h3>{row.category_name}</h3>
                      <p className="md-ops-muted">
                        {row.affected_item_count}{" "}
                        {row.affected_item_count === 1 ? "product" : "products"} ·{" "}
                        {row.active ? "Available" : "Hidden"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      disabled={locked}
                      aria-label={`${canWrite ? "Edit" : "View"} ${row.category_name} category for ${row.brand_name}`}
                      aria-controls={id + "-editor"}
                      aria-current={editing?.category_id === row.category_id ? "true" : undefined}
                      onClick={() => choose(row)}
                    >
                      {canWrite ? "Edit" : "View"}
                    </button>
                  </li>
                ))}
              </ul>
              {!loading && !filtered.length && (
                <p className="md-ops-empty mt-3 p-4">
                  {rows.length
                    ? "No categories match. Try another name or brand."
                    : "No saved categories are available."}
                </p>
              )}
            </div>
            <div id={id + "-editor"} className="md-menu-structure-editor">
              {requested && (
                <div className="md-menu-review" role="alert">
                  <p>Your category edits haven’t been saved.</p>
                  <div className="md-menu-button-row">
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      onClick={() => setRequested(null)}
                    >
                      Keep editing
                    </button>
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      onClick={() => choose(requested, true)}
                    >
                      Discard and open {requested.category_name}
                    </button>
                  </div>
                </div>
              )}
              {!editing || !current ? (
                <p className="md-ops-muted">Choose a category to edit its name and availability.</p>
              ) : (
                <form onSubmit={(event) => void save(event)}>
                  <div className="md-menu-editor-top">
                    <p className="md-menu-eyebrow">{current.brand_name}</p>
                    {dirty && <span className="md-menu-unsaved">Unsaved edits</span>}
                  </div>
                  <h3>{current.category_name}</h3>
                  <p className="md-menu-scope-note">
                    This category contains {current.affected_item_count}{" "}
                    {current.affected_item_count === 1 ? "product" : "products"}.
                  </p>
                  <fieldset
                    disabled={!canWrite || locked || !!loadError}
                    className="md-menu-choice-fields"
                  >
                    <label htmlFor={id + "-name"}>
                      Category name
                      <input
                        ref={nameInput}
                        id={id + "-name"}
                        className="md-ops-field"
                        required
                        minLength={2}
                        maxLength={140}
                        value={draft.name}
                        onChange={(event) => {
                          setDraft({ ...draft, name: event.target.value });
                          setNotice("");
                        }}
                      />
                    </label>
                    <p className="md-menu-scope-note">Saved name: {editing.category_name}</p>
                    <label className="md-menu-active-check">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(event) => {
                          setDraft({ ...draft, active: event.target.checked });
                          setNotice("");
                        }}
                      />
                      <span>
                        Category available
                        <small>
                          Products still follow their own availability and kitchen settings.
                        </small>
                      </span>
                    </label>
                    {!draft.active && (
                      <p className="md-menu-review">
                        Saving this category as hidden removes its {current.affected_item_count}{" "}
                        products from new orders. Existing paid orders stay unchanged.
                      </p>
                    )}
                  </fieldset>
                  {needsReview && (
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary mt-3"
                      disabled={locked}
                      onClick={() => void reviewLatest()}
                    >
                      Review latest category
                    </button>
                  )}
                  {canWrite ? (
                    <div className="md-menu-save-row mt-4">
                      <button
                        type="submit"
                        className="md-ops-button md-ops-primary"
                        disabled={locked || !!loadError || needsReview || !dirty}
                      >
                        {busy ? "Saving category…" : "Save category"}
                      </button>
                      <button
                        type="button"
                        className="md-ops-button md-ops-secondary"
                        disabled={locked || !dirty}
                        onClick={() => {
                          setDraft(menuCategoryDraft(editing));
                          setRequested(null);
                          setSaveError("");
                        }}
                      >
                        Reset edits
                      </button>
                    </div>
                  ) : (
                    <p className="md-ops-muted mt-4">
                      Your role can view categories. A business-wide menu editor can change them.
                    </p>
                  )}
                </form>
              )}
              {saveError && (
                <p role="alert" className="md-menu-error mt-3">
                  {saveError}
                </p>
              )}
              {notice && (
                <p role="status" className="md-menu-success mt-3">
                  {notice}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
