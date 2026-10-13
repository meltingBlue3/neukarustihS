// Installation and updates. Listeners start at load, before any page that
// shows them, because the browser announces both only once.
import { create } from "zustand";
import { registerSW } from "virtual:pwa-register";
import { notify } from "./notice";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export const usePwa = create(() => ({
  updateReady: false,
  installPrompt: null as InstallEvent | null,
  installed:
    matchMedia("(display-mode: standalone)").matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone,
}));

registerSW({
  // Reload only after the user accepts and the new worker has activated.
  onNeedReload() {},
  onNeedRefresh() {
    usePwa.setState({ updateReady: true });
  },
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  usePwa.setState({ installPrompt: event as InstallEvent });
});
window.addEventListener("appinstalled", () => {
  usePwa.setState({ installPrompt: null, installed: true });
  notify("已安装，主屏幕见。");
});

export async function installApp() {
  const prompt = usePwa.getState().installPrompt;
  if (!prompt) {
    notify(
      "在 Android Chrome 菜单中选择「添加到主屏幕」或「安装应用」。iPhone 请用 Safari 的分享菜单添加到主屏幕。",
    );
    return;
  }
  await prompt.prompt();
  await prompt.userChoice;
  usePwa.setState({ installPrompt: null });
}

// Resolve once the worker reaches one of `done`, or reject if it is discarded.
function waitForWorker(
  worker: ServiceWorker,
  done: ServiceWorkerState[],
  failure: string,
) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (done.includes(worker.state)) finish();
      else if (worker.state === "redundant") finish(new Error(failure));
    };
    const timeout = setTimeout(
      () => finish(new Error(`${failure}: timed out`)),
      20000,
    );
    worker.addEventListener("statechange", changed);
    changed();
  });
}

export async function updateApp() {
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  if (!registration) throw new Error("Update service unavailable");
  const worker = registration.waiting;
  if (worker) {
    const activated = waitForWorker(
      worker,
      ["activated"],
      "Update activation failed",
    );
    worker.postMessage({ type: "SKIP_WAITING" });
    await activated;
  } else if (registration.installing) {
    throw new Error("Update is still installing");
  }
  window.location.reload();
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
  if (worker)
    await waitForWorker(
      worker,
      ["installed", "activated"],
      "Update installation failed",
    );
  if (registration.waiting || usePwa.getState().updateReady) {
    usePwa.setState({ updateReady: true });
    return "available";
  }
  return "latest";
}
