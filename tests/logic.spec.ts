// Pure logic, run in Node without a browser.
import { test, expect } from "@playwright/test";
import { ensureReadPermission } from "../src/music/files";
import { parseEnhancedLyrics, parseLrc } from "../src/music/lyrics";
import { chooseSkip, nextTrack } from "../src/music/queue";
import { findSidecarTrack, lyricFileKind } from "../src/music/sidecars";
import type { Track } from "../src/music/types";

function enhancedLine(text: string, translation: string) {
  return JSON.stringify({
    format: "neukarustihs-lyrics",
    version: 1,
    lines: [{ timeMs: 0, text, translation, segments: [{ text }] }],
  });
}

test("enhanced lyrics validate timelines and exact ruby text before saving", () => {
  const valid = enhancedLine("夜", "夜晚");
  expect(parseEnhancedLyrics(`\uFEFF${valid}`).lines[0].translation).toBe(
    "夜晚",
  );
  for (const invalid of [
    "{",
    valid.replace('"version":1', '"version":2'),
    valid.replace('"timeMs":0', '"timeMs":-1'),
    valid.replace('"segments":[{"text":"夜"}]', '"segments":[{"text":"朝"}]'),
    valid.replace('"translation":"夜晚"', '"translation":{}'),
  ]) {
    expect(() => parseEnhancedLyrics(invalid)).toThrow();
  }
});

test("read permission is granted, refused, or given up after an unanswered prompt", async () => {
  const handle = (
    query: PermissionState,
    request: () => Promise<PermissionState>,
  ) => ({ queryPermission: async () => query, requestPermission: request });
  let prompted = false;
  const granted = handle("granted", async () => {
    prompted = true;
    return "granted";
  });
  expect(await ensureReadPermission(granted)).toBe(true);
  expect(prompted).toBe(false);
  expect(
    await ensureReadPermission(handle("prompt", async () => "granted")),
  ).toBe(true);
  expect(
    await ensureReadPermission(handle("prompt", async () => "denied")),
  ).toBe(false);
  const unanswered = handle("prompt", () => new Promise(() => {}));
  expect(await ensureReadPermission(unanswered, 20)).toBe(false);
});

test("LRC offsets, multiple timestamps, and queue boundaries", () => {
  expect(parseLrc("[offset:-500]\n[00:01.20][00:02.30]hello")).toEqual([
    { time: 0.7, text: "hello" },
    { time: 1.7999999999999998, text: "hello" },
  ]);
  expect(parseLrc("[ar:Someone]\nnot timed")).toEqual([]);
  expect(nextTrack(["a", "b"], "b", 1, "off")).toBeNull();
  expect(nextTrack(["a", "b"], "b", 1, "all")).toBe("a");
  expect(nextTrack([], null, 1, "all")).toBeNull();
});

test("lyric sidecars match exactly one song by folder or name, ignoring case", () => {
  const track = (id: string, name: string, sourcePath?: string): Track => ({
    id,
    name,
    sourcePath,
    title: name,
    artist: "",
    album: "",
    size: 0,
    modified: 0,
    duration: 0,
    added: 0,
  });
  const sidecar = (name: string, relativePath?: string) => ({
    file: new File([""], name),
    relativePath,
  });
  const tracks = [
    track("a", "Song.MP3", "Lib/A/Song.MP3"),
    track("b", "song.flac", "Lib/B/song.flac"),
    track("c", "Other.mp3"),
  ];
  const none = new Set<string>();
  const find = (name: string, path?: string, together = none) =>
    findSidecarTrack(sidecar(name, path), tracks, together)?.id;
  // Folder imports stay within the sidecar's own directory.
  expect(find("song.lrc", "Lib/A/song.lrc")).toBe("a");
  expect(find("SONG.lyrics.json", "lib/b/SONG.lyrics.json")).toBe("b");
  expect(find("song.lrc", "Lib/C/song.lrc")).toBeUndefined();
  // Lone files match by name, but never guess between same-named songs.
  expect(find("song.lrc")).toBeUndefined();
  expect(find("song.lrc", undefined, new Set(["b"]))).toBe("b");
  expect(find("other.LRC")).toBe("c");
  expect(lyricFileKind("Song.MP3", "song.Lyrics.JSON")).toBe("enhanced");
  expect(lyricFileKind("Song.MP3", "SONG.lrc")).toBe("lrc");
  expect(lyricFileKind("Song.MP3", "Song.lrc.bak")).toBeNull();
});

test("shuffle plays every queued track once, then steps back through history", () => {
  const state = {
    queue: ["a", "b", "c"],
    current: "a",
    history: [] as string[],
    playbackMode: "shuffle" as const,
  };
  const first = () => 0;
  expect(chooseSkip(state, 1, first)).toEqual({ target: "b", history: [] });
  // "b" already played: only "c" is left.
  expect(chooseSkip({ ...state, history: ["b"] }, 1, first).target).toBe("c");
  // Everything played: start a new round, still never the current track.
  expect(
    chooseSkip({ ...state, current: "c", history: ["a", "b"] }, 1, first),
  ).toEqual({ target: "a", history: [] });
  expect(chooseSkip({ ...state, history: ["c", "b"] }, -1)).toEqual({
    target: "b",
    history: ["c"],
    fromHistory: true,
  });
  // Other modes wrap around the queue in both directions.
  const list = { ...state, playbackMode: "all" as const };
  expect(chooseSkip({ ...list, current: "c" }, 1).target).toBe("a");
  expect(chooseSkip(list, -1).target).toBe("c");
});
