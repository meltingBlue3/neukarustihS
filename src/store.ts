import { create } from "zustand";
import { persist } from "zustand/middleware";
import { set, del, values, createStore } from "idb-keyval";
import { fileId, isAudio, nextTrack } from "./lib";
import type { Track, Playlist, MusicSource } from "./lib";
import { isEnhancedLyrics, readEnhancedLyrics } from "./lyrics";
import type { EnhancedLyrics } from "./lyrics";
import { findSongSiblings, lyricFileKind, readSiblingLyrics } from "./files";

const database = createStore("neukarustihs-v1", "tracks");
const files = new Map<string, File>();
export const audio = new Audio();
audio.preload = "metadata";
let sourceUrl: string | undefined;
let playVersion = 0;
let sleepTimeout: ReturnType<typeof setTimeout> | undefined;

interface State {
  tracks: Track[];
  playlists: Playlist[];
  favorites: string[];
  queue: string[];
  current: string | null;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  playbackMode: "all" | "one" | "shuffle";
  showTranslation: boolean;
  showFurigana: boolean;
  history: string[];
  ready: boolean;
  importing: string;
  notice: string;
  sleepUntil: number | null;
  notify: (message: string) => void;
  toggleFavorite: (id: string) => void;
  createPlaylist: (name: string) => string;
  updatePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlist: string, id: string) => void;
  removeFromPlaylist: (playlist: string, id: string) => void;
  setVolume: (value: number) => void;
  cyclePlaybackMode: () => void;
}

export const useMusic = create<State>()(
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
      volume: 0.8,
      playbackMode: "all",
      showTranslation: true,
      showFurigana: true,
      history: [],
      ready: false,
      importing: "",
      notice: "",
      sleepUntil: null,
      notify: (notice) => setState({ notice }),
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
      setVolume: (volume) => {
        audio.volume = volume;
        setState({ volume });
      },
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
      name: "neukarustihs-preferences-v1",
      version: 1,
      migrate: (persisted) => {
        const saved = (
          persisted && typeof persisted === "object" ? persisted : {}
        ) as Partial<State> & { repeat?: unknown; shuffle?: unknown };
        const playbackMode: State["playbackMode"] =
          saved.repeat === "one"
            ? "one"
            : saved.shuffle === true
              ? "shuffle"
              : "all";
        return {
          playlists: saved.playlists ?? [],
          favorites: saved.favorites ?? [],
          volume: saved.volume ?? 0.8,
          current: saved.current ?? null,
          queue: saved.queue ?? [],
          playbackMode,
        };
      },
      partialize: (s) => ({
        playlists: s.playlists,
        favorites: s.favorites,
        volume: s.volume,
        playbackMode: s.playbackMode,
        showTranslation: s.showTranslation,
        showFurigana: s.showFurigana,
        current: s.current,
        queue: s.queue,
      }),
    },
  ),
);

export async function initialize() {
  try {
    const tracks = await values<Track>(database);
    const saved = useMusic.getState();
    useMusic.setState({
      tracks,
      ready: true,
      queue: saved.queue.filter((id) => tracks.some((t) => t.id === id)),
      current: tracks.some((t) => t.id === saved.current)
        ? saved.current
        : null,
    });
    // Volume is now controlled by the device; ignore the old in-app setting,
    // which may have been muted before the volume slider was removed.
    audio.volume = 1;
  } catch {
    useMusic.setState({
      ready: true,
      notice: "本地存储不可用。请检查浏览器存储权限。",
    });
  }
}

