import {
  Check,
  Heart,
  ListMusic,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { syncTrackLyrics } from "../../music/library";
import { enqueue } from "../../music/playback";
import { useMusic } from "../../music/store";
import { notify } from "../../notice";
import { Modal } from "../common";
import { closeAllDialogs, closeDialog, openDialog, useUi } from "../state";

export function TrackActionsDialog({ trackId }: { trackId: string }) {
  const track = useMusic((s) => s.tracks.find((t) => t.id === trackId)),
    favorite = useMusic((s) => s.favorites.includes(trackId)),
    playlists = useMusic((s) => s.playlists),
    busy = useMusic((s) => !!s.importing || !s.ready);
  // Viewing a playlist offers to take the song out of it.
  const shownPlaylist = useUi((s) =>
    playlists.find((p) => p.id === s.playlistId),
  );
  if (!track) return null;
  const music = useMusic.getState();
  return (
    <Modal title={track.title} onClose={closeDialog}>
      <div className="action-list">
        <button
          onClick={() => {
            music.toggleFavorite(trackId);
            closeDialog();
          }}
        >
          <Heart size={19} />
          {favorite ? "取消收藏" : "加入我喜欢"}
        </button>
        <button
          onClick={() => {
            enqueue(trackId);
            closeDialog();
          }}
        >
          <ListMusic size={19} />
          加入播放队列
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            closeAllDialogs();
            notify("");
            if ((await syncTrackLyrics(trackId)) === "needs-folder")
              openDialog({ kind: "syncLyrics", trackId });
          }}
        >
          <RefreshCw size={19} />
          同步歌词
        </button>
        <p className="action-label">添加到歌单</p>
        {playlists.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              music.addToPlaylist(p.id, trackId);
              notify(`已加入「${p.name}」`);
              closeDialog();
            }}
          >
            <Plus size={18} />
            <span>{p.name}</span>
            {p.tracks.includes(trackId) && <Check size={17} />}
          </button>
        ))}
        <button
          onClick={() =>
            openDialog({ kind: "playlistForm", addTrackId: trackId })
          }
        >
          <Plus size={18} />
          新建歌单并加入
        </button>
        {shownPlaylist && (
          <button
            onClick={() => {
              music.removeFromPlaylist(shownPlaylist.id, trackId);
              closeDialog();
            }}
          >
            <X size={18} />
            从当前歌单移除
          </button>
        )}
        <button
          className="danger"
          onClick={() => openDialog({ kind: "removeTrack", trackId })}
        >
          <Trash2 size={18} />
          从音乐库移除
        </button>
      </div>
    </Modal>
  );
}
