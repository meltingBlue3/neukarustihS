// The music library: importing songs and lyrics, keeping them in IndexedDB,
// and removing them again.
import { createStore, del, set, setMany, values } from "idb-keyval";
import { notify } from "../notice";
import { releaseCover } from "./covers";
import {
  ensureReadPermission,
  fileId,
  forgetFile,
  isAudio,
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

async function readNewTrack(id: string, source: MusicSource): Promise<Track> {
  const { file, handle, directoryHandle } = source;
  const track: Track = {
    id,
    name: file.name,
    title: file.name.replace(/\.[^.]+$/, ""),
    artist: "未知艺术家",
    album: "本地音乐",
    size: file.size,
    modified: file.lastModified,
    duration: 0,
    added: Date.now(),
    handle,
    directoryHandle,
    sourcePath: pathOf(source),
  };
  try {
    const { parseBlob } = await import("music-metadata");
    const { common, format } = await parseBlob(file, { duration: false });
    const picture = common.picture?.[0];
    return {
      ...track,
      title: common.title || track.title,
      artist: common.artist || track.artist,
      album: common.album || track.album,
      duration: format.duration || 0,
      cover: picture
        ? new Blob([new Uint8Array(picture.data)], { type: picture.format })
        : undefined,
      lyrics: common.lyrics?.[0]?.text,
    };
  } catch {
    // The browser may still decode a file whose tags are unreadable.
    return track;
  }
}

// Imports save and show tracks in batches: refreshing the whole library after
// every file would make large imports quadratic.
function batchedWrites() {
  const pending = new Map<string, Track>();
  let lastFlush = performance.now();
  return {
    // A track's latest version, including changes not yet flushed.
    get: (id: string) => pending.get(id) ?? findTrack(id),
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
      useMusic.setState((s) => {
        const known = trackIndex(s.tracks);
        return {
          tracks: [
            ...s.tracks.map((t) => batch.get(t.id) ?? t),
            ...[...batch.values()].filter((t) => !known.has(t.id)),
          ],
        };
      });
      lastFlush = performance.now();
      return unsaved;
    },
  };
}

// Import songs and lyric sidecars in one go. Songs already in the library are
// reconnected to the newly chosen file instead of added twice.
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
    for (const [i, source] of music.entries()) {
      useMusic.setState({ importing: `正在读取 ${i + 1} / ${music.length}` });
      const id = fileId(source.file);
      rememberFile(id, source.file);
      const existing = writes.get(id);
      if (existing) {
        const { handle, directoryHandle } = source;
        const sourcePath = pathOf(source);
        if (handle || sourcePath || directoryHandle)
          writes.put({
            ...existing,
            handle: handle || existing.handle,
            directoryHandle: directoryHandle || existing.directoryHandle,
            sourcePath: sourcePath || existing.sourcePath,
          });
        counts.reconnected++;
      } else {
        writes.put(await readNewTrack(id, source));
        counts.added++;
      }
      counts.unsaved += await writes.flush();
    }
    counts.unsaved += await writes.flush(true);
    const importedTogether = new Set(music.map(({ file }) => fileId(file)));
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
      const { song, siblings, sourcePath } = findSongSiblings(track, incoming);
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
