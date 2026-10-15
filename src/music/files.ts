// Reading the user's music files: browser pickers, folders, and permissions.
import type {
  MusicDirectoryHandle,
  MusicHandle,
  MusicSource,
  Track,
} from "./types";

export const AUDIO_EXTENSIONS = [
  ".mp3",
  ".flac",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".wav",
  ".webm",
  ".aiff",
  ".aif",
];
const audioName = new RegExp(
  `(${AUDIO_EXTENSIONS.map((e) => e.replace(".", "\\.")).join("|")})$`,
  "i",
);
const lyricName = /\.(lrc|lyrics\.json)$/i;

export const isAudio = (file: File) =>
  file.type.startsWith("audio/") || audioName.test(file.name);

// Where a source sits within an imported folder, if it came from one.
export const pathOf = (source: MusicSource) =>
  source.relativePath || source.file.webkitRelativePath || undefined;

// Whether a file is exactly the one a library entry was read from. Files are
// not hashed: the same name, size and modification time count as the same.
export const isSameFile = (track: Track, file: File) =>
  track.name === file.name &&
  track.size === file.size &&
  track.modified === file.lastModified;

// Whether a source sits where an entry's file was, even if the file changed
// since (say, its tags were edited): the same file system entry when both
// have handles, otherwise the same path within an imported folder.
export async function isSameLocation(track: Track, source: MusicSource) {
  if (track.handle && source.handle)
    return track.handle.isSameEntry(source.handle).catch(() => false);
  const path = pathOf(source);
  return !!path && path === track.sourcePath;
}

// How long to wait on the browser's access prompt before offering manual
// selection instead. Long enough to read and answer the prompt.
export const PERMISSION_TIMEOUT_MS = 20_000;

// Handles restored from IndexedDB usually come back as "prompt" (Chrome resets
// them once no tab of the app is open). An unanswered prompt never settles, so
// stop waiting after a while; callers then fall back to asking for the file or
// folder.
export async function ensureReadPermission(
  handle: Pick<MusicHandle, "queryPermission" | "requestPermission">,
  timeoutMs = PERMISSION_TIMEOUT_MS,
) {
  if ((await handle.queryPermission({ mode: "read" })) === "granted")
    return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const result = await Promise.race([
      handle.requestPermission({ mode: "read" }),
      timeout,
    ]);
    return result === "granted";
  } finally {
    clearTimeout(timer);
  }
}

// Files chosen this session play directly. Otherwise reopen the stored
// handle, which may need the user's permission again; without `ask`, only a
// handle that is already readable is used, since prompting needs a gesture.
const sessionFiles = new Map<string, File>();
export const rememberFile = (id: string, file: File) =>
  sessionFiles.set(id, file);
export const forgetFile = (id: string) => sessionFiles.delete(id);
export async function getTrackFile(track: Track, ask = true) {
  let file = sessionFiles.get(track.id);
  if (
    !file &&
    track.handle &&
    (ask
      ? await ensureReadPermission(track.handle)
      : (await track.handle.queryPermission({ mode: "read" })) === "granted")
  ) {
    file = await track.handle.getFile();
    sessionFiles.set(track.id, file);
  }
  return file;
}

// The File System Access pickers keep handles for later playback and lyric
// sync. Without them, callers fall back to a plain file input.
type Picked<T> = T | "cancelled" | "unavailable";
type PickerWindow = Window & {
  showOpenFilePicker?: (options: unknown) => Promise<MusicHandle[]>;
  showDirectoryPicker?: () => Promise<MusicDirectoryHandle>;
};
const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export async function pickMusicFiles(): Promise<Picked<MusicSource[]>> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) return "unavailable";
  try {
    const handles = await picker({
      multiple: true,
      types: [
        {
          description: "音乐和歌词",
          accept: {
            "audio/*": AUDIO_EXTENSIONS,
            "text/plain": [".lrc"],
            "application/json": [".json"],
          },
        },
      ],
    });
    return await Promise.all(
      handles.map(async (handle) => ({ file: await handle.getFile(), handle })),
    );
  } catch (error) {
    if (isAbort(error)) return "cancelled";
    throw error;
  }
}

export async function pickFolder(): Promise<Picked<MusicDirectoryHandle>> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return "unavailable";
  try {
    return await picker();
  } catch (error) {
    if (isAbort(error)) return "cancelled";
    throw error;
  }
}

// Every song and lyric sidecar below a folder. Unreadable entries are counted
// and skipped rather than failing the whole folder.
export async function readMusicFolder(directory: MusicDirectoryHandle) {
  const incoming: MusicSource[] = [];
  let skipped = 0;
  async function walk(dir: MusicDirectoryHandle, path: string) {
    for await (const handle of dir.values()) {
      try {
        if (handle.kind === "directory") {
          await walk(handle as MusicDirectoryHandle, `${path}/${handle.name}`);
        } else if (audioName.test(handle.name) || lyricName.test(handle.name)) {
          const fileHandle = handle as MusicHandle;
          incoming.push({
            file: await fileHandle.getFile(),
            handle: fileHandle,
            directoryHandle: dir,
            relativePath: `${path}/${handle.name}`,
          });
        }
      } catch {
        skipped++;
      }
    }
  }
  await walk(directory, directory.name);
  return { incoming, skipped };
}
