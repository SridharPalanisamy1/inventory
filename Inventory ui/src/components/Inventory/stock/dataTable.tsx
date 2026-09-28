
"use client";

/**
 * stock/dataTable.tsx — rewritten with pure Tailwind CSS v4.
 * All MUI TableContainer, Paper, Table, TableHead, TableRow, TableBody,
 * TableCell, TextField, Box, Typography, Tooltip, Chip removed.
 * Business logic (scroll, input handlers, changedRows) 100% unchanged.
 *
 * CHANGE: "S.O Stock" column removed for WAREHOUSE ONLY.
 *   - Removed from COL_WEIGHTS, ALL_COLS, and the local visibleColumns
 *     fallback default so it can never re-appear even if the redux
 *     slice hasn't been updated.
 *   - Column widths (colgroup) and min-table-width are already derived
 *     dynamically from `visibleCols`/`visibleColCount`, so removing one
 *     entry here automatically re-balances the remaining columns to
 *     100% width — no manual width/alignment tuning needed, and it
 *     stays responsive on mobile exactly as before.
 *   - colSpan on the "no records" / "loading" rows now uses the live
 *     `visibleColCount` instead of a hardcoded 10, so those rows keep
 *     spanning the full table width correctly no matter how many
 *     columns are visible (this also makes future column show/hide
 *     toggles safe, since nothing here is hardcoded to a column count).
 *   - The Outlets table (physicalstockmodifcation/dataTable.tsx) and
 *     its slice (OuletePhysicalStockSlice) are untouched — S.O Stock
 *     still shows there.
 *
 * FIX (this pass): Tooltip's own root element (@/components/ui/Tooltip)
 * is `inline-flex`, i.e. shrink-to-fit width. Wrapping it directly inside a
 * <td> meant it ignored the fixed column width coming from <colgroup>/
 * table-layout:fixed and expanded to the full text length — so `truncate`
 * never actually clipped anything, and on top of that several <td>s here
 * were missing `whitespace-nowrap`, so long values wrapped onto multiple
 * lines and pushed the row (and the row above it, visually) taller.
 * Fix = force Tooltip's inline-flex root to width:100% via an arbitrary
 * child selector on a local wrapper (no overflow-hidden on that wrapper,
 * so Tooltip's absolutely-positioned popup is never clipped and hover still
 * works exactly as before), plus `whitespace-nowrap` on every text <td> so
 * row height stays fixed. Nothing else changed.
 */

import React, { useEffect, useCallback, useState, useMemo } from "react";
import DotLoaderLike from "@/components/Loaders/DotLoaderWrapper";
import { TableRowData } from "@/app/yen-inventory/WarehouseInventoryManagement/stockModification/page";
import {
  formatInventoryQty,
  getInventoryNumber,
  isMissingInventoryValue,
} from "@/components/Inventory/shared/numberFormat";
import { useSelector } from "react-redux";
import { selectVisibleColumns } from "@/features/yen_inventory/wharehoueSlice";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { tableMinWidth, buildColWidthPercents } from "@/components/Inventory/shared/tableConfig";

// Relative widths — same ratios as the previous fixed px widths — used to
// build a <colgroup> so all visible columns always sum to exactly 100%.
// "SO Stock" removed here for Warehouse; remaining columns auto re-balance.
const COL_WEIGHTS: Record<string, number> = {
  "S.No": 50,
  "Item Code": 120,
  "Item Group": 150,
  "Item Name": 180,
  "Category": 150,
  "Sub Category": 150,
  "Prev System": 110,
  "System Stock": 110,
  "Physical": 130,
};

// ─── Props (unchanged) ────────────────────────────────────────────────────────

export interface DataTableProps {
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  tableContainerRef: React.RefObject<HTMLDivElement>;
  rows: TableRowData[];
  onPhysicalStockChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    itemName: string,
    varianceName: string,
    itemId: string,
    currentSystemStock: number
  ) => void;
  loading: boolean;
  hasMore: boolean;
  onScrollBottom: () => void;
  changedRows: Record<string, boolean>;
  disabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tip = (v: unknown) => (v === undefined || v === null || v === "" ? "-" : String(v));

/**
 * Renders a single-line, ellipsis-truncated cell value wrapped in the
 * existing Tooltip (hover shows the full value). See the FIX note at the
 * top of this file for why the extra wrapper div is required: Tooltip's own
 * root is `inline-flex` (shrink-to-fit), so without forcing it to
 * width:100% here it ignores the <td>'s fixed colgroup width and the text
 * never actually gets clipped. No overflow-hidden is used on the wrapper,
 * so Tooltip's absolute-positioned popup is never clipped and hover
 * continues to work exactly as before.
 */