export async function importMusic(incoming: MusicSource[]) {
  if (useMusic.getState().importing) return;
  const music = incoming.filter((x) => isAudio(x.file));
  const lyrics = incoming.filter((x) => /\.lrc$/i.test(x.file.name));
  const enhanced = incoming.filter((x) => isEnhancedLyrics(x.file.name));
  if (!music.length && !lyrics.length && !enhanced.length) {
    useMusic.getState().notify("请选择音乐、LRC 或 .lyrics.json 歌词增强文件");
    return;
  }
  let added = 0,
    reconnected = 0,
    failed = 0;
  useMusic.setState({ importing: "正在读取音乐…" });
  try {
    const { parseBlob } = await import("music-metadata");
    for (let i = 0; i < music.length; i++) {
      const { file, handle, relativePath, directoryHandle } = music[i];
      const sourcePath = relativePath || file.webkitRelativePath || undefined;
      useMusic.setState({ importing: `正在读取 ${i + 1} / ${music.length}` });
      const id = fileId(file);
      files.set(id, file);
      const existing = useMusic.getState().tracks.find((t) => t.id === id);
      if (existing) {
        if (handle || sourcePath || directoryHandle) {
          const updated = {
            ...existing,
            handle: handle || existing.handle,
            directoryHandle: directoryHandle || existing.directoryHandle,
            sourcePath: sourcePath || existing.sourcePath,
          };
          await set(id, updated, database);
          useMusic.setState((s) => ({
            tracks: s.tracks.map((t) => (t.id === id ? updated : t)),
          }));
        }
        reconnected++;
        continue;
      }
      let track: Track = {
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
        sourcePath,
      };
      try {
        const metadata = await parseBlob(file, { duration: false });
        const { common, format } = metadata;
        const picture = common.picture?.[0];
        const embeddedLyrics = common.lyrics?.[0];
        track = {
          ...track,
          title: common.title || track.title,
          artist: common.artist || track.artist,
          album: common.album || track.album,
          duration: format.duration || 0,
          cover: picture
            ? new Blob([new Uint8Array(picture.data)], { type: picture.format })
            : undefined,
          lyrics: embeddedLyrics?.text,
        };
      } catch {
        /* File can still be decoded by the browser without readable tags. */
      }
      try {
        await set(id, track, database);
      } catch {
        failed++;
      }
      useMusic.setState((s) => ({ tracks: [...s.tracks, track] }));
      added++;
    }
    let matched = 0;
    for (const { file, relativePath } of lyrics) {
      const stem = file.name.replace(/\.lrc$/i, "").toLowerCase();
      const lyricPath = relativePath || file.webkitRelativePath;
      const matches = useMusic
        .getState()
        .tracks.filter((t) =>
          lyricPath
            ? t.sourcePath?.replace(/\.[^/.]+$/, "") ===
              lyricPath.replace(/\.lrc$/i, "")
            : t.name.replace(/\.[^.]+$/, "").toLowerCase() === stem,
        );
      for (const track of matches) {
        await saveLyrics(track.id, await file.text());
        matched++;
      }
    }
    let enhancedMatched = 0,
      enhancedFailed = 0,
      enhancedUnmatched = 0;
    const selectedIds = new Set(music.map(({ file }) => fileId(file)));
    for (const { file, relativePath } of enhanced) {
      try {
        const data = await readEnhancedLyrics(file);
        const lyricPath = relativePath || file.webkitRelativePath;
        const stem = file.name.replace(/\.lyrics\.json$/i, "").toLowerCase();
        const candidates = useMusic
          .getState()
          .tracks.filter((t) =>
            lyricPath
              ? t.sourcePath?.replace(/\.[^/.]+$/, "").toLowerCase() ===
                lyricPath.replace(/\.lyrics\.json$/i, "").toLowerCase()
              : t.name.replace(/\.[^.]+$/, "").toLowerCase() === stem,
          );
        const selected = candidates.filter((t) => selectedIds.has(t.id));
        const matches = !lyricPath && selected.length ? selected : candidates;
        // A lone sidecar cannot identify which of several same-named tracks
        // it belongs to. The track's own import action can resolve that case.
        if (!matches.length || (!lyricPath && matches.length > 1)) {
          enhancedUnmatched++;
          continue;
        }
        for (const track of matches) {
          await saveEnhancedLyrics(track.id, data);
          enhancedMatched++;
        }
      } catch {
        enhancedFailed++;
      }
    }
    useMusic
      .getState()
      .notify(
        [
          added && `已导入 ${added} 首`,
          reconnected && `已连接 ${reconnected} 首`,
          matched && `已匹配 ${matched} 份歌词`,
          enhancedMatched && `已匹配 ${enhancedMatched} 份翻译与注音`,
          enhancedUnmatched &&
            `${enhancedUnmatched} 份增强歌词未找到唯一同名歌曲，请在对应歌曲的歌词页导入`,
          enhancedFailed &&
            `${enhancedFailed} 份增强歌词读取或保存失败，请检查文件格式（版本 1，最大 2 MB）`,
          lyrics.length && !matched && "未找到同名歌曲，请在歌词页单独导入",
          failed && "部分歌曲未能保存，下次需重新导入",
        ]
          .filter(Boolean)
          .join(" · ") || "导入完成",
      );
  } catch {
    useMusic.getState().notify("导入未完成，请重新选择文件重试");
  } finally {
    useMusic.setState({ importing: "" });
  }
}

