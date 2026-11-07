import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FilePenLine,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { opsRpc } from "@/lib/mealdeck-ops-browser";
import type { OpsPermission } from "@/lib/mealdeck-ops-access";
import type { OpsMenuItem, OpsTaxonomy } from "@/lib/mealdeck-ops-types";
import { penceToPounds } from "@/lib/mealdeck-ops-math";
import {
  executeMenuAvailabilityChanges,
  filterMenuItems,
  menuBrandChoices,
  menuBulkTargets,
  menuCategoryChoices,
  menuDraftHasChanges,
  menuMasterChanged,
  menuProductDraft,
  menuVisibility,
  menuVisibilityCounts,
  parseOpsMenuItems,
  validateMenuProductDraft,
  UNASSIGNED_MENU_BRAND,
  type MenuBulkAction,
  type MenuFilters,
  type MenuProductDraft,
  type MenuVisibilityFilter,
} from "@/lib/mealdeck-menu-manager";
import { MenuKitchenRoute } from "./menu-kitchen-route";
import { ModifierPricesPanel } from "./modifier-prices-panel";
import { MenuCategoriesPanel } from "./menu-categories-panel";
import type { OpsMenuCategory } from "@/lib/mealdeck-ops-menu-structure";
import "./menu-manager.css";

type Props = {
  tenantId: string;
  locationId: string;
  can: (permission: OpsPermission) => boolean;
  canGlobal: (permission: OpsPermission) => boolean;
  reload: () => Promise<void>;
  notice: (message: string) => void;
  menu: OpsMenuItem[];
  taxonomy: OpsTaxonomy[];
};

const blankDraft = (): MenuProductDraft => ({
  name: "",
  description: "",
  price: "",
  active: false,
});
const blankFilters = (): MenuFilters => ({ query: "", brand: "", category: "", visibility: "all" });
const statusNames = { all: "All products", shown: "Shown", hidden: "Hidden", inactive: "Inactive" };
const pageSize = 40;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : "The change could not be saved. Please retry.";

function initialMenu(menu: unknown) {
  try {
    return { rows: parseOpsMenuItems(menu), error: "" };
  } catch (reason) {
    return { rows: [] as OpsMenuItem[], error: message(reason) };
  }
}

/** Each kitchen gets a fresh editor; late responses cannot update another scope. */
export function OpsMenuPanel(props: Props) {
  return <MenuManager key={props.tenantId + ":" + props.locationId} {...props} />;
}

