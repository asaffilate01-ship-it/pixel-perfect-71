import { useEffect, useRef, useState, type ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { mealDeckPwaSurface } from "@/lib/mealdeck-pwa-surface";
import { PwaContext, useMealDeckPwa } from "@/lib/mealdeck-pwa-context";
import "@/styles.pwa.css";

type InstallEvent = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { worker: workerUrl, scope } = mealDeckPwaSurface(pathname);
  const [installed, setInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const deferred = useRef<InstallEvent | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadForUpdate = useRef(false);

  useEffect(() => {
    deferred.current = null;
    setCanInstall(false);
    setUpdateReady(false);
    let active = true;
    let observedRegistration: ServiceWorkerRegistration | null = null;
    const workerListeners = new Map<ServiceWorker, () => void>();
    const standalone = window.matchMedia("(display-mode: standalone)");
    const refreshInstalled = () =>
      setInstalled(
        standalone.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    const refreshConnection = () => setOffline(!navigator.onLine);
    const beforeInstall = (event: Event) => {
      if (!("prompt" in event) || typeof event.prompt !== "function") return;
      event.preventDefault();
      deferred.current = event as InstallEvent;
      setCanInstall(true);
    };
    const didInstall = () => {
      deferred.current = null;
      setCanInstall(false);
      setInstalled(true);
    };
    refreshInstalled();
    refreshConnection();
    standalone.addEventListener("change", refreshInstalled);
    window.addEventListener("online", refreshConnection);
    window.addEventListener("offline", refreshConnection);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);

    const workers = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    const refreshWaiting = () => {
      if (active) setUpdateReady(!!registration.current?.waiting);
    };
    const controllerChanged = () => {
      refreshWaiting();
      // Another tab can activate the worker. Only refresh this page after its
      // own explicit update request, preserving work in every other tab.
      if (reloadForUpdate.current) {
        reloadForUpdate.current = false;
        window.location.reload();
      }
    };
    const observeInstalling = (worker: ServiceWorker | null) => {
      if (!worker || workerListeners.has(worker)) return;
      const stateChanged = () => {
        if (!active) return;
        refreshWaiting();
        if (worker.state === "activated" || worker.state === "redundant") {
          worker.removeEventListener("statechange", stateChanged);
          workerListeners.delete(worker);
        }
      };
      workerListeners.set(worker, stateChanged);
      worker.addEventListener("statechange", stateChanged);
      stateChanged();
    };
    const updateFound = () => observeInstalling(observedRegistration?.installing ?? null);
    workers?.addEventListener("controllerchange", controllerChanged);
    // The worker caches only the public offline screen and its static artwork.
    // It never stores HTML from the app, API responses, sessions or staff data.
    if (workers && window.isSecureContext) {
      void workers.register(workerUrl, { scope, updateViaCache: "none" }).then(
        (next) => {
          if (!active) return;
          registration.current = next;
          observedRegistration = next;
          next.addEventListener("updatefound", updateFound);
          // A different tab may have started installation before register()
          // resolved; updatefound is not replayed for this new observer.
          observeInstalling(next.installing);
          refreshWaiting();
        },
        () => {
          // Normal website browsing remains available if registration is blocked.
        },
      );
    }
    return () => {
      active = false;
      standalone.removeEventListener("change", refreshInstalled);
      window.removeEventListener("online", refreshConnection);
      window.removeEventListener("offline", refreshConnection);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      workers?.removeEventListener("controllerchange", controllerChanged);
      observedRegistration?.removeEventListener("updatefound", updateFound);
      for (const [worker, listener] of workerListeners) {
        worker.removeEventListener("statechange", listener);
      }
      workerListeners.clear();
      if (registration.current === observedRegistration) registration.current = null;
      reloadForUpdate.current = false;
    };
  }, [workerUrl, scope]);

  async function install(): Promise<"accepted" | "dismissed" | "unavailable"> {
    const event = deferred.current;
    if (!event) return "unavailable";
    deferred.current = null;
    setCanInstall(false);
    try {
      await event.prompt();
      return (await event.userChoice).outcome;
    } catch {
      return "unavailable";
    }
  }

  function update() {
    const waiting = registration.current?.waiting;
    if (!waiting) {
      setUpdateReady(false);
      reloadForUpdate.current = false;
      return;
    }
    reloadForUpdate.current = true;
    try {
      waiting.postMessage({ type: "MEALDECK_ACTIVATE_UPDATE" });
    } catch {
      // A worker superseded between the click and postMessage cannot update.
      reloadForUpdate.current = false;
      setUpdateReady(false);
    }
  }

  return (
    <PwaContext.Provider value={{ installed, canInstall, offline, updateReady, install, update }}>
      {children}
    </PwaContext.Provider>
  );
}

export function PwaConnectionNotice() {
  const { offline } = useMealDeckPwa();
  if (!offline) return null;
  return (
    <div className="md-offline-notice" role="status">
      <WifiOff size={17} aria-hidden="true" />
      <span>You’re offline. Saved basket choices stay on this device.</span>
    </div>
  );
}