// const TooltipCell: React.FC<{ value: unknown; className?: string }> = ({ value, className }) => (
//   <div className="w-full min-w-0 [&>div]:w-full [&>div]:min-w-0">
//     <Tooltip content={tip(value)} side="top">
//       <div className={cn("block w-full min-w-0 truncate text-[12px]", className)}>
//         {tip(value)}
//       </div>
//     </Tooltip>
//   </div>
// );
// மாத்தம்: align prop add replace the part 31 7 1
const TooltipCell: React.FC<{ value: unknown; className?: string; align?: "left" | "right" }> = ({
  value,
  className,
  align = "left",
}) => (
  <div
    className={cn(
      "flex w-full min-w-0 [&>div]:min-w-0",
      align === "right" ? "justify-end" : "justify-start"
    )}
  >
    <Tooltip content={tip(value)} side="top">
      <div className={cn("block max-w-full truncate text-[12px]", className)}>
        {tip(value)}
      </div>
    </Tooltip>
  </div>
);

// ─── DataTable Component ──────────────────────────────────────────────────────

const DataTable: React.FC<DataTableProps> = ({
  inputRefs,
  tableContainerRef,
  rows,
  onPhysicalStockChange,
  loading,
  hasMore,
  onScrollBottom,
  changedRows,
  disabled = false,
}) => {
  // "SO Stock" removed from the fallback default too, so even if the
  // warehouse redux slice still has an old shape, the column stays hidden.
  const visibleColumns = useSelector(selectVisibleColumns) || {
    "S.No": true, "Item Code": true, "Category": false,
    "Sub Category": false, "Item Group": true, "Item Name": true,
    "Prev System": true, "System Stock": true, "Physical": true,
  };

  const [tempStocks, setTempStocks] = useState<Record<string, number | string>>({});
  const isInitialLoading = loading && rows.length === 0;

  const changedCount = useMemo(
    () => Object.keys(changedRows).filter((k) => changedRows[k]).length,
    [changedRows]
  );

  // ── Scroll to bottom for infinite load ─────────────────────────────────────
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        if (scrollHeight - scrollTop - clientHeight < 180 && hasMore && !loading) {
          onScrollBottom();
        }
        ticking = false;
      });
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, loading, onScrollBottom, tableContainerRef]);

  useEffect(() => {
    if (changedCount === 0) setTempStocks({});
  }, [changedCount]);

  const handlePhysicalStockChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, row: TableRowData) => {
      const value = e.target.value;
      const key = row.id;
      if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) {
        setTempStocks((prev) => ({ ...prev, [key]: value }));
        onPhysicalStockChange(e, row.itemName, row.varianceName, row.id, getInventoryNumber(row.systemStock) ?? 0);
      }
    },
    [onPhysicalStockChange]
  );

  // ── Table column visibility check ───────────────────────────────────────────
  const isVis = useCallback((col: string) => visibleColumns[col] !== false, [visibleColumns]);

  // "SO Stock" removed from ALL_COLS for Warehouse only.
  const ALL_COLS = ["S.No", "Item Code", "Item Group", "Item Name", "Category", "Sub Category", "Prev System", "System Stock", "Physical"];
  const visibleCols = ALL_COLS.filter(isVis);
  const visibleColCount = visibleCols.length;
  const colWidths = useMemo(
    () => buildColWidthPercents(COL_WEIGHTS, visibleCols),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleCols.join("|")]
  );

  return (
    <div className="relative w-full h-full min-h-0 bg-white">
      {/* Changed count badge */}
      {changedCount > 0 && (
        <div className="absolute bottom-4 right-6 z-40 pointer-events-none shadow-md rounded-full">
          <span className="inline-flex items-center gap-1 rounded-full border border-warning-500/30 bg-warning-50 px-3 py-1 text-[11.5px] font-extrabold text-warning-700">
            {changedCount} changed
          </span>
        </div>
      )}

      {/* Scrollable table container */}
      <div
        ref={tableContainerRef}
        className="h-full max-h-full overflow-auto rounded-xl border border-border contain-layout"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
      >
        <table
          className="w-full border-separate border-spacing-0"
          style={{ minWidth: tableMinWidth(visibleColCount), tableLayout: "fixed" }}
        >
          {/* Explicit per-column widths so visible columns always sum to 100% —
              relying on unset-width columns to auto-share space is not reliable
              across browsers/render states with table-layout:fixed. */}
          <colgroup>
            {visibleCols.map((col) => (
              <col key={col} style={{ width: colWidths[col] }} />
            ))}
          </colgroup>

          {/* ── THEAD ──────────────────────────────────────────────────────── */}
          <thead className="sticky top-0 z-10">
            <tr>
              {isVis("S.No") && (
                <th className="px-2 py-1.5 h-10 text-center text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="S.No">S.No</div>
                </th>
              )}
              {isVis("Item Code") && (
                <th className="px-2 py-1.5 h-10 text-left text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="Item Code">Item Code</div>
                </th>
              )}
              {isVis("Item Group") && (
                <th className="px-2 py-1.5 h-10 text-left text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="Item Group">Item Group</div>
                </th>
              )}
              {isVis("Item Name") && (
                <th className="px-2 py-1.5 h-10 text-left text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="Item Name">Item Name</div>
                </th>
              )}
              {isVis("Category") && (
                <th className="px-2 py-1.5 h-10 text-left text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="Category">Category</div>
                </th>
              )}
              {isVis("Sub Category") && (
                <th className="px-2 py-1.5 h-10 text-left text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="Sub Category">Subcategory</div>
                </th>
              )}
              {isVis("Prev System") && (
                <th className="px-2 py-1.5 h-10 text-right text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="Prev System">Prev System</div>
                </th>
              )}
              {isVis("System Stock") && (
                <th className="px-2 py-1.5 h-10 text-right text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="System">System</div>
                </th>
              )}
              {isVis("Physical") && (
                <th className="px-2 py-1.5 h-10 text-right text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)] whitespace-nowrap">
                  <div className="truncate w-full" title="Physical Stock">Physical Stock</div>
                </th>
              )}
            </tr>
          </thead>

          {/* ── TBODY ──────────────────────────────────────────────────────── */}
          <tbody>
            {isInitialLoading ? (
              <tr>
                <td colSpan={visibleColCount} className="py-10">
                  <DotLoaderLike message="" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={visibleColCount} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-[14px] font-bold text-text-primary">No records found</p>
                    <p className="text-[12px] text-text-muted">Try changing filters or refresh the data.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const key = row.id;
                const isChanged = Boolean(changedRows[key]);
                const displayPhysical = tempStocks[key] !== undefined ? tempStocks[key] : "";

                return (
                  <tr
                    key={key}
                    className={cn(
                      "group border-b border-surface-subtle transition-colors",
                      isChanged
                        ? "bg-[#fffaf2] hover:bg-[#fff3df]"
                        : "bg-white hover:bg-brand-50/40"
                    )}
                  >
                    {/* S.No */}
                    {isVis("S.No") && (
                      <td className="px-2 py-1 h-[37px] text-center text-[12px] font-extrabold text-text-muted border-b border-surface-subtle whitespace-nowrap">
                        {row.index}
                      </td>
                    )}

                    {/* Item Code */}
                    {isVis("Item Code") && (
                      <td className="px-2 py-1 h-[37px] text-left border-b border-surface-subtle whitespace-nowrap">
                        <TooltipCell value={row.randomId} className="font-extrabold text-text-primary" />
                      </td>
                    )}

                    {/* Item Group */}
                    {isVis("Item Group") && (
                      <td className="px-2 py-1 h-[37px] text-left border-b border-surface-subtle whitespace-nowrap">
                        <TooltipCell value={row.itemGroup} className="font-semibold text-text-secondary" />
                      </td>
                    )}

                    {/* Item Name / Variance */}
                    {isVis("Item Name") && (
                      <td className="px-2 py-1 h-[37px] text-left border-b border-surface-subtle whitespace-nowrap">
                        <TooltipCell value={row.itemName} className="font-extrabold text-text-primary" />
                      </td>
                    )}

                    {/* Category */}
                    {isVis("Category") && (
                      <td className="px-2 py-1 h-[37px] text-left border-b border-surface-subtle whitespace-nowrap">
                        <TooltipCell value={row.category} className="font-semibold text-text-secondary" />
                      </td>
                    )}

                    {/* Sub Category */}
                    {isVis("Sub Category") && (
                      <td className="px-2 py-1 h-[37px] text-left border-b border-surface-subtle whitespace-nowrap">
                        <TooltipCell value={row.subcategory} className="font-semibold text-text-secondary" />
                      </td>
                    )}

                    {/* Prev System */}
                    {/* {isVis("Prev System") && (
                      <td className="px-2 py-1 h-[37px] text-right border-b border-surface-subtle whitespace-nowrap"> */}
                    {/* <TooltipCell
                          value={formatInventoryQty(row.previousSystemStock)}
                          className={cn(
                            "text-right tabular-nums",
                            isMissingInventoryValue(row.previousSystemStock) ? "text-text-disabled" : "text-text-secondary"
                          )}
                        /> */}
                    {/* replace the part 30 7 1 */}
                    {/* Prev System */}
                    {/* <TooltipCell
                          value={formatInventoryQty(row.previousSystemStock)}
                          align="right"
                          className={cn(
                            "text-right tabular-nums",
                            isMissingInventoryValue(row.previousSystemStock) ? "text-text-disabled" : "text-text-secondary"
                          )}
                        />
                      </td>
                    )} */}
                    {/* replace the code 31 7 1 */}
                    {isVis("Prev System") && (
                      <td className="px-2 py-1 h-[37px] text-right border-b border-surface-subtle whitespace-nowrap">
                        <TooltipCell
                          value={formatInventoryQty(row.previousSystemStock)}
                          align="right"
                          className={cn(
                            "text-right tabular-nums",
                            isMissingInventoryValue(row.previousSystemStock) ? "text-text-disabled" : "text-text-secondary"
                          )}
                        />
                      </td>
                    )}
                    {/* System Stock */}
                    {/* {isVis("System Stock") && (
                      <td className="px-2 py-1 h-[37px] text-right border-b border-surface-subtle whitespace-nowrap"> */}
                    {/* <TooltipCell
                          value={formatInventoryQty(row.systemStock)}
                          className={cn(
                            "text-right tabular-nums",
                            isMissingInventoryValue(row.systemStock) ? "text-text-disabled" : "text-text-secondary"
                          )}
                        /> */}
                    {/* replace the part 30 7 1 */}
                    {/* System Stock */}
                    {/* <TooltipCell
                          value={formatInventoryQty(row.systemStock)}
                          align="right"
                          className={cn(
                            "text-right tabular-nums",
                            isMissingInventoryValue(row.systemStock) ? "text-text-disabled" : "text-text-secondary"
                          )}
                        />
                      </td>
                    )} */}
                    {/* replace the part 31 7 1 */}
                    {isVis("System Stock") && (
                      <td className="px-2 py-1 h-[37px] text-right border-b border-surface-subtle whitespace-nowrap">
                        <TooltipCell
                          value={formatInventoryQty(row.systemStock)}
                          align="right"
                          className={cn(
                            "text-right tabular-nums",
                            isMissingInventoryValue(row.systemStock) ? "text-text-disabled" : "text-text-secondary"
                          )}
                        />
                      </td>
                    )}
                    {/* Physical input */}
                    {isVis("Physical") && (
                      <td className="px-2 py-1 h-[37px] border-b border-surface-subtle whitespace-nowrap">
                        <div className="pr-1.5 w-full flex justify-end">
                          <input
                            ref={(el) => { inputRefs.current[idx] = el; }}
                            value={displayPhysical}
                            onChange={(e) => handlePhysicalStockChange(e, row)}
                            onFocus={() => {
                              if (getInventoryNumber(displayPhysical) === 0 || displayPhysical === "0") {
                                setTempStocks((prev) => ({ ...prev, [key]: "" }));
                              }
                            }}
                            onBlur={(e) => {
                              if (!e.target.value) {
                                setTempStocks((prev) => ({ ...prev, [key]: "" }));
                                onPhysicalStockChange(
                                  { ...e, target: { ...e.target, value: "" } } as React.ChangeEvent<HTMLInputElement>,
                                  row.itemName, row.varianceName, row.id, row.systemStock ?? 0
                                );
                              }
                            }}
                            disabled={disabled}
                            inputMode="decimal"
                            maxLength={5}
                            type="text"
                            className={cn(
                              "h-[29px] w-[100px] bg-white rounded-[9px] text-[12px] text-left px-2 font-extrabold text-text-primary tabular-nums",
                              "border border-[#d3dfec] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20",
                              "hover:border-[#9dccf7] transition-all",
                              disabled && "bg-[#f8fafc] cursor-not-allowed text-text-disabled"
                            )}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}

            {/* Loading more */}
            {!isInitialLoading && rows.length > 0 && loading && (
              <tr>
                <td colSpan={visibleColCount} className="py-3 text-center text-[12px] font-semibold text-text-muted bg-white">
                  Loading more items…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default React.memo(DataTable);