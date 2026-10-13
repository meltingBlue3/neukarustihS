import { useMemo, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  Ellipsis,
  Heart,
  Music2,
  Play,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { play } from "../../music/playback";
import { useMusic, useTrackIndex } from "../../music/store";
import type { Track } from "../../music/types";
import { Cover, IconButton } from "../common";
import { formatTime } from "../format";
import { useShownPlaylist } from "../hooks";
import { navigate, openDialog, useUi } from "../state";
import type { SortKey } from "../state";
import { useListOffset, visibleRows } from "../virtual";

// The songs of the library, favorites, or a playlist, with search and sort.
// Remount it per page so the search starts empty.
// Same ordering as localeCompare, but much faster across a large library.
const collator = new Intl.Collator();
const comparators: Record<SortKey, (a: Track, b: Track) => number> = {
  added: (a, b) => b.added - a.added,
  title: (a, b) => collator.compare(a.title, b.title),
  artist: (a, b) => collator.compare(a.artist, b.artist),
};

export function TrackListSection() {
  const view = useUi((s) => s.view),
    sort = useUi((s) => s.sort);
  const playlist = useShownPlaylist();
  const tracks = useMusic((s) => s.tracks),
    index = useTrackIndex(),
    favorites = useMusic((s) => s.favorites),
    current = useMusic((s) => s.current),
    playing = useMusic((s) => s.playing);
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    let list: Track[];
    if (playlist)
      list = playlist.tracks
        .map((id) => index.get(id))
        .filter((t): t is Track => !!t);
    else if (view === "favorites") {
      const liked = new Set(favorites);
      list = tracks.filter((t) => liked.has(t.id));
    } else list = [...tracks];
    if (search) {
      const q = search.toLocaleLowerCase();
      list = list.filter((t) =>
        `${t.title} ${t.artist} ${t.album}`.toLocaleLowerCase().includes(q),
      );
    }
    return list.sort(comparators[sort]);
  }, [tracks, index, favorites, view, playlist, search, sort]);
  const [listElement, setListElement] = useState<HTMLElement | null>(null);
  // The virtualizer changes without new props, which React Compiler's
  // memoization would miss. This project does not use the compiler.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useWindowVirtualizer({
    count: shown.length,
    estimateSize: () => 74,
    overscan: 8,
    scrollMargin: useListOffset(listElement),
    getItemKey: (i) => shown[i].id,
  });
  const { rows, style } = visibleRows(virtualizer);
  const playShown = (id: string) =>
    void play(
      id,
      shown.map((t) => t.id),
    );
  return (
    <>
      <div className="library-toolbar">
        <div className="library-tabs">
          <span className="selected">
            {playlist
              ? "歌单歌曲"
              : view === "favorites"
                ? "收藏歌曲"
                : "全部歌曲"}{" "}
            <small>{shown.length}</small>
          </span>
          {playlist && (
            <IconButton
              label="歌单设置"
              onClick={() =>
                openDialog({ kind: "playlistForm", playlistId: playlist.id })
              }
            >
              <Ellipsis size={19} />
            </IconButton>
          )}
          {shown.length > 0 && (
            <button
              className="text-button play-all"
              onClick={() => playShown(shown[0].id)}
            >
              <Play size={15} fill="currentColor" />
              播放全部
            </button>
          )}
        </div>
        <div className="search-sort">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="搜索音乐"
              placeholder="搜索歌曲、艺术家"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label="清除搜索" onClick={() => setSearch("")}>
                <X size={14} />
              </button>
            )}
          </label>
          <select
            aria-label="歌曲排序"
            value={sort}
            onChange={(e) =>
              useUi.setState({ sort: e.target.value as SortKey })
            }
          >
            <option value="added">最近添加</option>
            <option value="title">歌曲名称</option>
            <option value="artist">艺术家</option>
          </select>
        </div>
      </div>
      {shown.length ? (
        <div className="track-list">
          <div className="track-list-head">
            <span>#</span>
            <span>歌曲 / 艺术家</span>
            <span className="album-column">专辑</span>
            <span>时长</span>
            <span />
          </div>
          <div ref={setListElement} style={style}>
            {rows.map((row) => {
              const t = shown[row.index];
              return (
                <div
                  className={`track-row ${current === t.id ? "is-current" : ""}`}
                  key={t.id}
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                >
                  <span className="track-number">
                    {current === t.id && playing ? (
                      <span className="equalizer">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      String(row.index + 1).padStart(2, "0")
                    )}
                  </span>
                  <button
                    className="track-main"
                    onClick={() => playShown(t.id)}
                  >
                    <Cover track={t} />
                    <span>
                      <strong>{t.title}</strong>
                      <small>{t.artist}</small>
                    </span>
                  </button>
                  <span className="album-column truncate">{t.album}</span>
                  <span className="track-duration">
                    {t.duration ? formatTime(t.duration) : "—"}
                  </span>
                  <IconButton
                    label={`${t.title} 更多操作`}
                    onClick={() =>
                      openDialog({ kind: "trackActions", trackId: t.id })
                    }
                  >
                    <Ellipsis size={20} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-library">
          <span className="empty-icon">
            {view === "favorites" ? (
              <Heart size={30} />
            ) : search ? (
              <Search size={30} />
            ) : (
              <Music2 size={30} />
            )}
          </span>
          <h3>
            {search
              ? "还没找到这段旋律"
              : view === "favorites"
                ? "留住让你心动的歌"
                : playlist
                  ? "给这个歌单一个开始"
                  : "你的私藏，从这里开始"}
          </h3>
          <p>
            {search
              ? "试试其他歌名或艺术家。"
              : view === "favorites"
                ? "播放时点亮爱心，喜欢的歌就会出现在这里。"
                : playlist
                  ? "在歌曲的「更多操作」中添加到这个歌单。"
                  : "支持 MP3、FLAC、M4A、WAV 等常见格式"}
          </p>
          {playlist && (
            <button className="secondary" onClick={() => navigate("library")}>
              前往音乐库
            </button>
          )}
        </div>
      )}
      <div className="library-foot">
        <ShieldCheck size={14} />
        <span>音乐文件不会上传，仅保留歌单与歌曲信息。</span>
        <span className="desktop-only">MADE FOR LISTENING.</span>
      </div>
    </>
  );
}
