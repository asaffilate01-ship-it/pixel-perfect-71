import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { RefreshCcw } from "lucide-react";
import { OpsRequestError } from "@/lib/mealdeck-ops-browser";
import { penceToPounds } from "@/lib/mealdeck-ops-math";
import {
  listModifierPrices,
  updateModifierOption,
  type OpsModifierPrice,
} from "@/lib/mealdeck-ops-modifier-prices";
import {
  menuOptionChanged,
  menuOptionDraftChanged,
  validateMenuOptionDraft,
} from "@/lib/mealdeck-menu-choice-editor";

type Props = {
  tenantId: string;
  canRead: boolean;
  canWrite: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function ModifierPricesPanel({
  tenantId,
  canRead,
  canWrite,
  disabled = false,
  onBusyChange,
}: Props) {
  const id = useId();
  const request = useRef(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const priceInput = useRef<HTMLInputElement>(null);
  const reviewFocusPending = useRef(false);
  const [rows, setRows] = useState<OpsModifierPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [editing, setEditing] = useState<OpsModifierPrice | null>(null);
  const [amount, setAmount] = useState("");
  const [optionName, setOptionName] = useState("");
  const [active, setActive] = useState(false);
  const [requested, setRequested] = useState<OpsModifierPrice | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const cancelRequests = useCallback(() => {
    request.current++;
  }, []);

  const load = useCallback(async () => {
    if (!canRead) return;
    const cycle = ++request.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await listModifierPrices(tenantId);
      if (cycle === request.current) setRows(next);
    } catch (reason) {
      if (cycle === request.current) {
        setRows([]);
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Option prices could not be loaded. Please retry.",
        );
      }
    } finally {
      if (cycle === request.current) setLoading(false);
    }
  }, [tenantId, canRead]);

  useEffect(() => {
    setRows([]);
    setEditing(null);
    setAmount("");
    setOptionName("");
    setActive(false);
    setRequested(null);
    setSaveError("");
    setConflict(false);
    setNotice("");
    setBusy(false);
    reviewFocusPending.current = false;
    void load();
    return cancelRequests;
  }, [load, cancelRequests]);

  useEffect(() => {
    if (!loading && reviewFocusPending.current) {
      reviewFocusPending.current = false;
      priceInput.current?.focus();
    }
  }, [loading]);

  const current = rows.find((row) => row.option_id === editing?.option_id);
  const groups = [...new Map(rows.map((row) => [row.group_id, row.group_name])).entries()];
  const filtered = rows.filter(
    (row) =>
      (!group || row.group_id === group) &&
      `${row.group_name} ${row.option_name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const changedElsewhere = !!current && !!editing && menuOptionChanged(editing, current);
  const needsReview = conflict || changedElsewhere;
  const draft = { name: optionName, price: amount, active };
  const dirty = !!editing && menuOptionDraftChanged(draft, editing);
  const locked = busy || loading || disabled;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function choose(row: OpsModifierPrice, discard = false) {
    if (locked) return;
    if (editing?.option_id !== row.option_id || discard) {
      if (dirty && !discard) {
        setRequested(row);
        return;
      }
      setEditing(row);
      setAmount((row.price_delta_pence / 100).toFixed(2));
      setOptionName(row.option_name);
      setActive(row.active);
      setRequested(null);
      setSaveError("");
      setConflict(false);
      setNotice("");
    }
    window.requestAnimationFrame(() => {
      nameInput.current?.focus({ preventScroll: true });
      nameInput.current?.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || !editing || !current || locked || loadError || needsReview || !dirty) return;
    const checked = validateMenuOptionDraft(draft);
    if (!checked.valid) {
      setSaveError(checked.message);
      return;
    }
    const cycle = request.current;
    setBusy(true);
    onBusyChange?.(true);
    setSaveError("");
    setNotice("");
    try {
      const saved = await updateModifierOption(tenantId, editing, {
        name: checked.name,
        pricePence: checked.pricePence,
        active: checked.active,
      });
      if (cycle !== request.current) return;
      setRows((previous) =>
        previous.map((row) => (row.option_id === saved.option_id ? saved : row)),
      );
      setEditing(saved);
      setAmount((saved.price_delta_pence / 100).toFixed(2));
      setOptionName(saved.option_name);
      setActive(saved.active);
      setNotice(
        `${saved.option_name} saved at ${penceToPounds(saved.price_delta_pence)} · ${saved.active ? "Available" : "Unavailable"}. ${saved.affected_item_count === 0 ? "Changes apply wherever this choice is offered, including shared meal upgrades." : `Directly linked to ${saved.affected_item_count} menu ${saved.affected_item_count === 1 ? "item" : "items"}.`}`,
      );
    } catch (reason) {
      if (cycle !== request.current) return;
      if (reason instanceof OpsRequestError && reason.code === "conflict") {
        setConflict(true);
        setSaveError(
          "This add-on changed on another screen. Your edits have been kept. Review its latest saved name, price and availability before saving again.",
        );
      } else
        setSaveError(
          reason instanceof Error ? reason.message : "The add-on could not be saved. Please retry.",
        );
    } finally {
      if (cycle === request.current) setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function reviewLatest() {
    if (!editing || locked) return;
    const selected = editing.option_id;
    const cycle = ++request.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await listModifierPrices(tenantId);
      if (cycle !== request.current) return;
      setRows(next);
      const latest = next.find((row) => row.option_id === selected);
      if (!latest) {
        setEditing(null);
        setSaveError("This option is no longer available. Choose another option.");
        return;
      }
      setEditing(latest);
      setConflict(false);
      setSaveError("");
      setNotice(
        `Latest saved: ${latest.option_name} · ${penceToPounds(latest.price_delta_pence)} · ${latest.active ? "Available" : "Unavailable"}. Your edits are still in the form. Review them before saving.`,
      );
      reviewFocusPending.current = true;
    } catch (reason) {
      if (cycle === request.current)
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "The latest add-on could not be loaded. Please retry.",
        );
    } finally {
      if (cycle === request.current) setLoading(false);
    }
  }

  return (
    <section className="md-ops-card p-5 xl:col-span-2" aria-labelledby={id + "-heading"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id={id + "-heading"} className="text-xl font-black">
            Add-ons &amp; upgrades
          </h2>
          <p className="mt-1 text-sm md-ops-muted">
            Edit each choice’s name, price and availability. Shared add-ons change for every menu
            item that uses their group.
          </p>
          <p className="mt-2 text-xs md-ops-muted">
            Saved changes appear in the live menu and are checked again before a new order is paid.
          </p>
        </div>
        {canRead && (
          <button
            type="button"
            className="md-ops-button md-ops-secondary"
            disabled={locked}
            onClick={() => void load()}
          >
            <RefreshCcw className="size-4" aria-hidden="true" /> Reload add-ons
          </button>
        )}
      </div>
      {!canRead ? (
        <p className="mt-4 text-sm md-ops-muted">
          A business-wide menu role is required to view shared add-ons.
        </p>
      ) : (
        <>
          {loading && (
            <p role="status" className="mt-4 text-sm md-ops-muted">
              Loading add-ons…
            </p>
          )}
          {loadError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <p>{loadError}</p>
              <button
                type="button"
                className="md-ops-button md-ops-secondary mt-3"
                disabled={locked}
                onClick={() => void load()}
              >
                Retry add-ons
              </button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <p role="status" className="md-ops-empty mt-4 p-5 text-sm">
              No add-on or upgrade options have been added to this business yet.
            </p>
          )}
          {rows.length > 0 && (
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <div className="min-w-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-semibold" htmlFor={id + "-search"}>
                    Search options
                    <input
                      id={id + "-search"}
                      type="search"
                      className="md-ops-field mt-2"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Fries, mocktail, cheese…"
                    />
                  </label>
                  <label className="block min-w-0 text-sm font-semibold" htmlFor={id + "-group"}>
                    Option group
                    <select
                      id={id + "-group"}
                      className="md-ops-field mt-2"
                      value={group}
                      onChange={(e) => setGroup(e.target.value)}
                    >
                      <option value="">All groups</option>
                      {groups.map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-3 text-xs md-ops-muted">
                  {filtered.length} of {rows.length} options
                </p>
                <ul
                  className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1"
                  aria-label="Saved add-ons and upgrades"
                >
                  {filtered.map((row) => (
                    <li
                      key={row.option_id}
                      className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${editing?.option_id === row.option_id ? "md-ops-selection" : "md-ops-border"}`}
                    >
                      <div className="min-w-0 break-words">
                        <p className="text-xs font-bold md-ops-accent">{row.group_name}</p>
                        <p className="mt-1 font-bold">{row.option_name}</p>
                        <p className="mt-1 text-sm md-ops-muted">
                          {penceToPounds(row.price_delta_pence)} ·{" "}
                          {row.active ? "Available" : "Unavailable"}
                        </p>
                        <p className="text-xs md-ops-muted">
                          {row.affected_item_count === 0
                            ? "Applies wherever offered, including shared meal upgrades"
                            : `Directly linked to ${row.affected_item_count} menu ${row.affected_item_count === 1 ? "item" : "items"}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="md-ops-button md-ops-secondary shrink-0"
                        disabled={locked}
                        aria-label={`${canWrite ? "Edit" : "View"} ${row.option_name} in ${row.group_name}`}
                        aria-controls={id + "-editor"}
                        aria-current={editing?.option_id === row.option_id ? "true" : undefined}
                        onClick={() => choose(row)}
                      >
                        {canWrite ? "Edit" : "View"}
                      </button>
                    </li>
                  ))}
                </ul>
                {filtered.length === 0 && (
                  <p className="md-ops-empty mt-2 p-4 text-sm">
                    No options match your search. Try another name or group.
                  </p>
                )}
              </div>
              <div id={id + "-editor"} className="min-w-0 rounded-xl border md-ops-border p-4">
                {requested && (
                  <div className="md-menu-review" role="alert">
                    <p>Your add-on edits haven’t been saved.</p>
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
                        Discard and open {requested.option_name}
                      </button>
                    </div>
                  </div>
                )}
                {!current || !editing ? (
                  <p className="text-sm md-ops-muted">
                    Choose an add-on to edit its name, price and availability.
                  </p>
                ) : (
                  <form onSubmit={(event) => void save(event)}>
                    <div className="md-menu-editor-top">
                      <p className="text-xs font-bold md-ops-accent">{current.group_name}</p>
                      {dirty && <span className="md-menu-unsaved">Unsaved edits</span>}
                    </div>
                    <h3 className="mt-1 break-words text-lg font-black">{current.option_name}</h3>
                    <p className="mt-2 text-sm md-ops-muted">
                      {current.affected_item_count === 0
                        ? "Changes apply wherever this choice is offered, including shared meal upgrades."
                        : `Directly linked to ${current.affected_item_count} menu ${current.affected_item_count === 1 ? "item" : "items"}. These changes apply wherever this add-on is offered.`}
                    </p>
                    <p className="mt-2 text-xs md-ops-muted">
                      Saved availability: {editing.active ? "Available" : "Unavailable"}.
                    </p>
                    <label className="mt-4 block text-sm font-semibold" htmlFor={id + "-name"}>
                      Add-on name
                    </label>
                    <input
                      ref={nameInput}
                      id={id + "-name"}
                      className="md-ops-field mt-2"
                      required
                      maxLength={140}
                      value={optionName}
                      disabled={!canWrite || locked || !!loadError}
                      onChange={(event) => {
                        setOptionName(event.target.value);
                        setNotice("");
                      }}
                    />
                    <p className="mt-2 text-xs md-ops-muted">Saved name: {editing.option_name}</p>
                    <label className="mt-4 block text-sm font-semibold" htmlFor={id + "-price"}>
                      Option price (£)
                    </label>
                    <input
                      ref={priceInput}
                      id={id + "-price"}
                      className="md-ops-field mt-2"
                      inputMode="decimal"
                      value={amount}
                      aria-describedby={id + "-price-help"}
                      disabled={!canWrite || locked || !!loadError}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setNotice("");
                      }}
                    />
                    <p id={id + "-price-help"} className="mt-2 text-xs md-ops-muted">
                      Saved price: {penceToPounds(editing.price_delta_pence)}. Enter 0.00 for an
                      included choice.
                    </p>
                    <label className="md-menu-active-check md-menu-option-availability mt-4">
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={!canWrite || locked || !!loadError}
                        onChange={(event) => {
                          setActive(event.target.checked);
                          setNotice("");
                        }}
                      />
                      <span>
                        Add-on available
                        <small>Customers can choose this add-on on eligible products.</small>
                      </span>
                    </label>
                    {!active && (
                      <p className="md-menu-review">
                        Customers cannot select this add-on after saving. A product that needs this
                        as its only required choice may also become unavailable.
                      </p>
                    )}
                    {needsReview && (
                      <button
                        type="button"
                        className="md-ops-button md-ops-secondary mt-3"
                        disabled={locked}
                        onClick={() => void reviewLatest()}
                      >
                        Review latest add-on
                      </button>
                    )}
                    {canWrite ? (
                      <button
                        type="submit"
                        className="md-ops-button md-ops-primary mt-4 w-full"
                        disabled={locked || !!loadError || needsReview || !dirty}
                      >
                        {busy ? "Saving add-on…" : "Save add-on"}
                      </button>
                    ) : (
                      <p className="mt-4 text-sm md-ops-muted">
                        Your role can view these add-ons. A business-wide menu editor can change
                        them.
                      </p>
                    )}
                  </form>
                )}
                {saveError && (
                  <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                    {saveError}
                  </p>
                )}
                {notice && (
                  <p
                    role="status"
                    className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                  >
                    {notice}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
