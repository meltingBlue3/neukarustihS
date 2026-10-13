// Lyric sidecars: the LRC and enhanced lyrics files that sit beside a song.
import { fileId, pathOf } from "./files";
import { isEnhancedLyrics } from "./lyrics";
import type {
  MusicDirectoryHandle,
  MusicHandle,
  MusicSource,
  Track,
} from "./types";

// A sidecar shares its song's name: "夜曲.mp3" ↔ "夜曲.lrc" and
// "夜曲.lyrics.json". Names compare case-insensitively, like most of the file
// systems music comes from.
const audioKey = (path: string) => path.replace(/\.[^./]+$/, "").toLowerCase();
const sidecarKey = (path: string) =>
  path.replace(/\.(lrc|lyrics\.json)$/i, "").toLowerCase();
const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

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
  const path = pathOf(sidecar);
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
  const sourcePath = pathOf(song) ?? "";
  const siblings = incoming
    .filter(
      (source) =>
        folderOf(pathOf(source) ?? "") === folderOf(sourcePath) &&
        lyricFileKind(track.name, source.file.name),
    )
    .map((source) => source.file);
  return { song, siblings, sourcePath };
}
