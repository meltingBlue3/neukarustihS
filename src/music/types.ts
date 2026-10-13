import type { EnhancedLyrics } from "./lyrics";

export type MusicHandle = FileSystemFileHandle & {
  queryPermission: (options: { mode: "read" }) => Promise<PermissionState>;
  requestPermission: (options: { mode: "read" }) => Promise<PermissionState>;
};
export type MusicDirectoryHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<MusicHandle | MusicDirectoryHandle>;
  queryPermission: (options: { mode: "read" }) => Promise<PermissionState>;
  requestPermission: (options: { mode: "read" }) => Promise<PermissionState>;
};

// A library entry. Audio is never copied: it plays from a file chosen this
// session or from the stored handle, so `name`, `size` and `modified` record
// which file the entry was read from.
export interface Track {
  id: string;
  name: string;
  title: string;
  artist: string;
  album: string;
  size: number;
  modified: number;
  duration: number;
  added: number;
  cover?: Blob;
  lyrics?: string;
  enhancedLyrics?: EnhancedLyrics;
  handle?: MusicHandle;
  // The song's own folder, kept to re-read its lyric sidecars later.
  directoryHandle?: MusicDirectoryHandle;
  // Path within the imported folder, e.g. "Music/Album/Song.mp3".
  sourcePath?: string;
}

// A file offered for import, with whatever the browser could tell about where
// it came from.
export interface MusicSource {
  file: File;
  handle?: MusicHandle;
  directoryHandle?: MusicDirectoryHandle;
  relativePath?: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: string[];
}
