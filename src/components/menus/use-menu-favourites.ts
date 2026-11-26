import { useEffect, useRef, useState } from "react";
import {
  decodeMenuFavourites,
  encodeMenuFavourites,
  FAVOURITES_STORAGE_KEY,
  favouriteKey,
  MAX_MENU_FAVOURITES,
  toggleMenuFavourite,
  type MenuFavourite,
} from "@/lib/mealdeck-menu-favourites";

/** Device-only preference. No network, user account, analytics or basket writes. */
export function useMenuFavourites() {
  const [values, setValues] = useState<MenuFavourite[]>([]);
  const [ready, setReady] = useState(false);
  const [sessionOnly, setSessionOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const current = useRef<MenuFavourite[]>([]);
  const storageFailed = useRef(false);

  useEffect(() => {
    function accept(next: MenuFavourite[]) {
      current.current = next;
      setValues(next);
    }
    try {
      accept(decodeMenuFavourites(window.localStorage.getItem(FAVOURITES_STORAGE_KEY)));
    } catch {
      storageFailed.current = true;
      setSessionOnly(true);
    }
    setReady(true);
    function onStorage(event: StorageEvent) {
      if (storageFailed.current || (event.key !== FAVOURITES_STORAGE_KEY && event.key !== null)) return;
      accept(decodeMenuFavourites(event.key === null ? null : event.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function save(next: MenuFavourite[]) {
    current.current = next;
    setValues(next);
    try {
      if (storageFailed.current) return;
      if (next.length) window.localStorage.setItem(FAVOURITES_STORAGE_KEY, encodeMenuFavourites(next));
      else window.localStorage.removeItem(FAVOURITES_STORAGE_KEY);
    } catch {
      storageFailed.current = true;
      setSessionOnly(true);
    }
  }

  function toggle(brandId: string, itemId: string, name: string) {
    if (!ready) return;
    const key = favouriteKey(brandId, itemId);
    const saved = current.current.some((entry) => favouriteKey(entry.brandId, entry.itemId) === key);
    if (!saved && current.current.length >= MAX_MENU_FAVOURITES) {
      setNotice("You can save up to " + MAX_MENU_FAVOURITES + " favourites. Remove one to save another.");
      return;
    }
    const next = toggleMenuFavourite(current.current, brandId, itemId);
    if (next.length === current.current.length) return;
    save(next);
    setNotice(name + (saved ? " removed from favourites." : " saved to favourites."));
  }

  function clear() {
    if (!ready) return;
    save([]);
    setNotice("Favourites cleared.");
  }

  return { values, ready, sessionOnly, notice, toggle, clear };
}
