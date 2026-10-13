import { useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ListMusic, Volume2, X } from "lucide-react";
import { play } from "../../music/playback";
import { useMusic, useTrackIndex } from "../../music/store";
import { IconButton, Modal } from "../common";
import { closeDialog } from "../state";
import { useListOffset, visibleRows } from "../virtual";

function move(queue: string[], from: number, to: number) {
  const next = [...queue];
  [next[from], next[to]] = [next[to], next[from]];
  useMusic.setState({ queue: next });
}

export function QueueDialog() {
  const queue = useMusic((s) => s.queue),
    index = useTrackIndex(),
    current = useMusic((s) => s.current);
  const entries = useMemo(
    () =>
      queue.flatMap((id, position) => {
        const track = index.get(id);
        return track ? [{ id, position, track }] : [];
      }),
    [queue, index],
  );
  // "Play all" queues the whole library, so the dialog scrolls a long list.
  const [listElement, setListElement] = useState<HTMLElement | null>(null);
  const scroller = listElement?.closest("dialog") ?? null;
  // The virtualizer changes without new props, which React Compiler's
  // memoization would miss. This project does not use the compiler.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scroller,
    estimateSize: () => 56,
    overscan: 8,
    scrollMargin: useListOffset(listElement, scroller),
    getItemKey: (i) => entries[i].id,
  });
  const { rows, style } = visibleRows(virtualizer);
  return (
    <Modal title={`播放队列 · ${queue.length}`} onClose={closeDialog}>
      <div className="queue-list">
        {entries.length ? (
          <div ref={setListElement} style={style}>
            {rows.map((row) => {
              const { id, position, track: t } = entries[row.index];
              return (
                <div
                  className={`queue-row ${id === current ? "active" : ""}`}
                  key={id}
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                >
                  <button className="queue-song" onClick={() => void play(id)}>
                    <span>
                      {id === current ? <Volume2 size={17} /> : position + 1}
                    </span>
                    <span>
                      <strong>{t.title}</strong>
                      <small>{t.artist}</small>
                    </span>
                  </button>
                  <IconButton
                    label={`${t.title} 上移`}
                    disabled={position === 0}
                    onClick={() => move(queue, position, position - 1)}
                  >
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton
                    label={`${t.title} 下移`}
                    disabled={position === queue.length - 1}
                    onClick={() => move(queue, position, position + 1)}
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
            })}
          </div>
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
