import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Disc3,
  Download,
  Ellipsis,
  FolderOpen,
  Headphones,
  Heart,
  Library,
  ListMusic,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Search,
  Settings2,
  ShieldCheck,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Timer,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  audio,
  enqueue,
  importMusic,
  initialize,
  play,
  removeTrack,
  saveLyrics,
  seek,
  setSleep,
  skip,
  togglePlay,
  useMusic,
} from "./store";
import { formatTime, parseLrc } from "./lib";
import type { MusicHandle, MusicSource, Track } from "./lib";
import { updateApp } from "./pwa";
import "./App.css";

type View = "library" | "favorites" | "playlists" | "settings";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const art = `${import.meta.env.BASE_URL}night-cover.webp`;

function IconButton({
  label,
  children,
  onClick,
  active,
  className = "",
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Cover({
  track,
  className = "",
}: {
  track?: Track;
  className?: string;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!track?.cover) {
      setUrl(undefined);
      return;
    }
    const object = URL.createObjectURL(track.cover);
    setUrl(object);
    return () => URL.revokeObjectURL(object);
  }, [track?.cover]);
  return (
    <img
      className={`cover ${className}`}
      src={url || art}
      alt={track ? `${track.title} 封面` : "原创夜色插画：戴着耳机的城市夜行人"}
    />
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const notice = useMusic((s) => s.notice);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <section>
        <header>
          <h2>{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        {children}
        {notice && (
          <p className="modal-notice" aria-live="polite">
            {notice}
          </p>
        )}
      </section>
    </dialog>
  );
}
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
          } as React.CSSProperties
        }
      />
      <div className="time">
        <span>{formatTime(position)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
function Lyrics({ track, onImport }: { track?: Track; onImport: () => void }) {
  const position = useMusic((s) => s.position);
  const lines = useMemo(() => parseLrc(track?.lyrics || ""), [track?.lyrics]);
  const active = lines.findLastIndex((line) => line.time <= position);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
  }, [active]);
  if (!track?.lyrics)
    return (
      <div className="lyrics-empty">
        <Music2 size={36} />
        <h3>让文字也跟着播放</h3>
        <p>
          导入这首歌的 LRC 歌词，
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
    <div className="lyrics-scroll">
      {lines.length ? (
        lines.map((line, i) => (
          <button
            ref={i === active ? activeRef : undefined}
            className={i === active ? "lyric active" : "lyric"}
            key={`${line.time}-${i}`}
            onClick={() => seek(line.time)}
          >
            {line.text}
          </button>
        ))
      ) : (
        <p className="plain-lyrics">{track.lyrics}</p>
      )}
      <button className="text-button" onClick={onImport}>
        更换歌词
      </button>
    </div>
  );
}
function Player({
  mobile,
  close,
  onLyrics,
  onQueue,
}: {
  mobile?: boolean;
  close?: () => void;
  onLyrics: () => void;
  onQueue: () => void;
}) {
  const tracks = useMusic((s) => s.tracks),
    current = useMusic((s) => s.current),
    playing = useMusic((s) => s.playing);
  const shuffle = useMusic((s) => s.shuffle),
    repeat = useMusic((s) => s.repeat),
    volume = useMusic((s) => s.volume);
  const favorites = useMusic((s) => s.favorites),
    toggleFavorite = useMusic((s) => s.toggleFavorite);
  const [page, setPage] = useState<"cover" | "lyrics">("cover");
  const track = tracks.find((t) => t.id === current);
  return (
    <section
      className={`player ${mobile ? "mobile-player" : "desktop-player"}`}
      aria-label="正在播放"
    >
      <div className="player-top">
        {mobile ? (
          <IconButton label="收起播放器" onClick={close!}>
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
      <div className="player-art-area">
        {page === "cover" ? (
          <div className="sleeve">
            <Cover track={track} />
            <span className="sleeve-label">
              AFTER HOURS · PRIVATE COLLECTION
            </span>
            {!track && <span className="art-sticker">夜を聴く。</span>}
          </div>
        ) : (
          <Lyrics track={track} onImport={onLyrics} />
        )}
      </div>
      <div className="song-heading">
        <div>
          <span className="eyebrow accent">
            {track ? track.album : "YOUR OWN LITTLE UNIVERSE"}
          </span>
          <h2>{track?.title || "夜晚，留给喜欢的歌。"}</h2>
          <p>{track?.artist || "导入音乐，开启你的私人频道"}</p>
        </div>
        <IconButton
          label={
            current && favorites.includes(current) ? "取消收藏" : "收藏歌曲"
          }
          active={!!current && favorites.includes(current)}
          disabled={!current}
          onClick={() => current && toggleFavorite(current)}
        >
          <Heart
            fill={
              current && favorites.includes(current) ? "currentColor" : "none"
            }
          />
        </IconButton>
      </div>
      <Progress />
      <div className="play-controls">
        <IconButton
          label="随机播放"
          active={shuffle}
          onClick={() => useMusic.getState().toggleShuffle()}
        >
          <Shuffle size={20} />
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
          label={`循环模式：${repeat === "all" ? "列表循环" : repeat === "one" ? "单曲循环" : "顺序播放"}`}
          active={repeat !== "off"}
          onClick={() => useMusic.getState().cycleRepeat()}
        >
          {repeat === "one" ? <Repeat1 size={21} /> : <Repeat size={21} />}
        </IconButton>
      </div>
      <div className="player-bottom">
        <label className="volume">
          <Volume2 size={17} />
          <input
            aria-label="音量"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) =>
              useMusic.getState().setVolume(Number(e.target.value))
            }
          />
        </label>
        <IconButton label="播放队列" onClick={onQueue}>
          <ListMusic size={21} />
        </IconButton>
      </div>
      <div className="player-footnote">
        <Headphones size={13} />
        <span>只在此刻，只在本机。</span>
        <span className="little-star">✳</span>
      </div>
    </section>
  );
}

