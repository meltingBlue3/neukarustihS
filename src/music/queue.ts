// Which track plays next. Pure, so the rules are testable without audio.

export type PlaybackMode = "all" | "one" | "shuffle";

export function nextTrack(
  queue: string[],
  current: string | null,
  direction: number,
  repeat: string,
): string | null {
  if (!queue.length) return null;
  const index = queue.indexOf(current ?? "");
  const next = index + direction;
  if (next >= queue.length) return repeat === "all" ? queue[0] : null;
  if (next < 0) return repeat === "all" ? queue[queue.length - 1] : queue[0];
  return queue[next];
}

export interface QueueState {
  queue: string[];
  current: string | null;
  history: string[];
  playbackMode: PlaybackMode;
}

// A manual or automatic skip. Shuffle avoids repeats until every queued track
// has played, and steps back through what actually played. Other modes wrap
// around the queue.
export function chooseSkip(
  { queue, current, history, playbackMode }: QueueState,
  direction: number,
  random = Math.random,
): { target: string | null; history: string[]; fromHistory?: boolean } {
  if (playbackMode === "shuffle" && direction < 0 && history.length)
    return {
      target: history[history.length - 1],
      history: history.slice(0, -1),
      fromHistory: true,
    };
  if (playbackMode === "shuffle" && queue.length > 1) {
    const remaining = queue.filter(
      (id) => id !== current && !history.includes(id),
    );
    const candidates = remaining.length
      ? remaining
      : queue.filter((id) => id !== current);
    return {
      target: candidates[Math.floor(random() * candidates.length)],
      history: remaining.length ? history : [],
    };
  }
  return { target: nextTrack(queue, current, direction, "all"), history };
}
