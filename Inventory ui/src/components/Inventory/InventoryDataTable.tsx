"use client";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           UniversalInventoryTable — Single Reusable Table        ║
 * ║  Replaces: OutletPhysical / WarehouseVariance / WarehouseStore   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * HOW TO USE — see bottom of file for all three usage examples.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

/** One column definition. */
export interface ColDef<R = Record<string, unknown>> {
  /** Unique key — used as React key + visibility map key */
  key: string;
  /** Header label shown in <thead> */
  label: string;
  /** px width hint (informational only — no longer enforced via CSS). */
  width?: number;
  /** Override alignment (default: "center") */
  align?: "left" | "center" | "right";
  /**
   * Value extractor / renderer.
   * Return a string/number for plain text cells.
   * Return a ReactNode for custom cells (buttons, icons, inputs …).
   */
  render: (row: R, meta: CellMeta) => ReactNode;
  /** If true, long text is clamped + tooltip shown */
  truncate?: boolean;
  /** If true, negative numeric values are styled red */
  colorNegative?: boolean;
}

export interface CellMeta {
  /** Row index (0-based) */
  idx: number;
  /** inputRefs array so editable cells can wire focus-jump */
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  /** Whether the value is negative (pre-computed) */
  isNegative: boolean;
}

export interface UniversalInventoryTableProps<R = Record<string, unknown>> {
  /** Array of row data */
  rows: R[];
  /** Column definitions (ordered) */
  columns: ColDef<R>[];
  /**
   * Optionally control which columns are visible.
   * Key = ColDef.key, value = true/false.
   * If omitted, all columns are visible.
   */
  visibleColumns?: Record<string, boolean>;
  /** Show skeleton loader */
  loading?: boolean;
  /**
   * Infinite-scroll: called when user scrolls near the bottom.
   * If omitted, no scroll listener is attached.
   */
  onScrollBottom?: () => void;
  /** When true, a mini loader row is appended at the bottom */
  hasMore?: boolean;
  /** Pass a ref if the parent needs to control the scroll container */
  tableContainerRef?: React.RefObject<HTMLDivElement>;
  /** Array ref for editable inputs — enables Enter→next-row focus */
  inputRefs?: React.MutableRefObject<(HTMLInputElement | null)[]>;
  /** Pixel offset from bottom to trigger onScrollBottom (default 120) */
  scrollThreshold?: number;
  /** Extra className on the root wrapper */
  className?: string;
  /** Max height override (CSS string). Default: "calc(87vh - 170px)" */
  maxHeight?: string;
  /** Unique row key extractor */
  rowKey?: (row: R, idx: number) => string | number;
}

// ─── Dot Loader (inline — no external dep needed) ─────────────────────────────

const DotLoader: React.FC = () => (
  <div className="flex items-center justify-center gap-1.5 py-6">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="h-2 w-2 rounded-full bg-blue-400 animate-bounce"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </div>
);

// ─── Tooltip wrapper (pure CSS — no MUI dep) ──────────────────────────────────