function MenuManager({
  menu,
  taxonomy: initialTaxonomy,
  tenantId,
  locationId,
  can,
  canGlobal,
  notice,
}: Props) {
  const id = useId();
  const [taxonomy, setTaxonomy] = useState(initialTaxonomy);
  const [initial] = useState(() => initialMenu(menu));
  const [rows, setRows] = useState(initial.rows);
  const [loadError, setLoadError] = useState(initial.error);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [feedbackArea, setFeedbackArea] = useState<"menu" | "editor" | "create">("menu");
  const [pending, setPending] = useState("");
  const [routingBusy, setRoutingBusy] = useState(false);
  const [structureBusy, setStructureBusy] = useState(false);
  const [filters, setFilters] = useState<MenuFilters>(blankFilters);
  const [limit, setLimit] = useState(pageSize);
  const [selected, setSelected] = useState<OpsMenuItem | null>(null);
  const [draft, setDraft] = useState<MenuProductDraft>(blankDraft);
  const [requestedItem, setRequestedItem] = useState<string | null>(null);
  const [focusEditor, setFocusEditor] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<MenuProductDraft>(blankDraft);
  const [categoryId, setCategoryId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<MenuBulkAction | null>(null);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [confirmDeactivation, setConfirmDeactivation] = useState(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const createHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLParagraphElement>(null);
  const bulkReview = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const actionLock = useRef(false);
  const globalWrite = canGlobal("menu.write");
  const localWrite = can("menu.write");
  const busy = !!pending || routingBusy || structureBusy;
  const writable = !busy && !loadError;
  // A failed refresh blocks writes, not the local draft. Keep the form usable
  // while staff recover their connection; save still requires a verified menu.
  const draftEditable = globalWrite && !busy;
  const current = rows.find((item) => item.item_id === selected?.item_id);
  const dirty = !!selected && menuDraftHasChanges(draft, selected);
  const changedElsewhere = !!current && !!selected && menuMasterChanged(selected, current);
  const newDirty = !!(newDraft.name || newDraft.description || newDraft.price);
  const brands = menuBrandChoices(rows);
  const categories = menuCategoryChoices(rows, filters.brand);
  const matchingScope = filterMenuItems(rows, { ...filters, visibility: "all" });
  const counts = menuVisibilityCounts(matchingScope);
  const filtered = filterMenuItems(rows, filters);
  const shown = filtered.slice(0, limit);
  const selectedRows = rows.filter((item) => selectedIds.has(item.item_id));
  const bulkTargets = bulkAction ? menuBulkTargets(rows, selectedIds, bulkAction) : [];
  const allShownSelected = shown.length > 0 && shown.every((item) => selectedIds.has(item.item_id));
  const hasFilters = !!(
    filters.query ||
    filters.brand ||
    filters.category ||
    filters.visibility !== "all"
  );

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!focusEditor || !editorHeading.current) return;
    editorHeading.current.focus({ preventScroll: true });
    // On a single-column screen, "nearest" leaves only the heading at the
    // bottom edge, with every editable field still below the viewport.
    editorHeading.current.scrollIntoView({ block: "start", behavior: "auto" });
  }, [focusEditor]);
  useEffect(() => {
    if (bulkAction) bulkReview.current?.focus({ preventScroll: true });
  }, [bulkAction]);
  useEffect(() => {
    if (!dirty && !newDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, newDirty]);

  function setFilter<K extends keyof MenuFilters>(key: K, value: MenuFilters[K]) {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "brand" ? { category: "" } : {}),
    }));
    setLimit(pageSize);
  }

  function selectProduct(item: OpsMenuItem) {
    setSelected(item);
    setDraft(menuProductDraft(item));
    setRequestedItem(null);
    setConfirmDeactivation(false);
    setActionError("");
    setFocusEditor((value) => value + 1);
  }

  function choose(item: OpsMenuItem) {
    if (busy) return;
    setFeedbackArea("editor");
    if (selected?.item_id === item.item_id) {
      setFocusEditor((value) => value + 1);
      return;
    }
    if (dirty) {
      setRequestedItem(item.item_id);
      setFocusEditor((value) => value + 1);
    } else selectProduct(item);
  }

  async function readMenu() {
    return parseOpsMenuItems(
      await opsRpc<unknown>("mealdeck_ops_menu_list", {
        p_tenant: tenantId,
        p_location: locationId,
      }),
    );
  }

  async function categorySaved(saved: OpsMenuCategory) {
    const previous = taxonomy.find((category) => category.category_id === saved.category_id);
    setTaxonomy((categories) =>
      [
        ...categories.filter((category) => category.category_id !== saved.category_id),
        ...(saved.active
          ? [
              {
                category_id: saved.category_id,
                category_name: saved.category_name,
                brand_id: saved.brand_id,
                brand_name: saved.brand_name,
              },
            ]
          : []),
      ].sort((a, b) =>
        `${a.brand_name} ${a.category_name}`.localeCompare(
          `${b.brand_name} ${b.category_name}`,
          "en-GB",
        ),
      ),
    );
    if (previous && previous.category_name !== saved.category_name)
      setFilters((currentFilters) =>
        currentFilters.category === previous.category_name
          ? { ...currentFilters, category: saved.category_name }
          : currentFilters,
      );
    const cycle = generation.current;
    try {
      const next = await readMenu();
      if (cycle === generation.current) {
        setRows(next);
        setLoadError("");
      }
    } catch {
      if (cycle === generation.current)
        setLoadError(
          "The category was saved, but the product list could not be refreshed. Reload the menu to continue.",
        );
    }
  }

  async function refresh(area: "menu" | "editor" | "create" = "menu") {
    if (actionLock.current || routingBusy) return;
    setFeedbackArea(area);
    actionLock.current = true;
    const cycle = generation.current;
    setPending("refresh");
    setActionError("");
    try {
      const next = await readMenu();
      if (cycle !== generation.current) return;
      setRows(next);
      setLoadError("");
    } catch (reason) {
      if (cycle === generation.current) setLoadError(message(reason));
    } finally {
      if (cycle === generation.current) {
        actionLock.current = false;
        setPending("");
      }
    }
  }

  // Refresh locally after a mutation so filters, position and unsaved edits survive.
  // A confirmed write followed by a failed read is never presented as a failed write.
  async function commit(
    action: string,
    work: () => Promise<string | void>,
    savedMessage: string,
    onConfirmed?: () => void,
  ) {
    if (actionLock.current || routingBusy || loadError) return;
    actionLock.current = true;
    const cycle = generation.current;
    let confirmed = false;
    setFeedbackArea(action === "save" ? "editor" : action === "create" ? "create" : "menu");
    setPending(action);
    setActionError("");
    setSuccess("");
    try {
      const newItemId = await work();
      if (cycle !== generation.current) return;
      confirmed = true;
      onConfirmed?.();
      setSuccess(savedMessage);
      const next = await readMenu();
      if (cycle !== generation.current) return;
      setRows(next);
      setLoadError("");
      if (newItemId && !dirty) {
        const added = next.find((item) => item.item_id === newItemId);
        if (added) {
          setFeedbackArea("editor");
          setFilters({
            query: "",
            brand: added.brand_id ?? UNASSIGNED_MENU_BRAND,
            category: "",
            visibility: "inactive",
          });
          setLimit(pageSize);
          selectProduct(added);
        }
      }
      notice(savedMessage);
    } catch (reason) {
      if (cycle !== generation.current) return;
      if (confirmed) {
        setLoadError(
          "Your change was saved, but the updated menu could not be loaded. Reload the menu to continue.",
        );
        notice(savedMessage);
      } else if (action === "create") {
        setLoadError(
          "The new product could not be confirmed. Reload the menu and check whether it was added before trying again.",
        );
        setActionError(message(reason));
      } else setActionError(message(reason));
    } finally {
      if (cycle === generation.current) {
        actionLock.current = false;
        setPending("");
      }
    }
  }

  async function toggleVisibility(item: OpsMenuItem) {
    if (!localWrite || !writable || !item.active) return;
    await commit(
      `visibility:${item.item_id}`,
      async () => {
        const saved = await opsRpc<unknown>("mealdeck_ops_set_menu_visibility", {
          p_tenant: tenantId,
          p_location: locationId,
          p_item: item.item_id,
          p_visible: !item.visible,
        });
        if (saved !== true)
          throw new Error(
            "The menu visibility change was not confirmed. Reload before trying again.",
          );
      },
      item.visible
        ? `${item.item_name} is hidden from this kitchen's MealDeck menu.`
        : `${item.item_name} is shown in this kitchen's MealDeck menu settings.`,
    );
  }

  async function saveProduct(deactivationConfirmed = false) {
    if (!globalWrite || !selected || !current || !writable || changedElsewhere || !dirty) return;
    setFeedbackArea("editor");
    const checked = validateMenuProductDraft(draft);
    if (!checked.valid) {
      setActionError(checked.message);
      return;
    }
    if (current.active && !checked.active && !deactivationConfirmed) {
      setConfirmDeactivation(true);
      return;
    }
    const baseline = selected;
    const cycle = generation.current;
    await commit(
      "save",
      async () => {
        const next = await readMenu();
        if (generation.current !== cycle)
          throw new Error("The selected kitchen changed. Reload its menu.");
        const latest = next.find((item) => item.item_id === baseline.item_id);
        if (!latest) {
          setRows(next);
          throw new Error("This product is no longer available to edit.");
        }
        if (menuMasterChanged(baseline, latest)) {
          setRows(next);
          throw new Error(
            "This product changed on another screen. Review its latest saved values before editing again.",
          );
        }
        const saved = await opsRpc<unknown>("mealdeck_ops_update_menu_item", {
          p_tenant: tenantId,
          p_item: baseline.item_id,
          p_name: checked.name,
          p_description: checked.description,
          p_price_pence: checked.pricePence,
          p_active: checked.active,
        });
        if (saved !== true)
          throw new Error("The product change was not confirmed. Reload before trying again.");
      },
      `${checked.name} saved.`,
      () => {
        const saved = {
          ...baseline,
          item_name: checked.name,
          description: checked.description,
          price_pence: checked.pricePence,
          active: checked.active,
        };
        setSelected(saved);
        setDraft(menuProductDraft(saved));
        setConfirmDeactivation(false);
      },
    );
  }

  function toggleSelected(itemId: string) {
    if (busy) return;
    setBulkAction(null);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function applyBulk() {
    if (!bulkAction || !writable || actionLock.current) return;
    if (bulkAction === "deactivate" ? !globalWrite : !localWrite) return;
    setFeedbackArea("menu");
    const action = bulkAction;
    const requested = new Set(selectedIds);
    const cycle = generation.current;
    actionLock.current = true;
    setPending("bulk");
    setActionError("");
    setSuccess("");
    setBulkProgress({ done: 0, total: bulkTargets.length });
    const { completed, skipped, failure, cancelled } = await executeMenuAvailabilityChanges({
      action,
      selectedIds: requested,
      isCurrent: () => cycle === generation.current,
      onProgress: (done, total) => setBulkProgress({ done, total }),
      transport: {
        read: readMenu,
        setVisibility: (itemId, visible) =>
          opsRpc<unknown>("mealdeck_ops_set_menu_visibility", {
            p_tenant: tenantId,
            p_location: locationId,
            p_item: itemId,
            p_visible: visible,
          }),
        updateProduct: (item) =>
          opsRpc<unknown>("mealdeck_ops_update_menu_item", {
            p_tenant: tenantId,
            p_item: item.item_id,
            p_name: item.item_name,
            p_description: item.description ?? "",
            p_price_pence: item.price_pence,
            p_active: false,
          }),
      },
    });
    if (cancelled) return;
    if (cycle !== generation.current) return;
    try {
      const next = await readMenu();
      if (cycle !== generation.current) return;
      setRows(next);
      setLoadError("");
    } catch {
      if (cycle !== generation.current) return;
      setLoadError(
        "The updated menu could not be loaded. Reload it to verify these changes before continuing.",
      );
    } finally {
      if (cycle === generation.current) {
        actionLock.current = false;
        setPending("");
        setBulkAction(null);
        setSelectedIds(
          (previous) =>
            new Set(
              [...previous].filter((itemId) => !completed.has(itemId) && !skipped.has(itemId)),
            ),
        );
        const savedMessage = completed.size
          ? `${completed.size} ${completed.size === 1 ? "product" : "products"} ${action === "deactivate" ? "deactivated across MealDeck menus" : action === "hide" ? "hidden from this kitchen" : "restored to this kitchen's menu settings"}.`
          : failure
            ? ""
            : "No changes were needed for the selected products.";
        if (savedMessage) {
          setSuccess(savedMessage);
          notice(savedMessage);
        }
        if (failure)
          setActionError(
            `${completed.size} changes confirmed. Processing stopped: ${failure} Review the refreshed menu before retrying the remaining selection.`,
          );
      }
    }
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!globalWrite || !writable) return;
    setFeedbackArea("create");
    const category = taxonomy.find((entry) => entry.category_id === categoryId);
    if (!category) {
      setActionError("Choose an approved brand and category for the new product.");
      return;
    }
    const checked = validateMenuProductDraft(newDraft);
    if (!checked.valid) {
      setActionError(checked.message);
      return;
    }
    await commit(
      "create",
      async () => {
        const created = await opsRpc<unknown>("mealdeck_ops_create_menu_item", {
          p_tenant: tenantId,
          p_brand: category.brand_id,
          p_category: category.category_id,
          p_name: checked.name,
          p_description: checked.description,
          p_price_pence: checked.pricePence,
        });
        if (typeof created !== "string" || !uuid.test(created))
          throw new Error("The new product could not be confirmed.");
        return created;
      },
      `${checked.name} saved as an inactive draft. Assign its kitchen and review the product before activating.`,
      () => {
        setNewDraft(blankDraft());
        setCreating(false);
      },
    );
  }

  function openCreate() {
    setCreating(true);
    setFeedbackArea("create");
    window.requestAnimationFrame(() => {
      createHeading.current?.focus({ preventScroll: true });
      createHeading.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }

  const feedback = (
    <>
      {success && (
        <p role="status" className="md-menu-success">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          {success}
        </p>
      )}
      {loadError && (
        <div role="alert" className="md-menu-error">
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          <div>
            <p>{loadError}</p>
            {feedbackArea === "editor" && current && globalWrite && (
              <p className="mt-2">
                You can keep editing your draft. Reload the saved menu before saving changes.
              </p>
            )}
            <button
              type="button"
              className="md-ops-button md-ops-secondary mt-3"
              disabled={busy}
              onClick={() => void refresh(feedbackArea)}
            >
              {pending === "refresh" ? "Reloading…" : "Reload saved menu"}
            </button>
          </div>
        </div>
      )}
      {actionError && (
        <p role="alert" className="md-menu-error">
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      )}
    </>
  );

  return (
    <div className="md-menu-manager">
      <section className="md-ops-card md-menu-heading" aria-labelledby={id + "-heading"}>
        <div>
          <p className="md-menu-eyebrow">Kitchen menu</p>
          <h2 id={id + "-heading"}>Brand menus</h2>
          <p className="md-ops-muted">
            Manage products, categories and add-ons. Keep names, prices and availability current.
          </p>
        </div>
        <div className="md-menu-heading-actions">
          <a href={"#" + id + "-categories"} className="md-ops-button md-ops-secondary">
            Categories
          </a>
          <a href={"#" + id + "-modifiers"} className="md-ops-button md-ops-secondary">
            Add-ons
          </a>
          <button
            type="button"
            className="md-ops-button md-ops-secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCcw
              className={pending === "refresh" ? "size-4 motion-safe:animate-spin" : "size-4"}
              aria-hidden="true"
            />
            {pending === "refresh" ? "Refreshing…" : "Refresh menu"}
          </button>
          {globalWrite && (
            <button
              type="button"
              className="md-ops-button md-ops-primary"
              disabled={busy}
              onClick={openCreate}
            >
              <Plus className="size-4" aria-hidden="true" /> Add product
            </button>
          )}
        </div>
      </section>

      {!(feedbackArea === "editor" && current) &&
        !(feedbackArea === "create" && creating) &&
        feedback}

      <div className="md-menu-layout">
        <section
          className="md-ops-card md-menu-browser"
          aria-label="Find menu products"
          aria-busy={pending === "refresh"}
        >
          <div className="md-menu-search">
            <label htmlFor={id + "-search"}>Search products</label>
            <div>
              <Search className="size-4" aria-hidden="true" />
              <input
                ref={searchInput}
                id={id + "-search"}
                type="search"
                value={filters.query}
                onChange={(event) => setFilter("query", event.target.value)}
                className="md-ops-field"
                placeholder="Dish, brand or ingredient in the description…"
              />
            </div>
          </div>
          <div className="md-menu-selects">
            <label htmlFor={id + "-brand"}>
              Brand
              <select
                id={id + "-brand"}
                className="md-ops-field"
                value={filters.brand}
                onChange={(event) => setFilter("brand", event.target.value)}
              >
                <option value="">All brands ({rows.length})</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name} ({brand.count})
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={id + "-category"}>
              Category
              <select
                id={id + "-category"}
                className="md-ops-field"
                value={filters.category}
                onChange={(event) => setFilter("category", event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="md-menu-filter-row" role="group" aria-label="Filter by saved menu status">
            {(Object.keys(statusNames) as MenuVisibilityFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                className="md-menu-status-filter"
                aria-pressed={filters.visibility === status}
                onClick={() => setFilter("visibility", status)}
              >
                {statusNames[status]} <span>{counts[status]}</span>
              </button>
            ))}
          </div>
          <div className="md-menu-result-line">
            <p ref={resultHeading} tabIndex={-1} role="status">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
              {hasFilters ? ` of ${rows.length}` : ""}
            </p>
            {hasFilters && (
              <button
                type="button"
                className="md-menu-reset"
                onClick={() => {
                  setFilters(blankFilters());
                  setLimit(pageSize);
                  searchInput.current?.focus();
                }}
              >
                <X className="size-4" aria-hidden="true" /> Clear filters
              </button>
            )}
          </div>
          {(localWrite || globalWrite) && shown.length > 0 && (
            <label className="md-menu-select-page">
              <input
                type="checkbox"
                checked={allShownSelected}
                disabled={busy}
                onChange={() => {
                  setBulkAction(null);
                  setSelectedIds((previous) => {
                    const next = new Set(previous);
                    for (const item of shown) {
                      if (allShownSelected) next.delete(item.item_id);
                      else next.add(item.item_id);
                    }
                    return next;
                  });
                }}
              />{" "}
              Select these {shown.length} products
            </label>
          )}
          {selectedRows.length > 0 && (
            <div className="md-menu-bulk">
              <div className="md-menu-bulk-top">
                <strong>{selectedRows.length} selected</strong>
                <button
                  type="button"
                  className="md-menu-reset"
                  disabled={busy}
                  onClick={() => {
                    setSelectedIds(new Set());
                    setBulkAction(null);
                  }}
                >
                  Clear selection
                </button>
              </div>
              <p>
                Selection stays when filters change. Choose where to apply availability changes.
              </p>
              <div className="md-menu-button-row">
                {localWrite && (
                  <>
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      disabled={!writable}
                      onClick={() => setBulkAction("hide")}
                    >
                      Hide from this kitchen
                    </button>
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      disabled={!writable}
                      onClick={() => setBulkAction("restore")}
                    >
                      Restore in this kitchen
                    </button>
                  </>
                )}
                {globalWrite && (
                  <button
                    type="button"
                    className="md-ops-button md-ops-secondary"
                    disabled={!writable}
                    onClick={() => setBulkAction("deactivate")}
                  >
                    Deactivate across all menus
                  </button>
                )}
              </div>
              {bulkAction && (
                <div
                  ref={bulkReview}
                  tabIndex={-1}
                  className="md-menu-review"
                  role="region"
                  aria-label="Confirm menu availability changes"
                >
                  <h3>
                    {bulkAction === "deactivate"
                      ? "Deactivate across every MealDeck kitchen?"
                      : bulkAction === "hide"
                        ? "Hide from this kitchen’s menu?"
                        : "Restore in this kitchen’s menu?"}
                  </h3>
                  <p>
                    {bulkTargets.length}{" "}
                    {bulkTargets.length === 1 ? "product needs" : "products need"} this change.{" "}
                    {bulkAction === "deactivate"
                      ? "They will be inactive across MealDeck menus until reviewed and reactivated."
                      : "This changes the current kitchen’s MealDeck visibility only. Inactive products stay inactive."}
                  </p>
                  {bulkTargets.length > 0 && (
                    <details>
                      <summary>Review the {bulkTargets.length} products</summary>
                      <ul>
                        {bulkTargets.map((item) => (
                          <li key={item.item_id}>
                            {item.brand_name ?? "Unassigned brand"} · {item.item_name}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="md-menu-button-row">
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      disabled={busy}
                      onClick={() => setBulkAction(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="md-ops-button md-ops-primary"
                      disabled={!writable || bulkTargets.length === 0}
                      onClick={() => void applyBulk()}
                    >
                      {bulkAction === "deactivate"
                        ? "Confirm deactivation"
                        : bulkAction === "hide"
                          ? "Confirm hide"
                          : "Confirm restore"}
                    </button>
                  </div>
                </div>
              )}
              {pending === "bulk" && (
                <p role="status" className="md-menu-bulk-progress">
                  Saving availability · {bulkProgress.done} of {bulkProgress.total} changes
                  confirmed…
                </p>
              )}
            </div>
          )}
          <ul className="md-menu-product-list" aria-label="Products in this kitchen">
            {shown.map((item) => {
              const status = menuVisibility(item);
              return (
                <li
                  key={item.item_id}
                  className={
                    selected?.item_id === item.item_id
                      ? "md-menu-product is-selected"
                      : "md-menu-product"
                  }
                >
                  {(localWrite || globalWrite) && (
                    <label className="md-menu-product-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.item_id)}
                        disabled={busy}
                        aria-label={`Select ${item.item_name} from ${item.brand_name ?? "the menu"}`}
                        onChange={() => toggleSelected(item.item_id)}
                      />
                    </label>
                  )}
                  <div className="md-menu-product-body">
                    <p className="md-menu-product-brand">
                      {item.brand_name ?? "Unassigned brand"} <span>· {item.category_name}</span>
                    </p>
                    <h3>{item.item_name}</h3>
                    <div className="md-menu-product-meta">
                      <span className="md-menu-price">
                        {penceToPounds(item.location_price_pence)}
                      </span>
                      <span className={`md-menu-badge md-menu-badge-${status}`}>
                        {status === "shown" ? (
                          <Eye aria-hidden="true" />
                        ) : status === "hidden" ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <FilePenLine aria-hidden="true" />
                        )}
                        {statusNames[status]}
                      </span>
                    </div>
                    {item.location_price_pence !== item.price_pence && (
                      <p className="md-menu-override">
                        Kitchen price override · base {penceToPounds(item.price_pence)}
                      </p>
                    )}
                  </div>
                  <div className="md-menu-product-actions">
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      disabled={busy}
                      onClick={() => choose(item)}
                      aria-label={`${globalWrite ? "Edit" : "View"} ${item.item_name} from ${item.brand_name ?? "the menu"}`}
                      aria-controls={id + "-editor"}
                      aria-current={selected?.item_id === item.item_id ? "true" : undefined}
                    >
                      {globalWrite ? "Edit" : "View"}
                    </button>
                    {localWrite && item.active && (
                      <button
                        type="button"
                        className="md-ops-button md-ops-secondary md-menu-availability-action"
                        disabled={!writable}
                        onClick={() => void toggleVisibility(item)}
                        aria-label={`${item.visible ? "Mark out of stock" : "Mark back in stock"}: ${item.item_name} in this kitchen`}
                      >
                        {pending === `visibility:${item.item_id}`
                          ? "Saving…"
                          : item.visible
                            ? "Out of stock"
                            : "Back in stock"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {filtered.length === 0 && (
            <div className="md-menu-empty">
              <SlidersHorizontal className="size-6" aria-hidden="true" />
              <h3>{rows.length ? "No products match these filters" : "No saved products yet"}</h3>
              <p>
                {rows.length
                  ? "Try another brand, category or search term."
                  : globalWrite
                    ? "Add a product to an approved brand and category to start its kitchen setup."
                    : "Ask a menu manager to add products to this kitchen."}
              </p>
            </div>
          )}
          {shown.length < filtered.length && (
            <button
              type="button"
              className="md-ops-button md-ops-secondary md-menu-more"
              onClick={() => setLimit((value) => value + pageSize)}
            >
              <ChevronDown className="size-4" aria-hidden="true" /> Show{" "}
              {Math.min(pageSize, filtered.length - shown.length)} more · {shown.length} of{" "}
              {filtered.length}
            </button>
          )}
          <p className="md-menu-setting-note">
            Hide a dish when it sells out; restore it when it can be served again. “Shown” is the
            product’s saved setting. Its category must also be available; kitchen and ordering
            checks still apply.
          </p>
        </section>

        <div className="md-menu-editor-column">
          <section
            className="md-ops-card md-menu-editor"
            id={id + "-editor"}
            aria-labelledby={id + "-editor-heading"}
          >
            <div className="md-menu-editor-top">
              <p className="md-menu-eyebrow">Product details</p>
              {dirty && <span className="md-menu-unsaved">Unsaved changes</span>}
              {current && (
                <button
                  type="button"
                  className="md-ops-button md-ops-secondary md-menu-editor-back"
                  onClick={() => {
                    setFeedbackArea("menu");
                    resultHeading.current?.focus({ preventScroll: true });
                    resultHeading.current?.scrollIntoView({ block: "start", behavior: "auto" });
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" /> Back to products
                </button>
              )}
            </div>
            <h2 ref={editorHeading} tabIndex={-1} id={id + "-editor-heading"}>
              {current
                ? current.item_name
                : selected
                  ? "Product no longer available"
                  : "Choose a product"}
            </h2>
            {!current ? (
              <p className="md-ops-muted mt-3">
                {selected
                  ? "Refresh the menu or choose another product. Your draft has not been saved."
                  : "Select Edit beside a dish to review its price, description, allergens and kitchen preparation."}
              </p>
            ) : (
              <>
                <p className="md-menu-product-brand mt-2">
                  {current.brand_name ?? "Unassigned brand"} · {current.category_name}
                </p>
                {requestedItem && (
                  <div className="md-menu-review" role="alert">
                    <p>Keep or discard your changes before opening another product.</p>
                    <div className="md-menu-button-row">
                      <button
                        type="button"
                        className="md-ops-button md-ops-secondary"
                        onClick={() => setRequestedItem(null)}
                      >
                        Keep editing
                      </button>
                      <button
                        type="button"
                        className="md-ops-button md-ops-secondary"
                        onClick={() => {
                          const next = rows.find((item) => item.item_id === requestedItem);
                          if (next) selectProduct(next);
                          else setRequestedItem(null);
                        }}
                      >
                        Discard and open product
                      </button>
                    </div>
                  </div>
                )}
                {changedElsewhere && (
                  <div className="md-menu-review" role="alert">
                    <p>
                      This product changed on another screen. Its saved base price is now{" "}
                      {penceToPounds(current.price_pence)}.
                    </p>
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary mt-3"
                      disabled={busy}
                      onClick={() => selectProduct(current)}
                    >
                      Discard edits and load latest values
                    </button>
                  </div>
                )}
                <div className="md-menu-saved-prices">
                  <div>
                    <span>Saved base price</span>
                    <strong>{penceToPounds(current.price_pence)}</strong>
                  </div>
                  <div>
                    <span>This kitchen</span>
                    <strong>{penceToPounds(current.location_price_pence)}</strong>
                  </div>
                </div>
                <p className="md-menu-scope-note">
                  Names, descriptions, base prices and active status are shared across MealDeck
                  kitchens.
                  {!globalWrite ? " Your role can view these details but cannot edit them." : ""}
                </p>
                {current.location_price_pence !== current.price_pence && (
                  <p className="md-menu-review">
                    This kitchen has its own price override. Changing the base price keeps that
                    override.
                  </p>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveProduct();
                  }}
                  className="md-menu-product-form"
                >
                  <fieldset disabled={!draftEditable}>
                    <label htmlFor={id + "-name"}>
                      Product name
                      <input
                        id={id + "-name"}
                        className="md-ops-field"
                        value={draft.name}
                        maxLength={140}
                        required
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      />
                    </label>
                    <label htmlFor={id + "-description"}>
                      Description
                      <textarea
                        id={id + "-description"}
                        className="md-ops-field"
                        value={draft.description}
                        maxLength={2000}
                        rows={3}
                        onChange={(event) =>
                          setDraft({ ...draft, description: event.target.value })
                        }
                      />
                    </label>
                    <label htmlFor={id + "-price"}>
                      Base price (£)
                      <input
                        id={id + "-price"}
                        className="md-ops-field"
                        inputMode="decimal"
                        value={draft.price}
                        required
                        onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                      />
                    </label>
                    <label className="md-menu-active-check">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                      />
                      <span>
                        Active product
                        <small>
                          Inactive products cannot be ordered. Kitchen visibility is managed
                          separately.
                        </small>
                      </span>
                    </label>
                  </fieldset>
                  <div className="md-menu-allergens">
                    <h3>Recorded allergens</h3>
                    <p>
                      {current.allergens.length
                        ? current.allergens.join(", ")
                        : "No allergens recorded. Check the recipe and supplier information before activation."}
                    </p>
                  </div>
                  {globalWrite && (
                    <div className="md-menu-save-row">
                      <button
                        type="submit"
                        className="md-ops-button md-ops-primary"
                        disabled={!writable || !dirty || changedElsewhere}
                      >
                        {pending === "save" ? "Saving…" : "Save product"}
                      </button>
                      {dirty && (
                        <button
                          type="button"
                          className="md-ops-button md-ops-secondary"
                          disabled={busy}
                          onClick={() => selectProduct(current)}
                        >
                          Discard changes
                        </button>
                      )}
                    </div>
                  )}
                  {feedbackArea === "editor" && (success || loadError || actionError) && (
                    <div className="md-menu-editor-feedback">{feedback}</div>
                  )}
                  {confirmDeactivation && !draft.active && current.active && (
                    <div className="md-menu-review" role="alert">
                      <h3>Deactivate {current.item_name} across all MealDeck menus?</h3>
                      <p>
                        This product will be inactive at every MealDeck kitchen. Your other edits in
                        this form will also be saved.
                      </p>
                      <div className="md-menu-button-row">
                        <button
                          type="button"
                          className="md-ops-button md-ops-secondary"
                          disabled={busy}
                          onClick={() => setConfirmDeactivation(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="md-ops-button md-ops-primary"
                          disabled={!writable || changedElsewhere}
                          onClick={() => void saveProduct(true)}
                        >
                          Deactivate and save
                        </button>
                      </div>
                    </div>
                  )}
                </form>
                {!current.active && localWrite && (
                  <div className="mt-5">
                    <MenuKitchenRoute
                      key={current.item_id}
                      tenantId={tenantId}
                      locationId={locationId}
                      itemId={current.item_id}
                      disabled={!!pending || !!loadError}
                      canActivate={globalWrite}
                      onBusyChange={setRoutingBusy}
                    />
                  </div>
                )}
                <a href={"#" + id + "-modifiers"} className="md-menu-modifier-link">
                  <ArrowDown className="size-4" aria-hidden="true" /> Manage add-ons and upgrades
                </a>
              </>
            )}
          </section>

          {globalWrite && (
            <section
              className="md-ops-card md-menu-create"
              aria-labelledby={id + "-create-heading"}
            >
              <div className="md-menu-create-heading">
                <h2 ref={createHeading} tabIndex={-1} id={id + "-create-heading"}>
                  Add a product
                </h2>
                <button
                  type="button"
                  className="md-ops-button md-ops-secondary"
                  disabled={busy}
                  aria-expanded={creating}
                  aria-controls={id + "-create-form"}
                  onClick={() => setCreating((value) => !value)}
                >
                  {creating ? "Collapse" : "Open"}
                </button>
              </div>
              <p className="md-ops-muted mt-2">
                Save a draft, assign its kitchen, then review it before activation.
              </p>
              {creating && (
                <form
                  id={id + "-create-form"}
                  className="md-menu-product-form"
                  onSubmit={(event) => void createProduct(event)}
                >
                  <fieldset disabled={!writable}>
                    <label htmlFor={id + "-create-category"}>
                      Brand and category
                      <select
                        id={id + "-create-category"}
                        className="md-ops-field"
                        value={categoryId}
                        required
                        onChange={(event) => setCategoryId(event.target.value)}
                      >
                        <option value="">Choose an approved category…</option>
                        {taxonomy.map((category) => (
                          <option key={category.category_id} value={category.category_id}>
                            {category.brand_name} · {category.category_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor={id + "-create-name"}>
                      Product name
                      <input
                        id={id + "-create-name"}
                        className="md-ops-field"
                        value={newDraft.name}
                        maxLength={140}
                        required
                        onChange={(event) => setNewDraft({ ...newDraft, name: event.target.value })}
                      />
                    </label>
                    <label htmlFor={id + "-create-price"}>
                      Base price (£)
                      <input
                        id={id + "-create-price"}
                        className="md-ops-field"
                        inputMode="decimal"
                        value={newDraft.price}
                        required
                        onChange={(event) =>
                          setNewDraft({ ...newDraft, price: event.target.value })
                        }
                      />
                    </label>
                    <label htmlFor={id + "-create-description"}>
                      Description
                      <textarea
                        id={id + "-create-description"}
                        className="md-ops-field"
                        rows={3}
                        value={newDraft.description}
                        maxLength={2000}
                        onChange={(event) =>
                          setNewDraft({ ...newDraft, description: event.target.value })
                        }
                      />
                    </label>
                  </fieldset>
                  <button
                    type="submit"
                    className="md-ops-button md-ops-primary mt-4"
                    disabled={!writable || !categoryId}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {pending === "create" ? "Creating…" : "Save inactive draft"}
                  </button>
                  {feedbackArea === "create" && (success || loadError || actionError) && (
                    <div className="md-menu-editor-feedback">{feedback}</div>
                  )}
                </form>
              )}
            </section>
          )}
        </div>
      </div>
      <div id={id + "-categories"} className="md-menu-modifiers">
        <MenuCategoriesPanel
          key={tenantId}
          tenantId={tenantId}
          canRead={canGlobal("menu.read")}
          canWrite={globalWrite}
          disabled={busy}
          onBusyChange={setStructureBusy}
          onSaved={categorySaved}
        />
      </div>
      <div id={id + "-modifiers"} className="md-menu-modifiers">
        <ModifierPricesPanel
          key={tenantId}
          tenantId={tenantId}
          canRead={canGlobal("menu.read")}
          canWrite={globalWrite}
          disabled={busy}
          onBusyChange={setStructureBusy}
        />
      </div>
    </div>
  );
}
