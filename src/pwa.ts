import { registerSW } from "virtual:pwa-register";
export const updateApp = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new Event("app-update"));
  },
  onOfflineReady() {
    window.dispatchEvent(new Event("app-offline-ready"));
  },
});
