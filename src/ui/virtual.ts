// Long lists render only the rows near the viewport, so a library of
// thousands of songs stays as quick as a short one.
import { useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

// Where a list starts within its scroller (the window when there is none).
// Content above it, such as a heading or a welcome card, can change height.
export function useListOffset(
  list: HTMLElement | null,
  scroller?: HTMLElement | null,
) {
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    if (!list) return;
    // Observing also delivers a first measurement before the next paint.
    const observer = new ResizeObserver(() => {
      const top = list.getBoundingClientRect().top;
      setOffset(
        scroller
          ? top - scroller.getBoundingClientRect().top + scroller.scrollTop
          : top + window.scrollY,
      );
    });
    observer.observe(scroller ?? document.body);
    return () => observer.disconnect();
  }, [list, scroller]);
  return offset;
}

// The visible rows, with padding standing in for the rows left out so the
// list keeps its full height. Rows stay in normal flow for the stylesheet.
export function visibleRows<Scroller extends Element | Window>(
  virtualizer: Virtualizer<Scroller, Element>,
) {
  const rows = virtualizer.getVirtualItems();
  const margin = virtualizer.options.scrollMargin;
  const total = virtualizer.getTotalSize();
  const style: CSSProperties = rows.length
    ? {
        paddingTop: rows[0].start - margin,
        paddingBottom: total - (rows[rows.length - 1].end - margin),
      }
    : { paddingBottom: total };
  return { rows, style };
}
