import { ListMusic, Plus } from "lucide-react";
import { useMusic } from "../../music/store";
import { openDialog, openPlaylist } from "../state";

export function PlaylistsGrid() {
  const playlists = useMusic((s) => s.playlists);
  return (
    <>
      <div className="section-heading">
        <p>{playlists.length} 张歌单，每一种心情都有归处。</p>
        <button
          className="secondary"
          onClick={() => openDialog({ kind: "playlistForm" })}
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
            onClick={() => openPlaylist(p.id)}
          >
            <div className={`playlist-cover variant-${i % 3}`}>
              <ListMusic size={54} />
              <span>{String(i + 1).padStart(2, "0")}</span>
            </div>
            <h3>{p.name}</h3>
            <p>{p.tracks.length} 首歌曲</p>
          </button>
        ))}
        {!playlists.length && (
          <div className="playlist-empty">
            <ListMusic size={32} />
            <h3>给喜欢的歌一个归处</h3>
            <p>点击右上方「新建歌单」，收集你的下一段心情。</p>
          </div>
        )}
      </div>
    </>
  );
}