export async function saveLyrics(id: string, lyrics: string) {
  const track = useMusic.getState().tracks.find((t) => t.id === id);
  if (!track) return;
  const updated = {
    ...track,
    lyrics,
    enhancedLyrics: lyrics === track.lyrics ? track.enhancedLyrics : undefined,
  };
  await set(id, updated, database);
  useMusic.setState((s) => ({
    tracks: s.tracks.map((t) => (t.id === id ? updated : t)),
  }));
}

export async function saveEnhancedLyrics(
  id: string,
  enhancedLyrics: EnhancedLyrics,
) {
  const track = useMusic.getState().tracks.find((t) => t.id === id);
  if (!track) return;
  const updated = { ...track, enhancedLyrics };
  await set(id, updated, database);
  useMusic.setState((s) => ({
    tracks: s.tracks.map((t) => (t.id === id ? updated : t)),
  }));
}

export async function syncTrackLyrics(
  id: string,
  incoming?: MusicSource[],
): Promise<"done" | "needs-folder"> {
  const track = useMusic.getState().tracks.find((t) => t.id === id);
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
        if (
          (await directory.queryPermission({ mode: "read" })) !== "granted" &&
          (await directory.requestPermission({ mode: "read" })) !== "granted"
        )
          return "needs-folder";
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
    const latest = useMusic.getState().tracks.find((t) => t.id === id);
    if (!latest) return "done";
    const updated = {
      ...latest,
      ...source,
      ...(lyrics !== undefined
        ? {
            lyrics,
            enhancedLyrics:
              lyrics === latest.lyrics ? latest.enhancedLyrics : undefined,
          }
        : {}),
      ...(enhancedLyrics ? { enhancedLyrics } : {}),
    };
    await set(id, updated, database);
    useMusic.setState((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? updated : t)),
    }));
    useMusic
      .getState()
      .notify(
        candidates.length
          ? `已同步${[lrc.length && "歌词", enhanced.length && "翻译与注音"].filter(Boolean).join("、")}`
          : "同目录未找到同名 LRC 或 .lyrics.json，已保留原有歌词",
      );
  } catch (error) {
    useMusic
      .getState()
      .notify(
        error instanceof Error
          ? `${error.message}；未修改已有歌词`
          : "同步失败，未修改已有歌词",
      );
  } finally {
    useMusic.setState({ importing: "" });
  }
  return "done";
}

