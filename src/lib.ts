import type { EnhancedLyrics, LyricSegment } from "./lyrics";

export type MusicHandle = FileSystemFileHandle & {
  queryPermission: (options: { mode: "read" }) => Promise<PermissionState>;
  requestPermission: (options: { mode: "read" }) => Promise<PermissionState>;
};
export interface Track {
  id: string;
  name: string;
  title: string;
  artist: string;
  album: string;
  size: number;
  modified: number;
  duration: number;
  added: number;
  cover?: Blob;
  lyrics?: string;
  enhancedLyrics?: EnhancedLyrics;
  handle?: MusicHandle;
  sourcePath?: string;
}
export interface MusicSource {
  file: File;
  handle?: MusicHandle;
  relativePath?: string;
}
export interface Playlist {
  id: string;
  name: string;
  tracks: string[];
}
export interface LyricLine {
  time: number;
  text: string;
  translation?: string;
  segments?: LyricSegment[];
}
export const isAudio = (file: File) =>
  file.type.startsWith("audio/") ||
  /\.(mp3|flac|m4a|aac|ogg|opus|wav|webm|aiff?)$/i.test(file.name);
export const fileId = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`;
export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};
export function parseLrc(text: string): LyricLine[] {
  const offset = Number(text.match(/\[offset:\s*(-?\d+)\]/i)?.[1] ?? 0) / 1000;
  const result: LyricLine[] = [];
  for (const line of text.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const content = line.replace(/\[[^\]]*\]/g, "").trim();
    for (const stamp of stamps)
      result.push({
        time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + offset),
        text: content || "♪",
      });
  }
  return result.sort((a, b) => a.time - b.time);
}
export function nextTrack(
  queue: string[],
  current: string | null,
  direction: number,
  repeat: string,
): string | null {
  if (!queue.length) return null;
  const index = queue.indexOf(current ?? "");
  const next = index + direction;
  if (next >= queue.length) return repeat === "all" ? queue[0] : null;
  if (next < 0) return repeat === "all" ? queue[queue.length - 1] : queue[0];
  return queue[next];
}
