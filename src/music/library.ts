// The music library: importing songs and lyrics, keeping them in IndexedDB,
// and removing them again.
import { createStore, del, set, setMany, values } from "idb-keyval";
import { notify } from "../notice";
import { releaseCover } from "./covers";
import {
  ensureReadPermission,
  forgetFile,
  isAudio,
  isSameFile,
  isSameLocation,
  pathOf,
  readMusicFolder,
  rememberFile,
} from "./files";
import { isEnhancedLyrics, readEnhancedLyrics } from "./lyrics";
import type { EnhancedLyrics } from "./lyrics";
import { unload } from "./playback";
import {
  findSidecarTrack,
  findSongSiblings,
  lyricFileKind,
  readSiblingLyrics,
  sidecarKind,
} from "./sidecars";
import { trackIndex, useMusic } from "./store";
import type { MusicDirectoryHandle, MusicSource, Track } from "./types";

const database = createStore("neukarustihs-v1", "tracks");

const findTrack = (id: string) =>
  trackIndex(useMusic.getState().tracks).get(id);

async function storeTrack(track: Track) {
  await set(track.id, track, database);
  useMusic.setState((s) => ({
    tracks: s.tracks.map((t) => (t.id === track.id ? track : t)),
  }));
}

// New LRC text replaces enhanced lyrics, which were made for the old text.
// Re-importing the same LRC keeps them.
const withLyrics = (track: Track, lyrics: string): Track => ({
  ...track,
  lyrics,
  enhancedLyrics: lyrics === track.lyrics ? track.enhancedLyrics : undefined,
});

export async function initialize() {
  try {
    const tracks = await values<Track>(database);
    const known = trackIndex(tracks);
    const saved = useMusic.getState();
    useMusic.setState({
      tracks,
      ready: true,
      queue: saved.queue.filter((id) => known.has(id)),
      current: saved.current && known.has(saved.current) ? saved.current : null,
    });
  } catch {
    useMusic.setState({ ready: true });
    notify("本地存储不可用。请检查浏览器存储权限。");
  }
}

// What a file's tags say about its song. The browser may still decode a file
// whose tags are unreadable, so failing to read them is not an error.
async function readTags(file: File) {
  try {
    const { parseBlob } = await import("music-metadata");
    const { common, format } = await parseBlob(file, { duration: false });
    const picture = common.picture?.[0];
    return {
      title: common.title,
      artist: common.artist,
      album: common.album,
      duration: format.duration,
      cover: picture
        ? new Blob([new Uint8Array(picture.data)], { type: picture.format })
        : undefined,
      lyrics: common.lyrics?.[0]?.text,
    };
  } catch {
    return {};
  }
}

// Everything a track knows about its file: which file it is and where.
const fileFields = (source: MusicSource, previous?: Track) => ({
  name: source.file.name,
  size: source.file.size,
  modified: source.file.lastModified,
  handle: source.handle || previous?.handle,
  directoryHandle: source.directoryHandle || previous?.directoryHandle,
  sourcePath: pathOf(source) || previous?.sourcePath,
});

// Read a song's file into a library entry. A file that changed in place keeps
// its entry, so favorites, playlists and imported lyrics stay with it.
async function readTrack(source: MusicSource, previous?: Track) {
  const tags = await readTags(source.file);
  const track: Track = {
    id: previous?.id ?? crypto.randomUUID(),
    added: previous?.added ?? Date.now(),
    ...fileFields(source, previous),
    title: tags.title || source.file.name.replace(/\.[^.]+$/, ""),
    artist: tags.artist || "未知艺术家",
    album: tags.album || "本地音乐",
    duration: tags.duration || 0,
    cover: tags.cover,
    lyrics: previous?.lyrics ?? tags.lyrics,
    enhancedLyrics: previous?.enhancedLyrics,
  };
  return track;
}

