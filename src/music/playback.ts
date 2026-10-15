// The two audio decks and everything that drives them: transport, queue,
// sleep timer and the system media controls.
import { notify } from "../notice";
import { coverUrl } from "./covers";
import { getTrackFile } from "./files";
import { chooseSkip } from "./queue";
import { trackIndex, useMusic } from "./store";
import type { Track } from "./types";

// Two decks take turns: the next song starts on the standby deck while the
// current one is still playing, so Chrome's media session never runs empty.
// Once it does, Chrome releases audio focus, and Android 15+ refuses to grant
// it back to an app in the background, which silently pauses the next song.
const decks = [new Audio(), new Audio()];
for (const deck of decks) deck.preload = "metadata";
let audio = decks[0];
const sources = new Map<HTMLAudioElement, string>();
const retiring = new Map<HTMLAudioElement, ReturnType<typeof setTimeout>>();
// The next song starts this many seconds early, nearly silent but still part
// of the media session, and restarts from zero when the current song ends.
const PREROLL_SECONDS = 2;
const QUIET = 0.0001;
// The outgoing deck leaves the session only after the incoming one joined.
const RETIRE_DELAY = 300;
// iOS fixes the volume at 1, so a preroll there would be heard; it keeps the
// plain switch at the end of each song.
const adjustableVolume = (() => {
  const probe = new Audio();
  probe.volume = 0.5;
  return probe.volume === 0.5;
})();
interface Preroll {
  id: string;
  deck: HTMLAudioElement;
  ready: boolean;
}
let preroll: Preroll | undefined;
// Bumped by every play or pause, so a slow file lookup cannot resume a track
// the user has moved on from.
let playVersion = 0;
let sleepTimeout: ReturnType<typeof setTimeout> | undefined;

const standby = () => (audio === decks[0] ? decks[1] : decks[0]);

function load(deck: HTMLAudioElement, file?: File) {
  clearTimeout(retiring.get(deck));
  const previous = sources.get(deck);
  if (previous) URL.revokeObjectURL(previous);
  sources.delete(deck);
  if (file) {
    const url = URL.createObjectURL(file);
    sources.set(deck, url);
    deck.src = url;
  } else {
    deck.removeAttribute("src");
    deck.load();
  }
}

// Silence the outgoing deck at once, but keep it in the session briefly.
function retire(deck: HTMLAudioElement) {
  if (deck.paused || deck === preroll?.deck) return;
  if (!adjustableVolume) {
    deck.pause();
    return;
  }
  deck.volume = QUIET;
  retiring.set(
    deck,
    setTimeout(() => deck.pause(), RETIRE_DELAY),
  );
}

function cancelPreroll() {
  if (preroll?.ready) preroll.deck.pause();
  preroll = undefined;
}

// The song after the current one, starting a new shuffle round if needed.
function nextAfterCurrent() {
  const s = useMusic.getState();
  const { target, history } = chooseSkip(s, 1);
  if (history !== s.history) useMusic.setState({ history });
  return target;
}

function maybePreroll() {
  const remaining = audio.duration - audio.currentTime;
  if (preroll) {
    // Seeking back from the ending postpones the early start.
    if (remaining > PREROLL_SECONDS + 1) cancelPreroll();
    return;
  }
  if (
    !adjustableVolume ||
    audio.paused ||
    audio.loop ||
    !(remaining <= PREROLL_SECONDS)
  )
    return;
  const id = nextAfterCurrent();
  const track = id ? trackIndex(useMusic.getState().tracks).get(id) : undefined;
  if (track) void startPreroll(track);
}

async function startPreroll(track: Track) {
  const attempt: Preroll = { id: track.id, deck: standby(), ready: false };
  preroll = attempt;
  try {
    // Without a user gesture only files that are already readable can start.
    const file = await getTrackFile(track, false);
    if (preroll !== attempt || !file) return;
    load(attempt.deck, file);
    attempt.deck.volume = QUIET;
    attempt.deck.loop = false;
    attempt.ready = true;
    await attempt.deck.play();
  } catch {
    /* The switch at the end of the song retries and reports failures. */
  }
}

