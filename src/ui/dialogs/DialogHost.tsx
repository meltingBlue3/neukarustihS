import { removeTrack } from "../../music/library";
import { useMusic } from "../../music/store";
import { closeAllDialogs, navigate, useUi } from "../state";
import type { Dialog } from "../state";
import { ConfirmDialog } from "./ConfirmDialog";
import { ImportDialog } from "./ImportDialog";
import { PlaylistFormDialog } from "./PlaylistFormDialog";
import { QueueDialog } from "./QueueDialog";
import { SyncLyricsDialog } from "./SyncLyricsDialog";
import { TrackActionsDialog } from "./TrackActionsDialog";

function DialogView({ dialog }: { dialog: Dialog }) {
  switch (dialog.kind) {
    case "import":
      return <ImportDialog />;
    case "queue":
      return <QueueDialog />;
    case "trackActions":
      return <TrackActionsDialog trackId={dialog.trackId} />;
    case "playlistForm":
      return (
        <PlaylistFormDialog
          playlistId={dialog.playlistId}
          addTrackId={dialog.addTrackId}
        />
      );
    case "syncLyrics":
      return <SyncLyricsDialog trackId={dialog.trackId} />;
    case "removeTrack":
      return (
        <ConfirmDialog
          title="从音乐库移除？"
          message="歌曲会从音乐库、收藏和歌单中移除。你的原始音乐文件不会被删除。"
          onConfirm={async () => {
            await removeTrack(dialog.trackId);
            closeAllDialogs();
          }}
        />
      );
    case "deletePlaylist":
      return (
        <ConfirmDialog
          title="删除这张歌单？"
          message="只删除歌单，音乐库里的歌曲仍会保留。"
          onConfirm={() => {
            useMusic.getState().deletePlaylist(dialog.playlistId);
            closeAllDialogs();
            navigate("playlists");
          }}
        />
      );
  }
}

// Every open dialog, the most recent on top.
export function DialogHost() {
  const dialogs = useUi((s) => s.dialogs);
  return dialogs.map((dialog, i) => (
    <DialogView key={`${i}-${dialog.kind}`} dialog={dialog} />
  ));
}
