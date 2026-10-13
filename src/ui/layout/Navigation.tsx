import type { ReactNode } from "react";
import {
  Heart,
  Library,
  ListMusic,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useMusic } from "../../music/store";
import { IconButton } from "../common";
import { useOnline, usePageTitle, useShownPlaylist } from "../hooks";
import { navigate, openDialog, openPlaylist, useUi } from "../state";
import type { View } from "../state";

const links: { id: View; label: string; icon: ReactNode }[] = [
  { id: "library", label: "音乐库", icon: <Library /> },
  { id: "favorites", label: "我喜欢", icon: <Heart /> },
  { id: "playlists", label: "歌单", icon: <ListMusic /> },
  { id: "settings", label: "设置", icon: <SlidersHorizontal /> },
];
const logo = `${import.meta.env.BASE_URL}favicon.svg`;

// Wide screens: brand, pages and playlists down the left side.
export function Sidebar() {
  const view = useUi((s) => s.view),
    playlistId = useUi((s) => s.playlistId);
  const playlists = useMusic((s) => s.playlists),
    favoriteCount = useMusic((s) => s.favorites.length);
  const shownPlaylist = useShownPlaylist();
  return (
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
          <img src={logo} alt="" width={28} height={28} />
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
              view === link.id && !shownPlaylist
                ? "nav-link active"
                : "nav-link"
            }
            onClick={() => navigate(link.id)}
          >
            {link.icon}
            <span>{link.label}</span>
            {link.id === "favorites" && <small>{favoriteCount}</small>}
          </button>
        ))}
      </nav>
      <div className="sidebar-section-label playlist-label">
        私藏歌单
        <IconButton
          label="新建歌单"
          onClick={() => openDialog({ kind: "playlistForm" })}
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
              onClick={() => openPlaylist(p.id)}
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
  );
}

// Phones: page tabs along the bottom.
export function MobileNav() {
  const view = useUi((s) => s.view);
  return (
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
  );
}

export function TopBar() {
  const title = usePageTitle();
  const online = useOnline();
  return (
    <header className="topbar">
      <div className="mobile-brand">
        <img src={logo} alt="" width={28} height={28} />
        <strong>neukarustihS</strong>
      </div>
      <span className="desktop-breadcrumb">
        我的空间 <span>/</span> {title}
      </span>
      <div className="topbar-right">
        <span className="connection">
          {online ? "LOCAL FIRST" : "离线模式"}
        </span>
      </div>
    </header>
  );
}