const TipCell: React.FC<{ tip: string; children: ReactNode; truncate?: boolean }> = ({
  tip,
  children,
  truncate,
}) => (
  <div className="group/tip relative inline-flex max-w-full">
    <span
      className={
        truncate
          ? "block max-w-[160px] truncate"
          : "inline-block"
      }
    >
      {children}
    </span>
    {tip && (
      <div
        className="
          pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5
          -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1
          text-[11px] leading-tight text-white opacity-0
          shadow-lg transition-opacity duration-150
          group-hover/tip:opacity-100
        "
      >
        {tip}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </div>
    )}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export function UniversalInventoryTable<R = Record<string, unknown>>({
  rows,
  columns,
  visibleColumns,
  loading = false,
  onScrollBottom,
  hasMore = false,
  tableContainerRef: externalRef,
  inputRefs: externalInputRefs,
  scrollThreshold = 120,
  className = "",
  maxHeight = "calc(87vh - 170px)",
  rowKey,
}: UniversalInventoryTableProps<R>) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef ?? internalRef;

  const internalInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const inputRefs = externalInputRefs ?? internalInputRefs;

  // ── filter visible columns ────────────────────────────────────────
  const visibleCols = columns.filter((col) =>
    visibleColumns ? visibleColumns[col.key] !== false : true
  );

  // ── tooltip-hide on scroll (pointer-events trick) ─────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf: number;
    const onScroll = () => {
      el.style.pointerEvents = "none";
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.pointerEvents = "";
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [containerRef]);

  // ── infinite scroll ───────────────────────────────────────────────
  useEffect(() => {
    if (!onScrollBottom) return;
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < scrollThreshold && hasMore && !loading) {
        onScrollBottom();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScrollBottom, hasMore, loading, scrollThreshold, containerRef]);

  // ── helpers ───────────────────────────────────────────────────────
  const getKey = (row: R, idx: number) =>
    rowKey ? rowKey(row, idx) : idx;

  const isInitialLoad = loading && rows.length === 0;

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className={`relative w-full min-w-0 overflow-hidden ${className}`}>
      {/* ── Scroll container ── */}
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        style={{ maxHeight }}
        className="
          w-full max-w-full overflow-auto rounded-xl border border-gray-200
          bg-white shadow-sm
        "
      >
        <table
          className="inventory-data-table w-full border-collapse"
          style={{ tableLayout: "auto" }}
        >
          {/* ── THEAD ── */}
          <thead
            className="sticky top-0 z-10 table-header-group"
            style={{ display: "table-header-group" }}
          >
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className="
                    bg-gray-50 px-3 py-3 text-[11px] font-bold
                    tracking-wider text-gray-500 uppercase border-b
                    border-gray-200 select-none whitespace-nowrap
                    text-center overflow-hidden
                  "
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── TBODY ── */}
          <tbody
            className="table-row-group"
            style={{
              display: "table-row-group",
              maxHeight: "none",
              overflow: "visible",
              width: "auto",
            }}
          >
            {/* ── Initial skeleton ── */}
            {isInitialLoad && (
              <tr>
                <td colSpan={visibleCols.length} className="border-none py-4">
                  <DotLoader />
                </td>
              </tr>
            )}

            {/* ── Empty state ── */}
            {!isInitialLoad && rows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleCols.length}
                  className="py-16 text-center text-sm text-gray-400"
                >
                  No records found
                </td>
              </tr>
            )}

            {/* ── Data rows ── */}
            {rows.map((row, idx) => (
              <tr
                key={getKey(row, idx)}
                className="
                  table-row
                  border-b border-gray-100 last:border-0
                  hover:bg-blue-50/40 transition-colors duration-100
                  even:bg-gray-50/30
                "
              >
                {visibleCols.map((col) => {
                  // pre-compute numeric negativity for colorNegative cols
                  const rawForNeg = (row as Record<string, unknown>)[col.key];
                  const numVal =
                    typeof rawForNeg === "number"
                      ? rawForNeg
                      : typeof rawForNeg === "string" && !isNaN(Number(rawForNeg))
                      ? Number(rawForNeg)
                      : null;
                  const isNegative = col.colorNegative
                    ? numVal !== null && numVal < 0
                    : false;

                  const meta: CellMeta = { idx, inputRefs, isNegative };
                  const content = col.render(row, meta);

                  // tooltip text — only for string/number leaves
                  const tipText =
                    typeof content === "string" || typeof content === "number"
                      ? String(content)
                      : "";

                  return (
                    <td
                      key={col.key}
                      className={[
                        "table-cell px-3 py-2.5 text-[13px] align-middle overflow-hidden",
                        col.align === "left"
                          ? "text-left"
                          : col.align === "right"
                          ? "text-right"
                          : "text-center",
                        isNegative
                          ? "text-red-600 font-semibold"
                          : "text-gray-700",
                      ].join(" ")}
                    >
                      {col.truncate ? (
                        <TipCell tip={tipText} truncate>
                          {content}
                        </TipCell>
                      ) : tipText ? (
                        <TipCell tip={tipText}>{content}</TipCell>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* ── Append loader (infinite scroll) ── */}
            {loading && rows.length > 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="border-none py-2">
                  <DotLoader />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(UniversalInventoryTable) as typeof UniversalInventoryTable;

// ═══════════════════════════════════════════════════════════════════════════════
//  EDITABLE PHYSICAL STOCK INPUT — shared helper used by outlet + warehouse
// ═══════════════════════════════════════════════════════════════════════════════

interface PhysicalStockInputProps {
  rowKey: string;
  idx: number;
  initialValue?: number | string;
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onChange: (value: string) => void;
  width?: string;
  /** called when user presses Enter */
  onEnterNext?: () => void;
}

export const PhysicalStockInput: React.FC<PhysicalStockInputProps> = ({
  rowKey,
  idx,
  initialValue = 0,
  inputRefs,
  onChange,
  width = "90px",
  onEnterNext,
}) => {
  const [val, setVal] = useState<string | number>(initialValue);

  // keep in sync if parent resets
  useEffect(() => {
    setVal(initialValue);
  }, [initialValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
      setVal(v);
      onChange(v);
    }
  };

  return (
    <input
      ref={(el) => {
        inputRefs.current[idx] = el;
      }}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={val}
      onChange={handleChange}
      onFocus={(e) => {
        if (e.target.value === "0") setVal("");
      }}
      onBlur={(e) => {
        if (!e.target.value) {
          setVal(0);
          onChange("0");
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnterNext?.();
        }
      }}
      style={{ width }}
      className="
        h-9 rounded-md border border-gray-300 bg-white px-2
        text-center text-[13px] font-bold text-gray-800
        outline-none transition-all duration-150
        focus:border-blue-500 focus:ring-2 focus:ring-blue-100
        hover:border-gray-400
      "
    />
  );
};
