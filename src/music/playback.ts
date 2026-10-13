// The single audio element and everything that drives it: transport, queue,
// sleep timer and the system media controls.
import { notify } from "../notice";
import { getTrackFile } from "./files";
import { chooseSkip } from "./queue";
import { useMusic } from "./store";
import type { Track } from "./types";

export const audio = new Audio();
audio.preload = "metadata";
let sourceUrl: string | undefined;
// Bumped by every play or pause, so a slow file lookup cannot resume a track
// the user has moved on from.
let playVersion = 0;
let sleepTimeout: ReturnType<typeof setTimeout> | undefined;

export async function play(
  id: string,
  context?: string[],
  fromHistory = false,
) {
  const track = useMusic.getState().tracks.find((t) => t.id === id);
  if (!track) return;
  const version = ++playVersion;
  try {
    const file = await getTrackFile(track);
    if (version !== playVersion) return;
    if (!file) {
      notify(
        "需要重新连接文件：点击「导入音乐」，选择原来的音乐文件或文件夹。歌单和收藏会保留。",
      );
      return;
    }
    const state = useMusic.getState();
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
    showInSystemControls(track);
    await audio.play();
  } catch (error) {
    if (
      version !== playVersion ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      return;
    useMusic.setState({ playing: false });
    notify(
      error instanceof DOMException && error.name === "NotAllowedError"
        ? "请点击播放，或重新授权音乐文件访问。"
        : "暂时无法播放。请重新连接文件，或尝试浏览器支持的音频格式。",
    );
  }
}

export function pause() {
  ++playVersion;
  audio.pause();
}

export function togglePlay() {
  const s = useMusic.getState();
  if (s.playing) pause();
  else if (s.current) void play(s.current);
  else if (s.tracks.length)
    void play(
      s.tracks[0].id,
      s.tracks.map((t) => t.id),
    );
  else notify("先导入几首喜欢的音乐吧");
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
  const { target, history, fromHistory } = chooseSkip(s, direction);
  if (history !== s.history) useMusic.setState({ history });
  if (target) void play(target, undefined, fromHistory);
}

export function seek(time: number) {
  if (!audio.src || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(time, audio.duration));
  useMusic.setState({ position: audio.currentTime });
}

export function enqueue(id: string) {
  useMusic.setState((s) => ({
    queue: [...s.queue.filter((t) => t !== id), id],
  }));
  notify("已添加到播放队列");
}

// Stop and unload the current track, e.g. when it leaves the library.
export function unload() {
  pause();
  audio.removeAttribute("src");
  audio.load();
  if (sourceUrl) {
    URL.revokeObjectURL(sourceUrl);
    sourceUrl = undefined;
  }
  useMusic.setState({ current: null, position: 0, duration: 0 });
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
}

export function setSleep(minutes: number) {
  clearTimeout(sleepTimeout);
  useMusic.setState({
    sleepUntil: minutes ? Date.now() + minutes * 60_000 : null,
  });
  if (minutes)
    sleepTimeout = setTimeout(() => {
      audio.pause();
      useMusic.setState({ sleepUntil: null });
      notify("睡眠定时已结束，晚安。");
    }, minutes * 60_000);
}

function showInSystemControls(track: Track) {
  if (!("mediaSession" in navigator)) return;
  const artwork = track.cover
    ? [{ src: URL.createObjectURL(track.cover), type: track.cover.type }]
    : [
        {
          src: new URL(
            `${import.meta.env.BASE_URL}icon-eclipse-512.png`,
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
    notify("这个文件无法解码，请尝试 MP3、M4A、FLAC 或 WAV 格式。");
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
