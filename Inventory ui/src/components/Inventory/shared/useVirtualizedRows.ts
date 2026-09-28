"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Windowed-scroll virtualization used identically across every Inventory
 * dataTable.tsx (physicalstockmodifcation, stock, physcialstockvarience,
 * storestockvarience). Extracted so the row-slicing math lives in one place —
 * behavior is unchanged, this is the same scrollTop-driven slice + spacer-row
 * approach each table already implemented independently.
 */
export function useVirtualizedRows<T>(
  rows: T[],
  containerRef: React.RefObject<HTMLDivElement>,
  options?: { rowHeight?: number; bufferRows?: number }
) {
  const ROW_HEIGHT = options?.rowHeight ?? 44;
  const BUFFER_ROWS = options?.bufferRows ?? 6;

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setContainerHeight(el.clientHeight);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalRows = rows.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIdx = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS);

  const visibleRows = useMemo(() => rows.slice(startIdx, endIdx), [rows, startIdx, endIdx]);
  const topSpacerHeight = startIdx * ROW_HEIGHT;
  const bottomSpacerHeight = (totalRows - endIdx) * ROW_HEIGHT;

  return {
    visibleRows,
    startIdx,
    endIdx,
    topSpacerHeight,
    bottomSpacerHeight,
    handleScroll,
  };
}
