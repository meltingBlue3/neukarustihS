import { registerSW } from "virtual:pwa-register";
let available = false;
export const hasAppUpdate = () => available;
function announceUpdate() {
  available = true;
  window.dispatchEvent(new Event("app-update"));
}
registerSW({
  // Reload only after the user accepts and the new worker has activated.
  onNeedReload() {},
  onNeedRefresh() {
    announceUpdate();
  },
  onOfflineReady() {
    window.dispatchEvent(new Event("app-offline-ready"));
  },
});

export async function updateApp(reloadPage = true) {
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  if (!registration) throw new Error("Update service unavailable");
  const worker = registration.waiting;
  if (worker) {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        worker.removeEventListener("statechange", changed);
        if (error) reject(error);
        else resolve();
      };
      const changed = () => {
        if (worker.state === "activated") finish();
        else if (worker.state === "redundant")
          finish(new Error("Update activation failed"));
      };
      const timeout = setTimeout(
        () => finish(new Error("Update activation timed out")),
        20000,
      );
      worker.addEventListener("statechange", changed);
      worker.postMessage({ type: "SKIP_WAITING" });
      changed();
    });
  } else if (registration.installing) {
    throw new Error("Update is still installing");
  }
  if (reloadPage) window.location.reload();
}

export async function checkForAppUpdate() {
  if (!navigator.onLine) return "offline";
  if (!("serviceWorker" in navigator)) return "unavailable";
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  if (!registration) return "unavailable";
  await registration.update();
  const worker = registration.installing;
  if (worker) {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        worker.removeEventListener("statechange", changed);
        if (error) reject(error);
        else resolve();
      };
      const changed = () => {
        if (worker.state === "installed" || worker.state === "activated")
          finish();
        else if (worker.state === "redundant")
          finish(new Error("Update installation failed"));
      };
      const timeout = setTimeout(
        () => finish(new Error("Update check timed out")),
        20000,
      );
      worker.addEventListener("statechange", changed);
      changed();
    });
  }
  if (registration.waiting || available) {
    announceUpdate();
    return "available";
  }
  return "latest";
}
