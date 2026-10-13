// The music state shared by the library, playback and UI. Logic that touches
// storage or audio lives in library.ts and playback.ts.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { shallow } from "zustand/shallow";
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

type Preferences = Pick<
  MusicState,
  | "playlists"
  | "favorites"
  | "playbackMode"
  | "showTranslation"
  | "showFurigana"
  | "current"
  | "queue"
>;

// Persist saves on every state change, including the playback position
// several times a second. Only write when a saved preference changed.
function preferenceStorage(): PersistStorage<Preferences> {
  const json = createJSONStorage<Preferences>(() => localStorage)!;
  let saved: StorageValue<Preferences> | undefined;
  return {
    ...json,
    setItem(name, value) {
      if (
        saved &&
        saved.version === value.version &&
        shallow(saved.state, value.state)
      )
        return;
      saved = value;
      return json.setItem(name, value);
    },
  };
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
      storage: preferenceStorage(),
      // Version 0 kept separate repeat and shuffle flags and an in-app volume,
      // now left to the device.
      migrate: (persisted): Preferences => {
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
          showTranslation: true,
          showFurigana: true,
        };
      },
      partialize: (s): Preferences => ({
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

// Tracks by id, rebuilt only when the track list itself changes.
const indexes = new WeakMap<Track[], Map<string, Track>>();
export function trackIndex(tracks: Track[]) {
  let index = indexes.get(tracks);
  if (!index) {
    index = new Map(tracks.map((t) => [t.id, t]));
    indexes.set(tracks, index);
  }
  return index;
}
export const useTrackIndex = () => useMusic((s) => trackIndex(s.tracks));
export const currentTrack = (s: MusicState) =>
  s.current ? trackIndex(s.tracks).get(s.current) : undefined;
