import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ChevronDown,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { seek, skip, togglePlay } from "../../music/playback";
import { currentTrack, useMusic } from "../../music/store";
import { Cover, IconButton } from "../common";
import { formatTime } from "../format";
import { useImport } from "../importContext";
import { openDialog, setPlayerOpen } from "../state";
import { Lyrics, LyricsOptions } from "./Lyrics";

const modeLabels = {
  all: "列表循环",
  one: "单曲循环",
  shuffle: "随机播放",
} as const;

function Progress() {
  const position = useMusic((s) => s.position),
    duration = useMusic((s) => s.duration);
  return (
    <div className="progress">
      <input
        aria-label="播放进度"
        type="range"
        min="0"
        max={duration || 1}
        step="0.1"
        value={Math.min(position, duration || 1)}
        disabled={!duration}
        onChange={(e) => seek(Number(e.target.value))}
        style={
          {
            "--progress": `${duration ? (position / duration) * 100 : 0}%`,
          } as CSSProperties
        }
      />
      <div className="time">
        <span>{formatTime(position)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

// The now-playing panel: a sidebar on wide screens, a full-screen sheet on
// phones, where the cover and lyrics also swipe sideways.
export function Player({ mobile }: { mobile?: boolean }) {
  const current = useMusic((s) => s.current),
    playing = useMusic((s) => s.playing),
    playbackMode = useMusic((s) => s.playbackMode),
    favorite = useMusic((s) => !!s.current && s.favorites.includes(s.current)),
    track = useMusic(currentTrack);
  const { chooseLyricsFor } = useImport();
  const modeLabel = modeLabels[playbackMode];
  const [page, setPage] = useState<"cover" | "lyrics">("cover");
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  return (
    <section
      className={`player ${mobile ? "mobile-player" : "desktop-player"}`}
      aria-label="正在播放"
    >
      <div className="player-top">
        {mobile ? (
          <IconButton label="收起播放器" onClick={() => setPlayerOpen(false)}>
            <ChevronDown />
          </IconButton>
        ) : (
          <span className="eyebrow">
            <span className={playing ? "pulse-dot" : "small-dot"} />
            NOW PLAYING
          </span>
        )}
        <div className="player-tabs">
          <button
            className={page === "cover" ? "selected" : ""}
            onClick={() => setPage("cover")}
          >
            封面
          </button>
          <button
            className={page === "lyrics" ? "selected" : ""}
            onClick={() => setPage("lyrics")}
          >
            歌词
          </button>
        </div>
      </div>
      <div
        className="player-art-area"
        onPointerDown={(event) => {
          if (mobile && event.isPrimary && event.pointerType === "touch") {
            swipeStart.current = { x: event.clientX, y: event.clientY };
          }
        }}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          // A swipe ends over a lyric line; don't let it count as a tap.
          suppressClickUntil.current = performance.now() + 400;
          setPage(dx < 0 ? "lyrics" : "cover");
        }}
        onClickCapture={(event) => {
          if (performance.now() < suppressClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {page === "cover" ? (
          <div className="sleeve">
            <Cover track={track} />
            <span className="sleeve-label">
              AFTER HOURS · PRIVATE COLLECTION
            </span>
            {!track && <span className="art-sticker">夜を聴く。</span>}
          </div>
        ) : (
          <Lyrics
            track={track}
            onImport={() => current && chooseLyricsFor(current)}
          />
        )}
      </div>
      <div className="song-heading">
        <div className="song-info">
          <span className="eyebrow accent">
            {track ? track.album : "YOUR OWN LITTLE UNIVERSE"}
          </span>
          <h2>{track?.title || "夜晚，留给喜欢的歌。"}</h2>
          <p>{track?.artist || "导入音乐，开启你的私人频道"}</p>
        </div>
        <div className="song-actions">
          <LyricsOptions track={track} />
          <IconButton
            label={favorite ? "取消收藏" : "收藏歌曲"}
            active={favorite}
            disabled={!current}
            onClick={() =>
              current && useMusic.getState().toggleFavorite(current)
            }
          >
            <Heart fill={favorite ? "currentColor" : "none"} />
          </IconButton>
        </div>
      </div>
      <Progress />
      <div className="play-controls">
        <IconButton
          label={`播放模式：${modeLabel}`}
          className="mode-button"
          onClick={() => useMusic.getState().cyclePlaybackMode()}
        >
          {playbackMode === "shuffle" ? (
            <Shuffle size={20} />
          ) : playbackMode === "one" ? (
            <Repeat1 size={21} />
          ) : (
            <Repeat size={21} />
          )}
          <small>{modeLabel}</small>
        </IconButton>
        <IconButton label="上一首" onClick={() => skip(-1)} disabled={!current}>
          <SkipBack fill="currentColor" size={23} />
        </IconButton>
        <IconButton
          label={playing ? "暂停" : "播放"}
          className="primary-play"
          onClick={togglePlay}
        >
          {playing ? (
            <Pause fill="currentColor" size={28} />
          ) : (
            <Play fill="currentColor" size={28} />
          )}
        </IconButton>
        <IconButton label="下一首" onClick={() => skip(1)} disabled={!current}>
          <SkipForward fill="currentColor" size={23} />
        </IconButton>
        <IconButton
          label="播放队列"
          onClick={() => openDialog({ kind: "queue" })}
        >
          <ListMusic size={21} />
        </IconButton>
      </div>
    </section>
  );
}
