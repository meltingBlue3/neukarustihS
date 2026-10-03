export interface LyricSegment {
  text: string;
  reading?: string;
}

export interface EnhancedLyricLine {
  timeMs: number;
  text: string;
  translation: string;
  segments: LyricSegment[];
}

export interface EnhancedLyrics {
  format: "neukarustihs-lyrics";
  version: 1;
  lines: EnhancedLyricLine[];
}

export const isEnhancedLyrics = (name: string) => /\.lyrics\.json$/i.test(name);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 10000;

// Imported files are untrusted. Keep only validated display data; render it as
// React text/ruby, never HTML. A complete timeline also works without an LRC.
export function parseEnhancedLyrics(text: string): EnhancedLyrics {
  const invalid = () => new Error("歌词增强文件格式不正确，请检查内容或版本");
  if (text.length > 2 * 1024 * 1024) throw invalid();
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw invalid();
  }
  if (
    !record(value) ||
    value.format !== "neukarustihs-lyrics" ||
    value.version !== 1 ||
    !Array.isArray(value.lines) ||
    !value.lines.length ||
    value.lines.length > 10000
  )
    throw invalid();
  const lines = value.lines.map((line: unknown): EnhancedLyricLine => {
    if (
      !record(line) ||
      typeof line.timeMs !== "number" ||
      !Number.isSafeInteger(line.timeMs) ||
      line.timeMs < 0 ||
      !string(line.text) ||
      !string(line.translation) ||
      !Array.isArray(line.segments) ||
      line.segments.length > 1000
    )
      throw invalid();
    const segments = line.segments.map((segment: unknown): LyricSegment => {
      if (
        !record(segment) ||
        !string(segment.text) ||
        (segment.reading !== undefined && !string(segment.reading))
      )
        throw invalid();
      return {
        text: segment.text,
        ...(segment.reading ? { reading: segment.reading } : {}),
      };
    });
    if (segments.map((s) => s.text).join("") !== line.text) throw invalid();
    return {
      timeMs: line.timeMs,
      text: line.text,
      translation: line.translation,
      segments,
    };
  });
  return {
    format: "neukarustihs-lyrics",
    version: 1,
    lines: lines.sort((a, b) => a.timeMs - b.timeMs),
  };
}

export async function readEnhancedLyrics(file: File) {
  if (file.size > 2 * 1024 * 1024)
    throw new Error("歌词增强文件过大，请使用 2 MB 以内的文件");
  return parseEnhancedLyrics(await file.text());
}
