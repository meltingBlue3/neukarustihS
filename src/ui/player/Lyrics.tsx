import { useEffect, useMemo, useRef } from "react";
import { Music2, Plus } from "lucide-react";
import { lyricLines } from "../../music/lyrics";
import { seek } from "../../music/playback";
import { useMusic } from "../../music/store";
import type { Track } from "../../music/types";

// Lyrics that follow playback; tapping a line seeks to it.
export function Lyrics({
  track,
  onImport,
}: {
  track?: Track;
  onImport: () => void;
}) {
  const position = useMusic((s) => s.position);
  const showTranslation = useMusic((s) => s.showTranslation);
  const showFurigana = useMusic((s) => s.showFurigana);
  const lyrics = track?.lyrics;
  const enhancedLyrics = track?.enhancedLyrics;
  const lines = useMemo(
    () => lyricLines(lyrics, enhancedLyrics),
    [lyrics, enhancedLyrics],
  );
  const active = lines.findLastIndex((line) => line.time <= position);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
  }, [active, track?.id, lines, showTranslation, showFurigana]);
  if (!track?.lyrics && !track?.enhancedLyrics)
    return (
      <div className="lyrics-empty">
        <Music2 size={36} />
        <h3>让文字也跟着播放</h3>
        <p>
          导入 LRC 或歌词增强文件，
          <br />
          跟随每一句，留在这一刻。
        </p>
        <button className="secondary" disabled={!track} onClick={onImport}>
          <Plus size={16} />
          导入歌词
        </button>
      </div>
    );
  return (
    <div className="lyrics-view">
      <div className="lyrics-scroll">
        {lines.length ? (
          lines.map((line, i) => (
            <button
              ref={i === active ? activeRef : undefined}
              className={i === active ? "lyric active" : "lyric"}
              key={`${line.time}-${i}`}
              onClick={() => seek(line.time)}
            >
              <span
                className={`lyric-original${showFurigana && line.segments?.some((s) => s.reading) ? " with-ruby" : ""}`}
              >
                {showFurigana && line.segments && line.text
                  ? line.segments.map((segment, index) =>
                      segment.reading ? (
                        <ruby key={index}>
                          {segment.text}
                          <rp>（</rp>
                          <rt>{segment.reading}</rt>
                          <rp>）</rp>
                        </ruby>
                      ) : (
                        <span key={index}>{segment.text}</span>
                      ),
                    )
                  : line.text || "♪"}
              </span>
              {showTranslation && line.translation && (
                <span className="lyric-translation">{line.translation}</span>
              )}
            </button>
          ))
        ) : (
          // Untimed text, e.g. a TXT file or embedded unsynced lyrics.
          <p className="plain-lyrics">{track.lyrics}</p>
        )}
        <button className="text-button" onClick={onImport}>
          更换歌词
        </button>
      </div>
    </div>
  );
}

// Furigana and translation toggles, shown only when the lyrics have them.
export function LyricsOptions({ track }: { track?: Track }) {
  const showTranslation = useMusic((s) => s.showTranslation);
  const showFurigana = useMusic((s) => s.showFurigana);
  const lines = track?.enhancedLyrics?.lines;
  const hasTranslation = lines?.some((line) => !!line.translation);
  const hasFurigana = lines?.some((line) =>
    line.segments.some((segment) => !!segment.reading),
  );
  if (!hasTranslation && !hasFurigana) return null;
  return (
    <div className="lyrics-options" aria-label="歌词显示">
      {hasFurigana && (
        <button
          type="button"
          aria-label="振り仮名"
          title="振り仮名"
          aria-pressed={showFurigana}
          onClick={() => useMusic.setState({ showFurigana: !showFurigana })}
        >
          注音
        </button>
      )}
      {hasTranslation && (
        <button
          type="button"
          aria-label="中文翻译"
          title="中文翻译"
          aria-pressed={showTranslation}
          onClick={() =>
            useMusic.setState({ showTranslation: !showTranslation })
          }
        >
          译文
        </button>
      )}
    </div>
  );
}
