
import { useCallback, useRef, useEffect } from "react";

interface UseInfiniteScrollOptions {
  /** Ref to the scrollable container */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Whether more data exists to load */
  hasMore: boolean;
  /** Whether a fetch is in progress */
  loading: boolean;
  /** Pixels from bottom to trigger load (default 250) */
  threshold?: number;
  /** Throttle scroll events in ms (default 150) */
  throttleMs?: number;
  /** Called when user scrolls near bottom */
  onLoadMore: () => void;
}

/**
 * Attaches a throttled scroll listener to a container ref.
 * Calls onLoadMore when user scrolls within `threshold` px of the bottom.
 * Scroll UP is free — already-fetched data is served from Redux accumulator.
 */
export function useInfiniteScroll({
  containerRef,
  hasMore,
  loading,
  threshold = 250,
  throttleMs = 150,
  onLoadMore,
}: UseInfiniteScrollOptions): void {
  const loadingRef = useRef(loading);
  const hasMoreRef = useRef(hasMore);
  const onLoadMoreRef = useRef(onLoadMore);

  // Keep refs in sync without triggering effect re-runs
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { onLoadMoreRef.current = onLoadMore; }, [onLoadMore]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (loadingRef.current || !hasMoreRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight <= threshold) {
      onLoadMoreRef.current();
    }
  }, [containerRef, threshold]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;
    let lastCall = 0;

    const throttledScroll = () => {
      const now = Date.now();
      if (now - lastCall < throttleMs) return;
      lastCall = now;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleScroll);
    };

    el.addEventListener("scroll", throttledScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", throttledScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [containerRef, handleScroll, throttleMs]);
}