function App() {
  const tracks = useMusic((s) => s.tracks),
    playlists = useMusic((s) => s.playlists),
    favorites = useMusic((s) => s.favorites);
  const current = useMusic((s) => s.current),
    playing = useMusic((s) => s.playing),
    importing = useMusic((s) => s.importing);
  const notice = useMusic((s) => s.notice),
    ready = useMusic((s) => s.ready),
    queue = useMusic((s) => s.queue),
    sleepUntil = useMusic((s) => s.sleepUntil);
  const [view, setView] = useState<View>("library"),
    [playlistId, setPlaylistId] = useState<string | null>(null);
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("added");
  const [playerOpen, setPlayerOpen] = useState(false),
    [queueOpen, setQueueOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [actionTrack, setActionTrack] = useState<Track | null>(null),
    [playlistForm, setPlaylistForm] = useState<"new" | "rename" | null>(null);
  const [playlistName, setPlaylistName] = useState(""),
    [confirmDelete, setConfirmDelete] = useState<"track" | "playlist" | null>(
      null,
    );
  const [install, setInstall] = useState<InstallEvent | null>(null),
    [online, setOnline] = useState(navigator.onLine);
  const [hasUpdate, setHasUpdate] = useState(false),
    [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    lyricInput = useRef<HTMLInputElement>(null);
  const lyricTarget = useRef<string | null>(null);
  const currentTrack = tracks.find((t) => t.id === current),
    playlist = playlists.find((p) => p.id === playlistId);
  const navigate = (next: View) => {
    setView(next);
    setPlaylistId(null);
    setSearch("");
  };
  useEffect(() => {
    void initialize();
    const beforeInstall = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const installed = () => {
      setInstall(null);
      useMusic.getState().notify("已安装，主屏幕见。");
    };
    const connected = () => setOnline(navigator.onLine);
    const updated = () => setHasUpdate(true);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    window.addEventListener("app-update", updated);
    const keyboard = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input, textarea, select, button, [contenteditable], dialog",
        ) ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(audio.currentTime + 5);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(audio.currentTime - 5);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      window.removeEventListener("app-update", updated);
      window.removeEventListener("keydown", keyboard);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useMusic.getState().notify(""), 6500);
    return () => clearTimeout(id);
  }, [notice]);
  const selectedTracks = useMemo(() => {
    let list = playlist
      ? playlist.tracks
          .map((id) => tracks.find((t) => t.id === id))
          .filter((t): t is Track => !!t)
      : view === "favorites"
        ? tracks.filter((t) => favorites.includes(t.id))
        : [...tracks];
    if (search) {
      const q = search.toLocaleLowerCase();
      list = list.filter((t) =>
        `${t.title} ${t.artist} ${t.album}`.toLocaleLowerCase().includes(q),
      );
    }
    return list.sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "artist"
          ? a.artist.localeCompare(b.artist)
          : b.added - a.added,
    );
  }, [tracks, favorites, view, playlist, search, sort]);
  async function pickMusic() {
    if (importing || !ready) return;
    const pickerWindow = window as unknown as {
      showOpenFilePicker?: (o: unknown) => Promise<MusicHandle[]>;
    };
    if (pickerWindow.showOpenFilePicker) {
      try {
        const handles = await pickerWindow.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: "音乐和歌词",
              accept: {
                "audio/*": [
                  ".mp3",
                  ".flac",
                  ".m4a",
                  ".aac",
                  ".ogg",
                  ".opus",
                  ".wav",
                  ".webm",
                  ".aiff",
                ],
                "text/plain": [".lrc"],
              },
            },
          ],
        });
        await importMusic(
          await Promise.all(
            handles.map(async (handle) => ({
              file: await handle.getFile(),
              handle,
            })),
          ),
        );
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    fileInput.current?.click();
  }
  async function pickFolder() {
    if (importing || !ready) return;
    type Directory = FileSystemDirectoryHandle & {
      values: () => AsyncIterable<MusicHandle | Directory>;
    };
    const pickerWindow = window as unknown as {
      showDirectoryPicker?: () => Promise<Directory>;
    };
    if (pickerWindow.showDirectoryPicker) {
      try {
        const directory = await pickerWindow.showDirectoryPicker();
        useMusic.setState({ importing: "正在读取文件夹…" });
        const incoming: MusicSource[] = [];
        let skipped = 0;
        async function walk(dir: Directory, path: string) {
          for await (const handle of dir.values()) {
            try {
              if (handle.kind === "directory")
                await walk(handle as Directory, `${path}/${handle.name}`);
              else {
                const fileHandle = handle as MusicHandle;
                if (
                  /\.(mp3|flac|m4a|aac|ogg|opus|wav|webm|aiff?|lrc)$/i.test(
                    fileHandle.name,
                  )
                )
                  incoming.push({
                    file: await fileHandle.getFile(),
                    handle: fileHandle,
                    relativePath: `${path}/${fileHandle.name}`,
                  });
              }
            } catch {
              skipped++;
            }
          }
        }
        await walk(directory, directory.name);
        useMusic.setState({ importing: "" });
        await importMusic(incoming);
        if (skipped)
          useMusic
            .getState()
            .notify(
              `${useMusic.getState().notice} · ${skipped} 个文件或子文件夹无法读取，已跳过`,
            );
        return;
      } catch (e) {
        useMusic.setState({ importing: "" });
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    folderInput.current?.click();
  }
  function pickLyrics(id = current) {
    if (!id) return;
    lyricTarget.current = id;
    lyricInput.current?.click();
  }
  async function installApp() {
    if (!install) {
      useMusic
        .getState()
        .notify(
          "在 Android Chrome 菜单中选择「添加到主屏幕」或「安装应用」。iPhone 请用 Safari 的分享菜单添加到主屏幕。",
        );
      return;
    }
    await install.prompt();
    await install.userChoice;
    setInstall(null);
  }
  const links: { id: View; label: string; icon: ReactNode }[] = [
    { id: "library", label: "音乐库", icon: <Library /> },
    { id: "favorites", label: "我喜欢", icon: <Heart /> },
    { id: "playlists", label: "歌单", icon: <ListMusic /> },
    { id: "settings", label: "设置", icon: <SlidersHorizontal /> },
  ];
  const title =
    playlist?.name ||
    {
      library: "音乐库",
      favorites: "我喜欢",
      playlists: "我的歌单",
      settings: "聆听偏好",
    }[view];
  const listVisible = view === "library" || view === "favorites" || !!playlist;
  return (
    <div
      className={`app ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (ready)
          void importMusic(
            Array.from(e.dataTransfer.files).map((file) => ({ file })),
          );
      }}
    >
      <input
        ref={fileInput}
        data-testid="music-input"
        type="file"
        multiple
        accept="audio/*,.flac,.m4a,.opus,.lrc"
        hidden
        onChange={(e) => {
          void importMusic(
            Array.from(e.target.files || []).map((file) => ({ file })),
          );
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        data-testid="folder-input"
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        hidden
        onChange={(e) => {
          void importMusic(
            Array.from(e.target.files || []).map((file) => ({ file })),
          );
          e.target.value = "";
        }}
      />
      <input
        ref={lyricInput}
        data-testid="lyric-input"
        type="file"
        accept=".lrc,text/plain"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && lyricTarget.current) {
            try {
              await saveLyrics(lyricTarget.current, await file.text());
              useMusic.getState().notify("歌词已保存");
            } catch {
              useMusic.getState().notify("歌词保存失败，请重试");
            }
          }
        }}
      />
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("library");
          }}
        >
          <span className="brand-icon">
            <Disc3 size={25} />
          </span>
          <span>
            neukarustihS<small>LOCAL MUSIC / AFTER HOURS</small>
          </span>
        </a>
        <div className="sidebar-section-label">你的音乐空间</div>
        <nav aria-label="主导航">
          {links.slice(0, 3).map((link) => (
            <button
              key={link.id}
              className={
                view === link.id && !playlist ? "nav-link active" : "nav-link"
              }
              onClick={() => navigate(link.id)}
            >
              {link.icon}
              <span>{link.label}</span>
              {link.id === "favorites" && <small>{favorites.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label playlist-label">
          私藏歌单
          <IconButton
            label="新建歌单"
            onClick={() => {
              setPlaylistName("");
              setPlaylistForm("new");
            }}
          >
            <Plus size={16} />
          </IconButton>
        </div>
        <div className="sidebar-playlists">
          {playlists.length ? (
            playlists.map((p) => (
              <button
                key={p.id}
                className={
                  p.id === playlistId ? "playlist-link active" : "playlist-link"
                }
                onClick={() => {
                  setView("playlists");
                  setPlaylistId(p.id);
                  setSearch("");
                }}
              >
                <span className="playlist-dot">#</span>
                <span>{p.name}</span>
                <small>{p.tracks.length}</small>
              </button>
            ))
          ) : (
            <p>
              把喜欢的声音
              <br />
              收进自己的歌单。
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={21} />
            <div>
              音乐，属于你。<small>本地播放 · 无需账号</small>
            </div>
          </div>
          <button
            className={view === "settings" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("settings")}
          >
            <Settings2 />
            <span>设置</span>
          </button>
          <span className="sidebar-caption">
            STAY A LITTLE LONGER. <span>✳</span>
          </span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="mobile-brand">
            <Disc3 size={23} />
            <strong>neukarustihS</strong>
          </div>
          <span className="desktop-breadcrumb">
            我的空间 <span>/</span> {title}
          </span>
          <div className="topbar-right">
            <span className="connection">
              {online ? "LOCAL FIRST" : "离线模式"}
            </span>
            <IconButton label="安装应用" onClick={() => void installApp()}>
              <Download size={19} />
            </IconButton>
          </div>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow accent">
                {view === "favorites"
                  ? "ON REPEAT, IN YOUR HEART"
                  : view === "settings"
                    ? "MAKE YOURSELF AT HOME"
                    : view === "playlists"
                      ? "A MIX OF YOUR OWN"
                      : "SOUNDS LIKE YOUR NIGHT"}
              </span>
              <h1>
                {title}
                <span className="title-dot">.</span>
              </h1>
            </div>
            {view !== "settings" && (
              <button
                className="primary import-top"
                onClick={() => setImportOpen(true)}
                disabled={!!importing || !ready}
              >
                {importing ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Plus size={18} />
                )}
                <span>{importing ? "导入中" : "导入音乐"}</span>
              </button>
            )}
          </div>
          {view === "library" && !search && (
            <section className={`welcome ${tracks.length ? "compact" : ""}`}>
              <div className="welcome-copy">
                <span className="eyebrow">YOUR MUSIC. YOUR MIDNIGHT.</span>
                <h2>
                  {tracks.length ? (
                    "让喜欢的声音，继续。"
                  ) : (
                    <>
                      把夜晚，
                      <br />
                      调成你的频率。
                    </>
                  )}
                </h2>
                <p>
                  {tracks.length
                    ? `${tracks.length} 首私藏，随时开始。`
                    : "导入音乐文件夹，把你的私藏带进来。"}
                </p>
                <div className="welcome-actions">
                  <button
                    className="primary"
                    disabled={!!importing || !ready}
                    onClick={() =>
                      tracks.length
                        ? void play(
                            selectedTracks[0].id,
                            selectedTracks.map((t) => t.id),
                          )
                        : void pickFolder()
                    }
                  >
                    {tracks.length ? (
                      <Play size={17} fill="currentColor" />
                    ) : (
                      <FolderOpen size={18} />
                    )}
                    {tracks.length ? "播放全部" : "导入文件夹"}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!importing || !ready}
                    onClick={() =>
                      tracks.length ? void pickFolder() : void pickMusic()
                    }
                  >
                    {tracks.length ? (
                      <FolderOpen size={16} />
                    ) : (
                      <Music2 size={16} />
                    )}
                    {tracks.length ? "添加文件夹" : "选择文件"}
                  </button>
                </div>
              </div>
              <div className="welcome-art">
                <Cover />
                <span className="vertical-note">夜は、まだこれから。</span>
              </div>
              <span className="welcome-index">N° 001 / YOUR COLLECTION</span>
            </section>
          )}
          {listVisible && (
            <>
              <div className="library-toolbar">
                <div className="library-tabs">
                  <span className="selected">
                    {playlist
                      ? "歌单歌曲"
                      : view === "favorites"
                        ? "收藏歌曲"
                        : "全部歌曲"}{" "}
                    <small>{selectedTracks.length}</small>
                  </span>
                  {playlist && (
                    <IconButton
                      label="歌单设置"
                      onClick={() => {
                        setPlaylistName(playlist.name);
                        setPlaylistForm("rename");
                      }}
                    >
                      <Ellipsis size={19} />
                    </IconButton>
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
                      <button
                        aria-label="清除搜索"
                        onClick={() => setSearch("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <select
                    aria-label="歌曲排序"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="added">最近添加</option>
                    <option value="title">歌曲名称</option>
                    <option value="artist">艺术家</option>
                  </select>
                </div>
              </div>
              {selectedTracks.length ? (
                <div className="track-list">
                  <div className="track-list-head">
                    <span>#</span>
                    <span>歌曲 / 艺术家</span>
                    <span className="album-column">专辑</span>
                    <span>时长</span>
                    <span />
                  </div>
                  {selectedTracks.map((t, i) => (
                    <div
                      className={`track-row ${current === t.id ? "is-current" : ""}`}
                      key={t.id}
                    >
                      <span className="track-number">
                        {current === t.id && playing ? (
                          <span className="equalizer">
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </span>
                      <button
                        className="track-main"
                        onClick={() =>
                          void play(
                            t.id,
                            selectedTracks.map((t) => t.id),
                          )
                        }
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
                        onClick={() => setActionTrack(t)}
                      >
                        <Ellipsis size={20} />
                      </IconButton>
                    </div>
                  ))}
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
                  {!search && view === "library" && (
                    <button
                      className="text-button"
                      onClick={() => void pickMusic()}
                      disabled={!!importing || !ready}
                    >
                      <Upload size={16} />
                      选择文件，或拖拽音乐到这里
                    </button>
                  )}
                  {playlist && (
                    <button
                      className="secondary"
                      onClick={() => navigate("library")}
                    >
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
          )}
          {view === "playlists" && !playlist && (
            <>
              <div className="section-heading">
                <p>{playlists.length} 张歌单，每一种心情都有归处。</p>
                <button
                  className="secondary"
                  onClick={() => {
                    setPlaylistName("");
                    setPlaylistForm("new");
                  }}
                >
                  <Plus size={17} />
                  新建歌单
                </button>
              </div>
              <div className="playlist-grid">
                {playlists.map((p, i) => (
                  <button
                    className="playlist-card"
                    key={p.id}
                    onClick={() => setPlaylistId(p.id)}
                  >
                    <div className={`playlist-cover variant-${i % 3}`}>
                      <ListMusic size={54} />
                      <span>{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <h3>{p.name}</h3>
                    <p>{p.tracks.length} 首歌曲</p>
                  </button>
                ))}
                <button
                  className="new-playlist-card"
                  onClick={() => {
                    setPlaylistName("");
                    setPlaylistForm("new");
                  }}
                >
                  <Plus size={30} />
                  <span>创建一张属于你的歌单</span>
                </button>
              </div>
            </>
          )}
          {view === "settings" && (
            <div className="settings-list">
              <section>
                <h2>
                  <Download size={20} />
                  放在主屏幕
                </h2>
                <p>像 App 一样打开，留一盏灯给你的音乐。</p>
                <button className="primary" onClick={() => void installApp()}>
                  <Download size={17} />
                  安装 neukarustihS
                </button>
                {hasUpdate && (
                  <button
                    className="secondary"
                    onClick={() => {
                      audio.pause();
                      void updateApp(true);
                    }}
                  >
                    更新并重新打开
                  </button>
                )}
              </section>
              <section>
                <h2>
                  <Timer size={20} />
                  睡眠定时
                </h2>
                <p>
                  {sleepUntil
                    ? `将在 ${new Date(sleepUntil).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 暂停播放`
                    : "给深夜的聆听，留一个温柔的句号。"}
                </p>
                <div className="timer-options">
                  {[0, 15, 30, 60].map((n) => (
                    <button
                      className={
                        !n && !sleepUntil ? "secondary active" : "secondary"
                      }
                      key={n}
                      onClick={() => {
                        setSleep(n);
                        useMusic
                          .getState()
                          .notify(n ? `${n} 分钟后暂停播放` : "已关闭睡眠定时");
                      }}
                    >
                      {n ? `${n} 分钟` : "关闭"}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2>
                  <ShieldCheck size={20} />
                  本地音乐，轻量保存
                </h2>
                <p>
                  音乐直接从你选择的文件播放，不上传，也不复制整首音频。歌单、收藏、封面和歌词保存在当前浏览器。
                </p>
                <p>
                  重新打开后若无法播放，请再次选择原文件或文件夹来连接。清理浏览器网站数据会移除保存的音乐库信息。
                </p>
                <button
                  className="secondary"
                  onClick={() => setImportOpen(true)}
                  disabled={!!importing || !ready}
                >
                  <FolderOpen size={17} />
                  重新连接音乐
                </button>
              </section>
              <section>
                <h2>
                  <Headphones size={20} />
                  一些小默契
                </h2>
                <p>空格：播放 / 暂停　← / →：后退 / 前进 5 秒</p>
                <p>
                  支持系统媒体控制。音频格式、后台播放与锁屏控制取决于设备和浏览器。
                </p>
                <div className="about-brand">
                  neukarustihS <span>v1.0 · AFTER HOURS</span>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
      <Player
        onLyrics={() => pickLyrics()}
        onQueue={() => setQueueOpen(true)}
      />
      {currentTrack && (
        <div className="mini-player">
          <button className="mini-song" onClick={() => setPlayerOpen(true)}>
            <Cover track={currentTrack} />
            <span>
              <strong>{currentTrack.title}</strong>
              <small>{currentTrack.artist}</small>
            </span>
          </button>
          <IconButton label={playing ? "暂停" : "播放"} onClick={togglePlay}>
            {playing ? (
              <Pause fill="currentColor" />
            ) : (
              <Play fill="currentColor" />
            )}
          </IconButton>
          <IconButton label="播放队列" onClick={() => setQueueOpen(true)}>
            <ListMusic />
          </IconButton>
        </div>
      )}
      <nav className="bottom-nav" aria-label="手机导航">
        {links.map((link) => (
          <button
            className={view === link.id ? "active" : ""}
            key={link.id}
            onClick={() => navigate(link.id)}
          >
            {link.icon}
            <span>{link.label}</span>
          </button>
        ))}
      </nav>
      {importOpen && (
        <Modal title="导入音乐" onClose={() => setImportOpen(false)}>
          <div className="import-options">
            <button
              className="import-option recommended"
              onClick={() => {
                setImportOpen(false);
                void pickFolder();
              }}
              disabled={!!importing || !ready}
            >
              <FolderOpen size={27} />
              <span>
                <strong>导入文件夹</strong>
                <small>包含子文件夹里的音乐和同名歌词</small>
              </span>
            </button>
            <button
              className="import-option"
              onClick={() => {
                setImportOpen(false);
                void pickMusic();
              }}
              disabled={!!importing || !ready}
            >
              <Music2 size={25} />
              <span>
                <strong>选择音乐文件</strong>
                <small>也可以一次选择多首歌曲</small>
              </span>
            </button>
          </div>
          <p className="import-help">
            音乐在几个文件夹里？可以逐个添加，已导入的歌曲不会重复出现。重新选择原文件夹也能连接已有音乐。
          </p>
          <p className="import-help">
            如果设备的选择器不支持文件夹，请使用「选择音乐文件」多选导入。
          </p>
        </Modal>
      )}
      {playerOpen && (
        <Modal title="正在播放" onClose={() => setPlayerOpen(false)}>
          <Player
            mobile
            close={() => setPlayerOpen(false)}
            onLyrics={() => pickLyrics()}
            onQueue={() => setQueueOpen(true)}
          />
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <IconButton
            label="关闭提示"
            onClick={() => useMusic.getState().notify("")}
          >
            <X size={17} />
          </IconButton>
        </div>
      )}
      {importing && (
        <div className="import-status" role="status">
          <LoaderCircle size={16} className="spin" />
          {importing}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <Upload size={44} />
          <h2>松开，让音乐进来。</h2>
        </div>
      )}
      {queueOpen && (
        <Modal
          title={`播放队列 · ${queue.length}`}
          onClose={() => setQueueOpen(false)}
        >
          <div className="queue-list">
            {queue.length ? (
              queue.map((id, i) => {
                const t = tracks.find((t) => t.id === id);
                if (!t) return null;
                return (
                  <div
                    className={`queue-row ${id === current ? "active" : ""}`}
                    key={id}
                  >
                    <button
                      className="queue-song"
                      onClick={() => void play(id)}
                    >
                      <span>
                        {id === current ? <Volume2 size={17} /> : i + 1}
                      </span>
                      <span>
                        <strong>{t.title}</strong>
                        <small>{t.artist}</small>
                      </span>
                    </button>
                    <IconButton
                      label={`${t.title} 上移`}
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...queue];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        useMusic.setState({ queue: next });
                      }}
                    >
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton
                      label={`${t.title} 下移`}
                      disabled={i === queue.length - 1}
                      onClick={() => {
                        const next = [...queue];
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        useMusic.setState({ queue: next });
                      }}
                    >
                      <ArrowDown size={16} />
                    </IconButton>
                    <IconButton
                      label={`${t.title} 移出队列`}
                      onClick={() =>
                        useMusic.setState({
                          queue: queue.filter((t) => t !== id),
                        })
                      }
                    >
                      <X size={17} />
                    </IconButton>
                  </div>
                );
              })
            ) : (
              <div className="modal-empty">
                <ListMusic size={36} />
                <p>播放一首歌，就从这里继续。</p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {actionTrack && !confirmDelete && (
        <Modal title={actionTrack.title} onClose={() => setActionTrack(null)}>
          <div className="action-list">
            <button
              onClick={() => {
                useMusic.getState().toggleFavorite(actionTrack.id);
                setActionTrack(null);
              }}
            >
              <Heart size={19} />
              {favorites.includes(actionTrack.id) ? "取消收藏" : "加入我喜欢"}
            </button>
            <button
              onClick={() => {
                enqueue(actionTrack.id);
                setActionTrack(null);
              }}
            >
              <ListMusic size={19} />
              加入播放队列
            </button>
            <button
              onClick={() => {
                pickLyrics(actionTrack.id);
                setActionTrack(null);
              }}
            >
              <Music2 size={19} />
              导入 LRC 歌词
            </button>
            <p className="action-label">添加到歌单</p>
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  useMusic.getState().addToPlaylist(p.id, actionTrack.id);
                  useMusic.getState().notify(`已加入「${p.name}」`);
                  setActionTrack(null);
                }}
              >
                <Plus size={18} />
                <span>{p.name}</span>
                {p.tracks.includes(actionTrack.id) && <Check size={17} />}
              </button>
            ))}
            <button
              onClick={() => {
                setPlaylistName("");
                setPlaylistForm("new");
              }}
            >
              <Plus size={18} />
              新建歌单并加入
            </button>
            {playlist && (
              <button
                onClick={() => {
                  useMusic
                    .getState()
                    .removeFromPlaylist(playlist.id, actionTrack.id);
                  setActionTrack(null);
                }}
              >
                <X size={18} />
                从当前歌单移除
              </button>
            )}
            <button
              className="danger"
              onClick={() => setConfirmDelete("track")}
            >
              <Trash2 size={18} />
              从音乐库移除
            </button>
          </div>
        </Modal>
      )}
      {playlistForm && (
        <Modal
          title={playlistForm === "new" ? "新建歌单" : "编辑歌单"}
          onClose={() => setPlaylistForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!playlistName.trim()) return;
              if (playlistForm === "new") {
                const id = useMusic.getState().createPlaylist(playlistName);
                if (actionTrack) {
                  useMusic.getState().addToPlaylist(id, actionTrack.id);
                  setActionTrack(null);
                }
                setPlaylistId(id);
                setView("playlists");
              } else if (playlist)
                useMusic.getState().updatePlaylist(playlist.id, playlistName);
              setPlaylistForm(null);
            }}
          >
            <label className="form-label">
              给这段心情起个名字
              <input
                autoFocus
                maxLength={60}
                placeholder="比如：末班车的耳机里"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                required
              />
            </label>
            <div className="form-footer">
              {playlistForm === "rename" && (
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => {
                    setPlaylistForm(null);
                    setConfirmDelete("playlist");
                  }}
                >
                  <Trash2 size={16} />
                  删除歌单
                </button>
              )}
              <button
                className="primary"
                type="submit"
                disabled={!playlistName.trim()}
              >
                保存歌单
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDelete && (
        <Modal
          title={
            confirmDelete === "track" ? "从音乐库移除？" : "删除这张歌单？"
          }
          onClose={() => setConfirmDelete(null)}
        >
          <p className="confirm-text">
            {confirmDelete === "track"
              ? "歌曲会从音乐库、收藏和歌单中移除。你的原始音乐文件不会被删除。"
              : "只删除歌单，音乐库里的歌曲仍会保留。"}
          </p>
          <div className="form-footer">
            <button
              className="secondary"
              onClick={() => setConfirmDelete(null)}
            >
              取消
            </button>
            <button
              className="primary danger-bg"
              onClick={async () => {
                try {
                  if (confirmDelete === "track" && actionTrack) {
                    await removeTrack(actionTrack.id);
                    setActionTrack(null);
                  } else if (playlist) {
                    useMusic.getState().deletePlaylist(playlist.id);
                    setPlaylistId(null);
                  }
                  setConfirmDelete(null);
                } catch {
                  useMusic.getState().notify("移除失败，请重试");
                }
              }}
            >
              确认移除
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default App;
