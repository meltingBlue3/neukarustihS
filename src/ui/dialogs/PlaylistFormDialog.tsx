import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMusic } from "../../music/store";
import { Modal } from "../common";
import {
  closeAllDialogs,
  closeDialog,
  openDialog,
  openPlaylist,
} from "../state";

// Create a playlist (optionally with a first song), or rename one.
export function PlaylistFormDialog({
  playlistId,
  addTrackId,
}: {
  playlistId?: string;
  addTrackId?: string;
}) {
  const playlist = useMusic((s) =>
    s.playlists.find((p) => p.id === playlistId),
  );
  const [name, setName] = useState(playlist?.name ?? "");
  const music = useMusic.getState();
  return (
    <Modal title={playlist ? "编辑歌单" : "新建歌单"} onClose={closeDialog}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (playlist) {
            music.updatePlaylist(playlist.id, name);
            closeDialog();
            return;
          }
          const id = music.createPlaylist(name);
          if (addTrackId) music.addToPlaylist(id, addTrackId);
          closeAllDialogs();
          openPlaylist(id);
        }}
      >
        <label className="form-label">
          给这段心情起个名字
          <input
            autoFocus
            maxLength={60}
            placeholder="比如：末班车的耳机里"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <div className="form-footer">
          {playlist && (
            <button
              type="button"
              className="text-button danger"
              onClick={() =>
                openDialog({ kind: "deletePlaylist", playlistId: playlist.id })
              }
            >
              <Trash2 size={16} />
              删除歌单
            </button>
          )}
          <button className="primary" type="submit" disabled={!name.trim()}>
            保存歌单
          </button>
        </div>
      </form>
    </Modal>
  );
}
