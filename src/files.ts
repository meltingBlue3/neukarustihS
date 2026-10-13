import { fileId } from "./lib";
import { isEnhancedLyrics } from "./lyrics";
import type {
  MusicDirectoryHandle,
  MusicHandle,
  MusicSource,
  Track,
} from "./lib";

// How long to wait on the browser's access prompt before offering manual
// selection instead. Long enough to read and answer the prompt.
export const PERMISSION_TIMEOUT_MS = 20_000;

// Handles restored from IndexedDB usually come back as "prompt" (Chrome also
// resets them on reload). An unanswered prompt never settles, so stop waiting
// after a while; callers then fall back to asking for the file or folder.
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

export async function readMusicFolder(directory: MusicDirectoryHandle) {
  const incoming: MusicSource[] = [];
  let skipped = 0;
  async function walk(dir: MusicDirectoryHandle, path: string) {
    for await (const handle of dir.values()) {
      try {
        if (handle.kind === "directory") {
          await walk(handle as MusicDirectoryHandle, `${path}/${handle.name}`);
        } else if (
          /\.(mp3|flac|m4a|aac|ogg|opus|wav|webm|aiff?|lrc|lyrics\.json)$/i.test(
            handle.name,
          )
        ) {
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

// A lyric sidecar shares its song's name: "夜曲.mp3" ↔ "夜曲.lrc" and
// "夜曲.lyrics.json". Names compare case-insensitively, like most of the file
// systems music comes from.
const audioKey = (path: string) => path.replace(/\.[^./]+$/, "").toLowerCase();
const sidecarKey = (path: string) =>
  path.replace(/\.(lrc|lyrics\.json)$/i, "").toLowerCase();

export const sidecarKind = (name: string) =>
  /\.lrc$/i.test(name) ? "lrc" : isEnhancedLyrics(name) ? "enhanced" : null;

export function lyricFileKind(songName: string, name: string) {
  return sidecarKey(name) === audioKey(songName) ? sidecarKind(name) : null;
}

// Folder imports know each file's path, so a sidecar only matches the song in
// its own directory, never a same-named song from another album; lone files
// match by name. A sidecar belongs to exactly one song: prefer songs imported
// together with it, and leave the rest ambiguous for the song's own lyric
// import rather than guess.
export function findSidecarTrack(
  sidecar: MusicSource,
  tracks: Track[],
  importedTogether: Set<string>,
) {
  const path = sidecar.relativePath || sidecar.file.webkitRelativePath;
  const key = sidecarKey(path || sidecar.file.name);
  const candidates = tracks.filter((track) => {
    const own = path ? track.sourcePath : track.name;
    return !!own && audioKey(own) === key;
  });
  const together = candidates.filter((t) => importedTogether.has(t.id));
  const pool = together.length ? together : candidates;
  return pool.length === 1 ? pool[0] : undefined;
}

export async function readSiblingLyrics(
  track: Track,
  directory: MusicDirectoryHandle,
) {
  const result: File[] = [];
  for await (const handle of directory.values()) {
    if (handle.kind === "file" && lyricFileKind(track.name, handle.name))
      result.push(await (handle as MusicHandle).getFile());
  }
  return result;
}

// A directory upload is a snapshot, not a reusable permission. Find the exact
// audio file first, then use only siblings; never match across album folders.
export function findSongSiblings(track: Track, incoming: MusicSource[]) {
  const matches = incoming.filter((source) => fileId(source.file) === track.id);
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "所选文件夹里有多份相同歌曲，请只选择这首歌直接所在的文件夹"
        : "所选文件夹中未找到这首歌，请选择歌曲所在文件夹",
    );
  const song = matches[0];
  const sourcePath = song.relativePath || song.file.webkitRelativePath;
  const parent = sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1);
  const siblings = incoming
    .filter((source) => {
      const path = source.relativePath || source.file.webkitRelativePath;
      return (
        path.slice(0, path.lastIndexOf("/") + 1) === parent &&
        lyricFileKind(track.name, source.file.name)
      );
    })
    .map((source) => source.file);
  return { song, siblings, sourcePath };
}
