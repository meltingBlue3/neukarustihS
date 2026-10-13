// Where the user is in the interface. Not persisted: every launch starts in
// the library.
import { create } from "zustand";

export type View = "library" | "favorites" | "playlists" | "settings";
export type SortKey = "added" | "title" | "artist";

// Dialogs stack: one opened from another sits on top of it, and closing it
// returns to the one beneath.
export type Dialog =
  | { kind: "import" }
  | { kind: "queue" }
  | { kind: "trackActions"; trackId: string }
  // Creates a playlist unless `playlistId` names one to rename.
  | { kind: "playlistForm"; playlistId?: string; addTrackId?: string }
  | { kind: "removeTrack"; trackId: string }
  | { kind: "deletePlaylist"; playlistId: string }
  | { kind: "syncLyrics"; trackId: string };

export const useUi = create(() => ({
  view: "library" as View,
  // The open playlist, within the playlists view.
  playlistId: null as string | null,
  sort: "added" as SortKey,
  // The full-screen player on phones.
  playerOpen: false,
  dialogs: [] as Dialog[],
}));

export const navigate = (view: View, playlistId: string | null = null) =>
  useUi.setState({ view, playlistId });
export const openPlaylist = (id: string) => navigate("playlists", id);
export const openDialog = (dialog: Dialog) =>
  useUi.setState((s) => ({ dialogs: [...s.dialogs, dialog] }));
export const closeDialog = () =>
  useUi.setState((s) => ({ dialogs: s.dialogs.slice(0, -1) }));
export const closeAllDialogs = () => useUi.setState({ dialogs: [] });
export const setPlayerOpen = (playerOpen: boolean) =>
  useUi.setState({ playerOpen });