// Tracks grouped by file name, the first thing any two copies of a file share.
const nameIndexes = new WeakMap<Track[], Map<string, Track[]>>();
function tracksNamed(tracks: Track[], name: string) {
  let index = nameIndexes.get(tracks);
  if (!index) {
    index = new Map();
    for (const track of tracks) {
      const named = index.get(track.name);
      if (named) named.push(track);
      else index.set(track.name, [track]);
    }
    nameIndexes.set(tracks, index);
  }
  return index.get(name) ?? [];
}

// Imports save and show tracks in batches: refreshing the whole library after
// every file would make large imports quadratic.
function batchedWrites() {
  const pending = new Map<string, Track>();
  let lastFlush = performance.now();
  return {
    // The entry a chosen file belongs to, including changes not yet flushed:
    // the very same file, or else whatever was at its location.
    async find(source: MusicSource) {
      const { name } = source.file;
      const stored = tracksNamed(useMusic.getState().tracks, name).map(
        (t) => pending.get(t.id) ?? t,
      );
      const candidates = [
        ...stored,
        ...[...pending.values()].filter(
          (t) => t.name === name && !stored.some((s) => s.id === t.id),
        ),
      ];
      const same = candidates.find((t) => isSameFile(t, source.file));
      if (same) return same;
      for (const track of candidates)
        if (await isSameLocation(track, source)) return track;
    },
    put: (track: Track) => void pending.set(track.id, track),
    // Save and show pending tracks, at most a few times a second unless
    // forced. Resolves to how many could not be saved.
    async flush(force = false) {
      if (!pending.size || (!force && performance.now() - lastFlush < 250))
        return 0;
      const batch = new Map(pending);
      pending.clear();
      let unsaved = 0;
      try {
        await setMany([...batch], database);
      } catch {
        // Still playable this session; importing again retries the save.
        unsaved = batch.size;
      }
      const { tracks } = useMusic.getState();
      const known = trackIndex(tracks);
      for (const track of batch.values()) {
        const previous = known.get(track.id)?.cover;
        if (previous !== track.cover) releaseCover(previous);
      }
      useMusic.setState({
        tracks: [
          ...tracks.map((t) => batch.get(t.id) ?? t),
          ...[...batch.values()].filter((t) => !known.has(t.id)),
        ],
      });
      lastFlush = performance.now();
      return unsaved;
    },
  };
}

