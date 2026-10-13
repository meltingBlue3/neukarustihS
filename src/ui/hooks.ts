import { useEffect, useSyncExternalStore } from "react";
import { audio, seek, togglePlay } from "../music/playback";
import { useMusic } from "../music/store";
import { useUi } from "./state";
import type { View } from "./state";

// The playlist being viewed, if any.
export function useShownPlaylist() {
  const playlistId = useUi((s) => s.playlistId);
  return useMusic((s) => s.playlists.find((p) => p.id === playlistId));
}

const titles: Record<View, string> = {
  library: "音乐库",
  favorites: "我喜欢",
  playlists: "我的歌单",
  settings: "聆听偏好",
};
export function usePageTitle() {
  const view = useUi((s) => s.view);
  return useShownPlaylist()?.name || titles[view];
}

const subscribeOnline = (changed: () => void) => {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
};
export const useOnline = () =>
  useSyncExternalStore(subscribeOnline, () => navigator.onLine);

// Space plays or pauses, arrows seek, unless the user is typing or using a
// control that handles those keys itself.
export function useKeyboardShortcuts() {
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input, textarea, select, button, [contenteditable], dialog",
        ) ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(audio.currentTime + 5);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(audio.currentTime - 5);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
}
