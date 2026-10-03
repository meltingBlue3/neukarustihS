import { fileId } from "./lib";
import type {
  MusicDirectoryHandle,
  MusicHandle,
  MusicSource,
  Track,
} from "./lib";

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

export function lyricFileKind(songName: string, name: string) {
  const stem = songName.replace(/\.[^.]+$/, "").toLowerCase();
  const normalized = name.toLowerCase();
  return normalized === `${stem}.lrc`
    ? "lrc"
    : normalized === `${stem}.lyrics.json`
      ? "enhanced"
      : null;
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
