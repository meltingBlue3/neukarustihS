import { ListMusic, Pause, Play } from "lucide-react";
import { togglePlay } from "../../music/playback";
import { useMusic } from "../../music/store";
import { Cover, IconButton } from "../common";
import { openDialog, setPlayerOpen } from "../state";

// The phone's bar above the navigation; tapping the song opens the player.
export function MiniPlayer() {
  const track = useMusic((s) => s.tracks.find((t) => t.id === s.current)),
    playing = useMusic((s) => s.playing);
  if (!track) return null;
  return (
    <div className="mini-player">
      <button className="mini-song" onClick={() => setPlayerOpen(true)}>
        <Cover track={track} />
        <span>
          <strong>{track.title}</strong>
          <small>{track.artist}</small>
        </span>
      </button>
      <IconButton label={playing ? "暂停" : "播放"} onClick={togglePlay}>
        {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
      </IconButton>
      <IconButton
        label="播放队列"
        onClick={() => openDialog({ kind: "queue" })}
      >
        <ListMusic />
      </IconButton>
    </div>
  );
}
