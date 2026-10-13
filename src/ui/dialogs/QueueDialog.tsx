import { ArrowDown, ArrowUp, ListMusic, Volume2, X } from "lucide-react";
import { play } from "../../music/playback";
import { useMusic } from "../../music/store";
import { IconButton, Modal } from "../common";
import { closeDialog } from "../state";

function move(queue: string[], from: number, to: number) {
  const next = [...queue];
  [next[from], next[to]] = [next[to], next[from]];
  useMusic.setState({ queue: next });
}

export function QueueDialog() {
  const queue = useMusic((s) => s.queue),
    tracks = useMusic((s) => s.tracks),
    current = useMusic((s) => s.current);
  return (
    <Modal title={`播放队列 · ${queue.length}`} onClose={closeDialog}>
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
                <button className="queue-song" onClick={() => void play(id)}>
                  <span>{id === current ? <Volume2 size={17} /> : i + 1}</span>
                  <span>
                    <strong>{t.title}</strong>
                    <small>{t.artist}</small>
                  </span>
                </button>
                <IconButton
                  label={`${t.title} 上移`}
                  disabled={i === 0}
                  onClick={() => move(queue, i, i - 1)}
                >
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton
                  label={`${t.title} 下移`}
                  disabled={i === queue.length - 1}
                  onClick={() => move(queue, i, i + 1)}
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
  );
}