// Import songs and lyric sidecars in one go. Songs already in the library are
// reconnected to the newly chosen file, or updated if their file changed,
// instead of added twice.
export async function importMusic(
  incoming: MusicSource[],
  { skipped = 0 } = {},
) {
  if (useMusic.getState().importing) return;
  const music = incoming.filter((x) => isAudio(x.file));
  // LRC before enhanced: a changed LRC clears a song's enhanced lyrics, which
  // must not discard enhanced lyrics imported in the same batch.
  const sidecars = [
    ...incoming.filter((x) => sidecarKind(x.file.name) === "lrc"),
    ...incoming.filter((x) => sidecarKind(x.file.name) === "enhanced"),
  ];
  if (!music.length && !sidecars.length) {
    notify("请选择音乐、LRC 或 .lyrics.json 歌词增强文件");
    return;
  }
  const counts = {
    added: 0,
    updated: 0,
    reconnected: 0,
    unsaved: 0,
    lrc: 0,
    enhanced: 0,
    unmatched: 0,
    lrcFailed: 0,
    enhancedFailed: 0,
  };
  useMusic.setState({ importing: "正在读取音乐…" });
  try {
    const writes = batchedWrites();
    const importedTogether = new Set<string>();
    for (const [i, source] of music.entries()) {
      useMusic.setState({ importing: `正在读取 ${i + 1} / ${music.length}` });
      const known = await writes.find(source);
      let track: Track;
      if (!known) {
        track = await readTrack(source);
        counts.added++;
      } else if (!isSameFile(known, source.file)) {
        track = await readTrack(source, known);
        counts.updated++;
      } else {
        // The same file, perhaps chosen from somewhere new.
        const relocated =
          source.handle || source.directoryHandle || pathOf(source);
        track = relocated ? { ...known, ...fileFields(source, known) } : known;
        counts.reconnected++;
      }
      if (track !== known) writes.put(track);
      importedTogether.add(track.id);
      rememberFile(track.id, source.file);
      counts.unsaved += await writes.flush();
    }
    counts.unsaved += await writes.flush(true);
    for (const sidecar of sidecars) {
      const kind = sidecarKind(sidecar.file.name);
      try {
        // Read and validate first, so a broken file reports as broken.
        const content =
          kind === "lrc"
            ? await sidecar.file.text()
            : await readEnhancedLyrics(sidecar.file);
        const track = findSidecarTrack(
          sidecar,
          useMusic.getState().tracks,
          importedTogether,
        );
        if (!track) counts.unmatched++;
        else if (typeof content === "string") {
          await saveLyrics(track.id, content);
          counts.lrc++;
        } else {
          await saveEnhancedLyrics(track.id, content);
          counts.enhanced++;
        }
      } catch {
        counts[kind === "lrc" ? "lrcFailed" : "enhancedFailed"]++;
      }
    }
    notify(
      [
        counts.added && `已导入 ${counts.added} 首`,
        counts.updated && `已更新 ${counts.updated} 首有变化的歌曲`,
        counts.reconnected && `已连接 ${counts.reconnected} 首`,
        counts.lrc && `已匹配 ${counts.lrc} 份歌词`,
        counts.enhanced && `已匹配 ${counts.enhanced} 份翻译与注音`,
        counts.unmatched &&
          `${counts.unmatched} 份歌词未找到唯一同名歌曲，请在对应歌曲的歌词页导入`,
        counts.lrcFailed && `${counts.lrcFailed} 份 LRC 歌词读取或保存失败`,
        counts.enhancedFailed &&
          `${counts.enhancedFailed} 份增强歌词读取或保存失败，请检查文件格式（版本 1，最大 2 MB）`,
        counts.unsaved && "部分歌曲未能保存，下次需重新导入",
        skipped && `${skipped} 个文件或子文件夹无法读取，已跳过`,
      ]
        .filter(Boolean)
        .join(" · ") || "导入完成",
    );
  } catch {
    notify("导入未完成，请重新选择文件重试");
  } finally {
    useMusic.setState({ importing: "" });
  }
}

// Throws when the folder itself cannot be read.
export async function importFolder(directory: MusicDirectoryHandle) {
  if (useMusic.getState().importing) return;
  useMusic.setState({ importing: "正在读取文件夹…" });
  let folder: Awaited<ReturnType<typeof readMusicFolder>>;
  try {
    folder = await readMusicFolder(directory);
  } finally {
    useMusic.setState({ importing: "" });
  }
  await importMusic(folder.incoming, { skipped: folder.skipped });
}

export async function saveLyrics(id: string, lyrics: string) {
  const track = findTrack(id);
  if (track) await storeTrack(withLyrics(track, lyrics));
}

export async function saveEnhancedLyrics(
  id: string,
  enhancedLyrics: EnhancedLyrics,
) {
  const track = findTrack(id);
  if (track) await storeTrack({ ...track, enhancedLyrics });
}

// The lyrics page's manual import, for one song.
export async function replaceLyrics(id: string, file: File) {
  try {
    if (isEnhancedLyrics(file.name))
      await saveEnhancedLyrics(id, await readEnhancedLyrics(file));
    else if (/\.(lrc|txt)$/i.test(file.name))
      await saveLyrics(id, await file.text());
    else {
      notify("请选择 LRC、TXT 或 .lyrics.json 歌词增强文件");
      return;
    }
    notify("歌词已保存");
  } catch (error) {
    notify(error instanceof Error ? error.message : "歌词保存失败，请重试");
  }
}

