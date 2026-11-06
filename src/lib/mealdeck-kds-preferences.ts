type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

function toolsKey(scope: string): string {
  return `mealdeck-kds-tools-v1:${scope}`;
}

/** Only the toolbar's open/closed preference is saved, never order or search data. */
export function readKdsToolsPreference(scope: string, storage?: ReadStorage): boolean {
  try {
    const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    return target?.getItem(toolsKey(scope)) === "open";
  } catch {
    return false;
  }
}

export function saveKdsToolsPreference(scope: string, open: boolean, storage?: WriteStorage): void {
  try {
    const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    target?.setItem(toolsKey(scope), open ? "open" : "closed");
  } catch {
    // The toolbar remains usable when browser storage is unavailable.
  }
}
