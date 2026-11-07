/** UI TEST ONLY. Synthetic props; every application network request is blocked
 * by the HTML entry before importing this module. No real menu data or saves. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { OpsPermission } from "../../../src/lib/mealdeck-ops-access";
import type { OpsMenuItem, OpsTaxonomy } from "../../../src/lib/mealdeck-ops-types";
import "../../../src/styles.css";
import "../../../src/styles.mealdeck-rebuild.css";
import "../../../src/components/ops/ops-theme.css";
import "../../../src/components/ops/operations-mobile.css";
import { OpsMenuPanel } from "../../../src/components/ops/menu-manager";

const tenantId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";
const brands = [
  "Skorch Burgers · QA",
  "Souvano · QA",
  "Tavo Chicken · QA",
  "Moktl · QA",
  "Load’d · QA",
];
const brandId = (index: number) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const taxonomy: OpsTaxonomy[] = brands.map((brand, index) => ({
  brand_id: brandId(index),
  brand_name: brand,
  category_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  category_name: index === 3 ? "Drinks and mocktails" : "Main dishes and meals",
}));

function item(
  index: number,
  brand: number,
  name: string,
  overrides: Partial<OpsMenuItem> = {},
): OpsMenuItem {
  return {
    item_id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    brand_id: brandId(brand),
    brand_name: brands[brand]!,
    category_name: taxonomy[brand]!.category_name,
    item_name: name,
    description:
      "Synthetic product description for layout testing. This is not a live menu or allergen declaration.",
    price_pence: 550,
    location_price_pence: 550,
    active: true,
    visible: true,
    allergens: [],
    ...overrides,
  };
}

const menu: OpsMenuItem[] = [
  item(1, 0, "Double Deal · synthetic sample"),
  item(2, 0, "Four of a Kind with a deliberately long product name for narrow-screen wrapping", {
    visible: false,
  }),
  item(3, 1, "Middle Eastern flavour Lamb Chops · synthetic sample"),
  item(4, 2, "12-piece Fiery Sweet Chilli wings with fries, drink and extra sauce · QA"),
  item(5, 3, "Mango and mint cooler · inactive synthetic draft", { active: false }),
  item(6, 4, "Loaded fries · QA-long-unbroken-product-identifier-for-mobile-wrapping"),
  item(7, 1, "Stir-Fry Doner · synthetic kitchen price override", {
    price_pence: 600,
    location_price_pence: 650,
  }),
  item(8, 0, "Synthetic product without a brand assignment", { brand_id: null, brand_name: null }),
];

type PermissionMode = "manager" | "kitchen" | "readonly";
const styles = `
  html, body { margin: 0; min-width: 0; }
  .qa-menu-banner { margin: 12px; padding: 12px; border: 2px solid #923514; background: #fff5d5; color: #44230c; }
  .qa-menu-banner h1 { margin: 0; font-size: 18px; line-height: 1.3; }
  .qa-menu-banner p { margin: 6px 0; font-size: 13px; line-height: 1.5; }
  .qa-menu-banner summary { cursor: pointer; font-size: 14px; font-weight: 700; }
  .qa-menu-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding-top: 10px; }
  .qa-menu-controls label { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
  .qa-menu-controls select, .qa-menu-controls button { min-height: 44px; max-width: 100%; border: 1px solid #9c8467; border-radius: 5px; background: white; padding: 8px 10px; color: #2c251c; font: 600 14px/1.4 sans-serif; }
  .qa-menu-log { max-height: 180px; overflow: auto; margin: 8px 0 0; font: 12px/1.45 monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

function Fixture() {
  const [mode, setMode] = useState<PermissionMode>("manager");
  const [reset, setReset] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const manager = useRef<HTMLDivElement>(null);
  const record = useCallback(
    (entry: string) => setLog((previous) => [...previous.slice(-29), entry]),
    [],
  );
  const can = useCallback(
    (permission: OpsPermission) =>
      permission === "menu.read" || (permission === "menu.write" && mode !== "readonly"),
    [mode],
  );
  const canGlobal = useCallback(
    (permission: OpsPermission) =>
      (permission === "menu.read" && mode !== "kitchen") ||
      (permission === "menu.write" && mode === "manager"),
    [mode],
  );

  useEffect(() => {
    const blocked = (event: Event) =>
      record(`Blocked application request: ${String((event as CustomEvent<unknown>).detail)}`);
    window.addEventListener("menu-qa-request-blocked", blocked);
    return () => window.removeEventListener("menu-qa-request-blocked", blocked);
  }, [record]);

  function measure() {
    const cards = [
      ...(manager.current?.querySelectorAll<HTMLElement>(".md-menu-product") ?? []),
    ].map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      };
    });
    const buttons = [
      ...(manager.current?.querySelectorAll<HTMLElement>(".md-menu-product-actions button") ?? []),
    ];
    record(
      JSON.stringify({
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        cards: cards.length,
        cardLeftSpread: cards.length
          ? Math.max(...cards.map((card) => card.left)) -
            Math.min(...cards.map((card) => card.left))
          : 0,
        cardRightSpread: cards.length
          ? Math.max(...cards.map((card) => card.right)) -
            Math.min(...cards.map((card) => card.right))
          : 0,
        overlappingRows: cards.some(
          (card, index) => index > 0 && card.top < cards[index - 1]!.bottom,
        ),
        smallestActionHeight: buttons.length
          ? Math.min(...buttons.map((button) => button.getBoundingClientRect().height))
          : null,
      }),
    );
  }

  return (
    <div className="md-ops">
      <style>{styles}</style>
      <header className="qa-menu-banner">
        <h1>UI TEST ONLY · Brand menus</h1>
        <p>
          Eight synthetic products. No sign-in, live menu records or successful backend saves. The
          actual Menu Manager supplies filtering, selection and editing UI.
        </p>
        <details>
          <summary>Fixture controls and interaction log</summary>
          <div className="qa-menu-controls">
            <label>
              Permissions{" "}
              <select
                aria-label="Fixture permissions"
                value={mode}
                onChange={(event) => setMode(event.target.value as PermissionMode)}
              >
                <option value="manager">Menu manager</option>
                <option value="kitchen">Kitchen availability only</option>
                <option value="readonly">Read only</option>
              </select>
            </label>
            <button type="button" onClick={measure}>
              Measure cards
            </button>
            <button
              type="button"
              onClick={() => {
                setReset((value) => value + 1);
                record("Fixture reset");
              }}
            >
              Reset fixture
            </button>
            <button type="button" onClick={() => setLog([])}>
              Clear log
            </button>
          </div>
          <pre className="qa-menu-log" aria-label="Fixture interaction and callback log">
            {log.join("\n") || "No interactions yet."}
          </pre>
        </details>
      </header>
      <main className="md-ops-main mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
        <div
          ref={manager}
          onClickCapture={(event) => {
            const target =
              event.target instanceof Element ? event.target.closest("button, a") : null;
            if (target)
              record(
                `UI action: ${target.getAttribute("aria-label") ?? target.textContent?.trim() ?? "control"}`,
              );
          }}
        >
          <OpsMenuPanel
            key={`${mode}:${reset}`}
            tenantId={tenantId}
            locationId={locationId}
            menu={menu}
            taxonomy={taxonomy}
            can={can}
            canGlobal={canGlobal}
            notice={(message) => record(`Notice callback: ${message}`)}
            reload={async () => {
              record("Reload callback");
            }}
          />
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