// Re-read the lyric sidecars beside a song, from its remembered folder or from
// a folder the user just chose. "needs-folder" means the remembered folder is
// unknown or no longer accessible, so ask the user to choose it.
export async function syncTrackLyrics(
  id: string,
  incoming?: MusicSource[],
): Promise<"done" | "needs-folder"> {
  const track = findTrack(id);
  if (!track || useMusic.getState().importing) return "done";
  if (!incoming && !track.directoryHandle) return "needs-folder";
  useMusic.setState({ importing: "正在同步歌词…" });
  try {
    let candidates: File[],
      source: Partial<Track> = {};
    if (incoming) {
      const { song, siblings, sourcePath } = await findSongSiblings(
        track,
        incoming,
      );
      candidates = siblings;
      source = {
        directoryHandle: song.directoryHandle,
        sourcePath: sourcePath || track.sourcePath,
      };
    } else {
      const directory = track.directoryHandle!;
      try {
        if (!(await ensureReadPermission(directory))) return "needs-folder";
        candidates = await readSiblingLyrics(track, directory);
      } catch (error) {
        if (
          error instanceof DOMException &&
          ["NotAllowedError", "NotFoundError", "SecurityError"].includes(
            error.name,
          )
        )
          return "needs-folder";
        throw error;
      }
    }
    const lrc = candidates.filter(
      (file) => lyricFileKind(track.name, file.name) === "lrc",
    );
    const enhanced = candidates.filter(
      (file) => lyricFileKind(track.name, file.name) === "enhanced",
    );
    if (lrc.length > 1 || enhanced.length > 1)
      throw new Error(
        "同目录中有多份同名歌词，请保留唯一的 LRC 和增强歌词文件",
      );
    // Read and validate both before a single write, so invalid sidecars or
    // storage failures never leave a half-updated song.
    const lyrics = lrc[0] ? await lrc[0].text() : undefined;
    const enhancedLyrics = enhanced[0]
      ? await readEnhancedLyrics(enhanced[0])
      : undefined;
    const latest = findTrack(id);
    if (!latest) return "done";
    let updated = { ...latest, ...source };
    if (lyrics !== undefined) updated = withLyrics(updated, lyrics);
    if (enhancedLyrics) updated = { ...updated, enhancedLyrics };
    await storeTrack(updated);
    notify(
      candidates.length
        ? `已同步${[lrc.length && "歌词", enhanced.length && "翻译与注音"].filter(Boolean).join("、")}`
        : "同目录未找到同名 LRC 或 .lyrics.json，已保留原有歌词",
    );
  } catch (error) {
    notify(
      error instanceof Error
        ? `${error.message}；未修改已有歌词`
        : "同步失败，未修改已有歌词",
    );
  } finally {
    useMusic.setState({ importing: "" });
  }
  return "done";
}

// Sync from a folder the user chose with the directory picker. False when the
// folder could not be read, so the user can choose again.
export async function syncLyricsFromFolder(
  id: string,
  directory: MusicDirectoryHandle,
) {
  if (useMusic.getState().importing) return false;
  useMusic.setState({ importing: "正在查找同名歌词…" });
  let folder: Awaited<ReturnType<typeof readMusicFolder>>;
  try {
    folder = await readMusicFolder(directory);
  } catch {
    notify("无法读取文件夹，请重新选择；已有歌词未修改");
    return false;
  } finally {
    useMusic.setState({ importing: "" });
  }
  if (folder.skipped) {
    notify("部分文件无法读取，请选择歌曲直接所在的文件夹重试；已有歌词未修改");
    return false;
  }
  await syncTrackLyrics(id, folder.incoming);
  return true;
}

export async function removeTrack(id: string) {
  if (useMusic.getState().current === id) unload();
  await del(id, database);
  forgetFile(id);
  releaseCover(findTrack(id)?.cover);
  useMusic.setState((s) => ({
    tracks: s.tracks.filter((t) => t.id !== id),
    favorites: s.favorites.filter((t) => t !== id),
    queue: s.queue.filter((t) => t !== id),
    history: s.history.filter((t) => t !== id),
    playlists: s.playlists.map((p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t !== id),
    })),
  }));
}