export async function play(
  id: string,
  context?: string[],
  fromHistory = false,
) {
  const state = useMusic.getState();
  const track = state.tracks.find((t) => t.id === id);
  if (!track) return;
  const version = ++playVersion;
  try {
    let file = files.get(id);
    if (!file && track.handle) {
      const permission = await track.handle.queryPermission({ mode: "read" });
      if (
        permission === "granted" ||
        (await track.handle.requestPermission({ mode: "read" })) === "granted"
      ) {
        file = await track.handle.getFile();
        files.set(id, file);
      }
    }
    if (version !== playVersion) return;
    if (!file) {
      state.notify(
        "需要重新连接文件：点击「导入音乐」，选择原来的音乐文件或文件夹。歌单和收藏会保留。",
      );
      return;
    }
    if (state.current !== id || !audio.src) {
      audio.pause();
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      sourceUrl = URL.createObjectURL(file);
      audio.src = sourceUrl;
      useMusic.setState({
        current: id,
        position: 0,
        duration: track.duration,
        history: fromHistory
          ? state.history
          : [...state.history, ...(state.current ? [state.current] : [])].slice(
              -200,
            ),
      });
    }
    if (context) useMusic.setState({ queue: context });
    else if (!state.queue.includes(id))
      useMusic.setState({ queue: state.tracks.map((t) => t.id) });
    if ("mediaSession" in navigator) {
      const artwork = track.cover
        ? [{ src: URL.createObjectURL(track.cover), type: track.cover.type }]
        : [
            {
              src: new URL(
                `${import.meta.env.BASE_URL}icon-music-512.png`,
                location.origin,
              ).href,
              sizes: "512x512",
              type: "image/png",
            },
          ];
      const previousArt = navigator.mediaSession.metadata?.artwork[0]?.src;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork,
      });
      if (previousArt?.startsWith("blob:")) URL.revokeObjectURL(previousArt);
    }
    await audio.play();
  } catch (error) {
    if (
      version !== playVersion ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      return;
    useMusic.setState({ playing: false });
    useMusic
      .getState()
      .notify(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "请点击播放，或重新授权音乐文件访问。"
          : "暂时无法播放。请重新连接文件，或尝试浏览器支持的音频格式。",
      );
  }
}
export function togglePlay() {
  const s = useMusic.getState();
  if (s.playing) {
    ++playVersion;
    audio.pause();
  } else if (s.current) void play(s.current);
  else if (s.tracks.length)
    void play(
      s.tracks[0].id,
      s.tracks.map((t) => t.id),
    );
  else s.notify("先导入几首喜欢的音乐吧");
}
export function skip(direction: number, ended = false) {
  const s = useMusic.getState();
  if (direction < 0 && audio.currentTime > 3) {
    seek(0);
    return;
  }
  if (ended && s.playbackMode === "one" && s.current) {
    seek(0);
    void play(s.current);
    return;
  }
  let target: string | null;
  if (s.playbackMode === "shuffle" && direction < 0 && s.history.length) {
    target = s.history[s.history.length - 1];
    useMusic.setState({ history: s.history.slice(0, -1) });
    void play(target, undefined, true);
    return;
  }
  if (s.playbackMode === "shuffle" && s.queue.length > 1) {
    const remaining = s.queue.filter(
      (id) => id !== s.current && !s.history.includes(id),
    );
    const candidates = remaining.length
      ? remaining
      : s.queue.filter((id) => id !== s.current);
    if (!remaining.length) useMusic.setState({ history: [] });
    target = candidates[Math.floor(Math.random() * candidates.length)];
  } else target = nextTrack(s.queue, s.current, direction, "all");
  if (target) void play(target);
}
export function seek(time: number) {
  if (!audio.src || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(time, audio.duration));
  useMusic.setState({ position: audio.currentTime });
}
export function enqueue(id: string) {
  useMusic.setState((s) => ({
    queue: [...s.queue.filter((t) => t !== id), id],
    notice: "已添加到播放队列",
  }));
}
export async function removeTrack(id: string) {
  if (useMusic.getState().current === id) {
    ++playVersion;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
      sourceUrl = undefined;
    }
    useMusic.setState({ current: null, position: 0, duration: 0 });
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  }
  await del(id, database);
  files.delete(id);
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
export function setSleep(minutes: number) {
  clearTimeout(sleepTimeout);
  useMusic.setState({
    sleepUntil: minutes ? Date.now() + minutes * 60_000 : null,
  });
  if (minutes)
    sleepTimeout = setTimeout(() => {
      audio.pause();
      useMusic.setState({ sleepUntil: null, notice: "睡眠定时已结束，晚安。" });
    }, minutes * 60_000);
}

audio.addEventListener("play", () => {
  useMusic.setState({ playing: true });
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = "playing";
});
audio.addEventListener("pause", () => {
  useMusic.setState({ playing: false });
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = "paused";
});
audio.addEventListener("timeupdate", () => {
  useMusic.setState({ position: audio.currentTime });
  if (
    "mediaSession" in navigator &&
    navigator.mediaSession.setPositionState &&
    Number.isFinite(audio.duration) &&
    audio.duration > 0
  ) {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: 1,
      position: Math.min(audio.currentTime, audio.duration),
    });
  }
});
audio.addEventListener("loadedmetadata", () => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  useMusic.setState({ duration });
});
audio.addEventListener("ended", () => skip(1, true));
audio.addEventListener("error", () => {
  if (audio.getAttribute("src"))
    useMusic
      .getState()
      .notify("这个文件无法解码，请尝试 MP3、M4A、FLAC 或 WAV 格式。");
});
if ("mediaSession" in navigator) {
  const actions: Partial<
    Record<MediaSessionAction, MediaSessionActionHandler>
  > = {
    play: () => {
      const s = useMusic.getState();
      if (s.current) void play(s.current);
    },
    pause: () => audio.pause(),
    previoustrack: () => skip(-1),
    nexttrack: () => skip(1),
    seekto: (e) => seek(e.seekTime ?? 0),
    seekbackward: (e) => seek(audio.currentTime - (e.seekOffset ?? 10)),
    seekforward: (e) => seek(audio.currentTime + (e.seekOffset ?? 10)),
  };
  for (const [action, handler] of Object.entries(actions)) {
    try {
      navigator.mediaSession.setActionHandler(
        action as MediaSessionAction,
        handler,
      );
    } catch {
      /* Browser-specific action support. */
    }
  }
}