export async function play(
  id: string,
  context?: string[],
  fromHistory = false,
) {
  const track = trackIndex(useMusic.getState().tracks).get(id);
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
    const prepared =
      preroll?.ready && preroll.id === id && !preroll.deck.error
        ? preroll.deck
        : undefined;
    if (prepared || state.current !== id || !audio.src) {
      const incoming = prepared ?? standby();
      if (prepared) {
        preroll = undefined;
        incoming.currentTime = 0;
      } else {
        cancelPreroll();
        load(incoming, file);
      }
      incoming.volume = 1;
      incoming.loop = state.playbackMode === "one";
      audio.loop = false;
      audio = incoming;
      useMusic.setState({
        current: id,
        position: 0,
        duration: Number.isFinite(incoming.duration)
          ? incoming.duration
          : track.duration,
        history:
          fromHistory || !state.current || state.current === id
            ? state.history
            : [...state.history, state.current].slice(-200),
      });
      // A prepared deck is already playing and will not announce it again.
      if (prepared) syncPlaying();
    }
    if (context) useMusic.setState({ queue: context });
    else if (!state.queue.includes(id))
      useMusic.setState({ queue: state.tracks.map((t) => t.id) });
    showInSystemControls(track);
    await audio.play();
    if (version === playVersion) retire(standby());
  } catch (error) {
    if (
      version !== playVersion ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      return;
    pause();
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
  cancelPreroll();
  for (const deck of decks) deck.pause();
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

export function skip(direction: number) {
  const s = useMusic.getState();
  if (direction < 0 && audio.currentTime > 3) {
    seek(0);
    return;
  }
  // Skipping ahead during a preroll takes the song that is already prepared.
  if (direction > 0 && preroll) {
    void play(preroll.id);
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

export const seekBy = (seconds: number) => seek(audio.currentTime + seconds);

export function enqueue(id: string) {
  useMusic.setState((s) => ({
    queue: [...s.queue.filter((t) => t !== id), id],
  }));
  notify("已添加到播放队列");
}

// Stop and unload the current track, e.g. when it leaves the library.
export function unload() {
  pause();
  for (const deck of decks) load(deck);
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
      pause();
      useMusic.setState({ sleepUntil: null });
      notify("睡眠定时已结束，晚安。");
    }, minutes * 60_000);
}

function showInSystemControls(track: Track) {
  if (!("mediaSession" in navigator)) return;
  const artwork = track.cover
    ? [{ src: coverUrl(track.cover), type: track.cover.type }]
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
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork,
  });
}

function syncPlaying() {
  const playing = !audio.paused;
  useMusic.setState({ playing });
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

for (const deck of decks) {
  // Only the deck on air drives the interface; the other one is preparing the
  // next song or fading out the previous one.
  const onAir = (listener: () => void) => () => {
    if (deck === audio) listener();
  };
  deck.addEventListener("play", onAir(syncPlaying));
  deck.addEventListener(
    "pause",
    onAir(() => {
      syncPlaying();
      // Any pause before the end, by the user or the system, also stops the
      // prepared next song.
      if (!deck.ended) cancelPreroll();
    }),
  );
  deck.addEventListener(
    "timeupdate",
    onAir(() => {
      useMusic.setState({ position: deck.currentTime });
      if (
        "mediaSession" in navigator &&
        navigator.mediaSession.setPositionState &&
        Number.isFinite(deck.duration) &&
        deck.duration > 0
      ) {
        navigator.mediaSession.setPositionState({
          duration: deck.duration,
          playbackRate: 1,
          position: Math.min(deck.currentTime, deck.duration),
        });
      }
      maybePreroll();
    }),
  );
  deck.addEventListener(
    "loadedmetadata",
    onAir(() => {
      const duration = Number.isFinite(deck.duration) ? deck.duration : 0;
      useMusic.setState({ duration });
    }),
  );
  deck.addEventListener(
    "ended",
    onAir(() => {
      const next = preroll?.id ?? nextAfterCurrent();
      if (next) void play(next);
    }),
  );
  deck.addEventListener(
    "error",
    onAir(() => {
      if (deck.getAttribute("src"))
        notify("这个文件无法解码，请尝试 MP3、M4A、FLAC 或 WAV 格式。");
    }),
  );
}
// Single repeat loops in place so the song never ends and leaves the session.
useMusic.subscribe((s, previous) => {
  if (s.playbackMode !== previous.playbackMode)
    audio.loop = s.playbackMode === "one";
  // A new order may change the next song; prepare it again.
  if (s.playbackMode !== previous.playbackMode || s.queue !== previous.queue)
    cancelPreroll();
});
if ("mediaSession" in navigator) {
  const actions: Partial<
    Record<MediaSessionAction, MediaSessionActionHandler>
  > = {
    play: () => {
      const s = useMusic.getState();
      if (s.current) void play(s.current);
    },
    pause,
    previoustrack: () => skip(-1),
    nexttrack: () => skip(1),
    seekto: (e) => seek(e.seekTime ?? 0),
    seekbackward: (e) => seekBy(-(e.seekOffset ?? 10)),
    seekforward: (e) => seekBy(e.seekOffset ?? 10),
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
