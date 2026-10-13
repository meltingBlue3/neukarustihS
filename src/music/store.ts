// The music state shared by the library, playback and UI. Logic that touches
// storage or audio lives in library.ts and playback.ts.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlaybackMode } from "./queue";
import type { Playlist, Track } from "./types";

export interface MusicState {
  tracks: Track[];
  playlists: Playlist[];
  favorites: string[];
  queue: string[];
  current: string | null;
  playing: boolean;
  position: number;
  duration: number;
  playbackMode: PlaybackMode;
  showTranslation: boolean;
  showFurigana: boolean;
  // Recently played, for stepping back in shuffle.
  history: string[];
  ready: boolean;
  // Status of the running import or lyric sync; only one runs at a time.
  importing: string;
  sleepUntil: number | null;
  toggleFavorite: (id: string) => void;
  createPlaylist: (name: string) => string;
  updatePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlist: string, id: string) => void;
  removeFromPlaylist: (playlist: string, id: string) => void;
  cyclePlaybackMode: () => void;
}

export const useMusic = create<MusicState>()(
  persist(
    (setState) => ({
      tracks: [],
      playlists: [],
      favorites: [],
      queue: [],
      current: null,
      playing: false,
      position: 0,
      duration: 0,
      playbackMode: "all",
      showTranslation: true,
      showFurigana: true,
      history: [],
      ready: false,
      importing: "",
      sleepUntil: null,
      toggleFavorite: (id) =>
        setState((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((x) => x !== id)
            : [...s.favorites, id],
        })),
      createPlaylist: (name) => {
        const id = crypto.randomUUID();
        setState((s) => ({
          playlists: [...s.playlists, { id, name: name.trim(), tracks: [] }],
        }));
        return id;
      },
      updatePlaylist: (id, name) =>
        setState((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id ? { ...p, name: name.trim() } : p,
          ),
        })),
      deletePlaylist: (id) =>
        setState((s) => ({
          playlists: s.playlists.filter((p) => p.id !== id),
        })),
      addToPlaylist: (playlist, id) =>
        setState((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlist
              ? { ...p, tracks: [...new Set([...p.tracks, id])] }
              : p,
          ),
        })),
      removeFromPlaylist: (playlist, id) =>
        setState((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlist
              ? { ...p, tracks: p.tracks.filter((t) => t !== id) }
              : p,
          ),
        })),
      cyclePlaybackMode: () =>
        setState((s) => ({
          playbackMode:
            s.playbackMode === "all"
              ? "one"
              : s.playbackMode === "one"
                ? "shuffle"
                : "all",
          history: [],
        })),
    }),
    {
      // Preferences only; tracks live in IndexedDB (library.ts).
      name: "neukarustihs-preferences-v1",
      version: 1,
      // Version 0 kept separate repeat and shuffle flags and an in-app volume,
      // now left to the device.
      migrate: (persisted) => {
        const saved = (
          persisted && typeof persisted === "object" ? persisted : {}
        ) as Partial<MusicState> & { repeat?: unknown; shuffle?: unknown };
        const playbackMode: PlaybackMode =
          saved.repeat === "one"
            ? "one"
            : saved.shuffle === true
              ? "shuffle"
              : "all";
        return {
          playlists: saved.playlists ?? [],
          favorites: saved.favorites ?? [],
          current: saved.current ?? null,
          queue: saved.queue ?? [],
          playbackMode,
        };
      },
      partialize: (s) => ({
        playlists: s.playlists,
        favorites: s.favorites,
        playbackMode: s.playbackMode,
        showTranslation: s.showTranslation,
        showFurigana: s.showFurigana,
        current: s.current,
        queue: s.queue,
      }),
    },
  ),
);
