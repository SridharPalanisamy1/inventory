
"use client";

import React, { useEffect, useMemo, useCallback } from "react";
import { RawMaterialStore } from "../../../features/yen_inventory/wharehoueStoreSlice";
import DotLoaderLike from "@/components/Loaders/DotLoaderWrapper";
import { formatInventoryQty, getInventoryNumber, isMissingInventoryValue } from "@/components/Inventory/shared/numberFormat";
import { Tooltip } from "@/components/ui/Tooltip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  ACTION_BUTTON_WIDTH,
  TH_BASE_CLS,
  TD_BASE_CLS,
  tableMinWidth,
  buildColWidthPercents,
} from "@/components/Inventory/shared/tableConfig";
// import { useVirtualizedRows } from "@/components/Inventory/shared/useVirtualizedRows";
// replace the part 1 8 1
import { useVirtualizedRows } from "@/components/Inventory/shared/useVirtualizedRows";
import axios from "axios";
import { API_BASE_URL } from "@/features/yen_inventory/OuletePhysicalStockSlice";

// ─── Props ────────────────────────────────────────────────────────────────────

// export interface DataTableProps {
//   filteredItems: RawMaterialStore[];
//   visibleColumns: Record<string, boolean>;
//   staticColumns: string[];
//   fieldTypes: string[];
//   totalColspan: number;
//   hasMoreData: boolean;
//   isLoadingMore: boolean;
//   isFullScreen: boolean;
//   handleApproveClick: (item: RawMaterialStore) => void;
//   handleTableScroll: (e: React.UIEvent<HTMLDivElement>) => void;
//   scrollContainerRef: React.RefObject<HTMLDivElement>;
//   loading: boolean;
//   selectedApprovalItemCodes?: string[];
//   onToggleSelectRow?: (itemCode: string) => void;
//   onSelectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
// }
// replace the part 13 8 2
export interface DataTableProps {
  filteredItems: RawMaterialStore[];
  visibleColumns: Record<string, boolean>;
  staticColumns: string[];
  fieldTypes: string[];
  totalColspan: number;
  hasMoreData: boolean;
  isLoadingMore: boolean;
  isFullScreen: boolean;
  handleApproveClick: (item: RawMaterialStore) => void;
  handleTableScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  loading: boolean;
  selectedLocation?: string;
  selectedApprovalItemCodes?: string[];
  onToggleSelectRow?: (itemCode: string) => void;
  onSelectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // newly add this line 14 8 1
  onSortChange: (field: string) => void;
}

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const isNullOrMissing = isMissingInventoryValue;
const formatSmartValue = (value: unknown): string => {
  if (isNullOrMissing(value)) return "-";
  const num = Number(value);
  if (!Number.isNaN(num) && num === 0) return "0";
  if (!Number.isNaN(num) && Number.isFinite(num)) {
return new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3
}).format(num);  }
  return String(value ?? "-");
};

// const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase();
// replace the part 1 8 1
const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase();

interface EditHistoryEntry {
  previousPhysicalStock: number;
  // revisedPhysicalStock: number;
  previousVariance: number;
  // revisedVariance: number;
  editedBy: string;
  editedAt: string;
  // NEW add this 6 8 1
  reason?: string;
}

const isRowApprovable = (row: RawMaterialStore): boolean => {
  const status = normalizeStatus(row.approvalStatus);
  const hasButton = Boolean(row.approvalButton) || Boolean(row.canApprove);
  const isPending = status === "pendingapproval" || status === "pending";
  const variance = getInventoryNumber(row.variance ?? row.stockVariance);
  const hasVar = variance !== null;
  return (hasButton || isPending) && hasVar;
};

// Relative widths used to build a <colgroup> so every visible column always
// sums to exactly 100% under table-layout:fixed. Without a <colgroup>,
// table-layout:fixed cannot reliably size columns from <th> classes alone,
// which is what let a long value (e.g. "MANGO MILK SHAKE ST...") push into
// / overlap the next column. Ratios mirror the previous baseColumnWidths px
// values and the dynamic fieldTypes column set, so visual sizing is
// unchanged — this only makes those sizes deterministic.
const COL_WEIGHTS: Record<string, number> = {
  "Select": 40,
  "S.No": 50,
  "Item Code": 120,
  "Item Name": 150,
  "Variance Name": 180,
  "Itemgroup": 150,
  "Category": 120,
  "Subcategory": 120,
  "Location Name": 120,
  "Opening Stock": 110,
  "Receiving Stock": 110,
  "Returned Stock": 110,
  "Dispatch Stock": 110,
  "WH-Return": 110,
  "Calc System": 110,
  "SystemStock": 110,
  "PhysicalStock": 110,
  "Variance": 100,
  "Action": 90,
};

// ─── Component ────────────────────────────────────────────────────────────────

// const DataTable: React.FC<DataTableProps> = ({
//   filteredItems, visibleColumns, staticColumns, fieldTypes, totalColspan,
//   isLoadingMore, loading, handleApproveClick, handleTableScroll, scrollContainerRef,
//   selectedApprovalItemCodes, onToggleSelectRow, onSelectAll
// }) => {
// replace the part 13 8 2
const DataTable: React.FC<DataTableProps> = ({
  filteredItems, visibleColumns, staticColumns, fieldTypes, totalColspan,
  isLoadingMore, loading, handleApproveClick, handleTableScroll, scrollContainerRef,
  selectedLocation, selectedApprovalItemCodes, onToggleSelectRow, onSelectAll, onSortChange
}) => {
  // const [detailsRow, setDetailsRow] = React.useState<RawMaterialStore | null>(null);

  // const {
  //   visibleRows, startIdx, topSpacerHeight, bottomSpacerHeight, handleScroll: handleVirtualScroll,
  // } = useVirtualizedRows(filteredItems, scrollContainerRef, { rowHeight: 44 });
  // replace the part 1 8 1
  // const [detailsRow, setDetailsRow] = React.useState<RawMaterialStore | null>(null);
  // replace again the part 13 8 2
  const [detailsRow, setDetailsRow] = React.useState<RawMaterialStore | null>(null);

  // Variance edit-history modal state — outlet version.
  const [historyItem, setHistoryItem] = React.useState<RawMaterialStore | null>(null);
  const [historyData, setHistoryData] = React.useState<EditHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  // React.useEffect(() => {
  //   if (!historyItem) return;

  //   let cancelled = false;
  //   setHistoryLoading(true);
  //   setHistoryData([]);

  //   axios
  //     .get(`${API_BASE_URL}/warehouseinventoryvariance/${historyItem.randomId}/edit-history`, {
  //       params: { locationId: historyItem.locationId ?? selectedLocation },
  //     })
  //     .then(({ data }) => {
  //       if (!cancelled) setHistoryData(data?.history || []);
  //     })
  //     .catch(() => {
  //       if (!cancelled) setHistoryData([]);
  //     })
  //     .finally(() => {
  //       if (!cancelled) setHistoryLoading(false);
  //     });

  //   return () => {
  //     cancelled = true;
  //   };
  // }, [historyItem, selectedLocation]);
  // replace the part 13 8 2
  React.useEffect(() => {
    if (!historyItem) return;

    const locationId =
      historyItem.locationId?.toString().trim() ||
      //mewly ad this 13 8 2
      historyItem.locationName?.toString().trim() ||
      selectedLocation?.toString().trim();

    if (!locationId) {
      setHistoryData([]);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryData([]);

    axios
      .get(
        `${API_BASE_URL}/warehouseinventoryvariance/${encodeURIComponent(
          historyItem.randomId
        )}/edit-history`,
        {
          params: {
            locationId,
          },
        }
      )
      .then(({ data }) => {
        if (!cancelled) {
          setHistoryData(Array.isArray(data?.history) ? data.history : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryData([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [historyItem, selectedLocation]);

  const {
    visibleRows, startIdx, topSpacerHeight, bottomSpacerHeight, handleScroll: handleVirtualScroll,
  } = useVirtualizedRows(filteredItems, scrollContainerRef, { rowHeight: 44 });

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      handleVirtualScroll(e);
      handleTableScroll(e);
    },
    [handleVirtualScroll, handleTableScroll]
  );

  const isColumnVisible = useCallback((columnKey: string) => visibleColumns[columnKey] !== false, [visibleColumns]);

  const visibleBaseColumns = useMemo(() => staticColumns.filter(isColumnVisible), [staticColumns, isColumnVisible]);
  const visibleDynamicFields = useMemo(() => fieldTypes.filter((f) => f !== "Action" && isColumnVisible(f)), [fieldTypes, isColumnVisible]);
  const hasAction = isColumnVisible("Action");

  const visibleColumnCount = visibleBaseColumns.length + visibleDynamicFields.length + (hasAction ? 1 : 0) || totalColspan || 1;

  // Single ordered list of every column actually rendered (base + dynamic +
  // action), in the exact order the <thead>/<tbody> render them. Used to
  // build the <colgroup> below so column widths always match what's drawn.
  const allVisibleColsInOrder = useMemo(
    () => [...visibleBaseColumns, ...visibleDynamicFields, ...(hasAction ? ["Action"] : [])],
    [visibleBaseColumns, visibleDynamicFields, hasAction]
  );

  const colWidths = useMemo(
    () => buildColWidthPercents(COL_WEIGHTS, allVisibleColsInOrder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allVisibleColsInOrder.join("|")]
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    let rafId = 0;
    const handleScrollPerformance = () => {
      if (container) container.style.pointerEvents = "none";
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (container) container.style.pointerEvents = "";
      });
    };
    container?.addEventListener("scroll", handleScrollPerformance, { passive: true });
    return () => {
      container?.removeEventListener("scroll", handleScrollPerformance);
      cancelAnimationFrame(rafId);
    };
  }, [scrollContainerRef]);

  // const renderTooltipText = (value: unknown, options?: { bold?: boolean; color?: string; align?: "left" | "center" | "right"; numeric?: boolean }) => {
  //   const text = formatSmartValue(value);
  //   const isNoData = isNullOrMissing(value);
  //   const colorClass = isNoData ? "text-text-disabled" : (options?.color || "text-text-secondary");

  //   // Outer wrapper is the piece that actually enforces the column width.
  //   // Without it, if <Tooltip>'s own root element is inline/inline-block
  //   // (shrink-to-fit), it ignores the fixed <td> width from the colgroup
  //   // and expands to the full text length — which is what let long values
  //   // bleed into the next column even though "truncate" was present on the
  //   // inner div. block + w-full + min-w-0 + overflow-hidden here forces the
  //   // whole chain (wrapper -> Tooltip -> inner div) to respect the td width
  //   // no matter how Tooltip is implemented internally.
  //   // Tooltip's own root div is `inline-flex` (shrink-to-fit) — it ignores
  //   // the fixed <td> width from the colgroup and expands to the full text
  //   // length, which is why truncate never actually clipped anything before.
  //   // We can't edit Tooltip.tsx (shared across the app, other usages may
  //   // rely on it hugging its content), so instead we force width:100% onto
  //   // Tooltip's root div via an arbitrary child selector on this local
  //   // wrapper. Crucially this wrapper has NO overflow-hidden — Tooltip's
  //   // popup is a sibling of {children} positioned absolute, and an
  //   // overflow-hidden ancestor would clip that popup (this is what broke
  //   // hover last time). Only the innermost text div keeps `truncate`
  //   // (overflow-hidden), which clips just its own box, not the sibling popup.
  //   // return (
  //   //   <div className="w-full min-w-0 [&>div]:w-full [&>div]:min-w-0">
  //   //     <Tooltip content={isNoData ? "No data" : text} side="top">
  //   //       <div className={cn(
  //   //         "block w-full min-w-0 truncate text-[12px]",
  //   //         options?.bold ? "font-bold" : "font-semibold",
  //   //         options?.numeric && "tabular-nums",
  //   //         colorClass,
  //   //         `text-${options?.align || "left"}`
  //   //       )}>
  //   //         {text}
  //   //       </div>
  //   //     </Tooltip>
  //   //   </div>
  //   // );replace the part 30 7 1
  //   return (
  //     <div className="w-full min-w-0 [&>div]:w-full [&>div]:min-w-0">
  //       <Tooltip content={isNoData ? "No data" : text} side="top" align={options?.align || "left"}>
  //         <div className={cn(
  //           "block w-full min-w-0 truncate text-[12px]",
  //           options?.bold ? "font-bold" : "font-semibold",
  //           options?.numeric && "tabular-nums",
  //           colorClass,
  //           `text-${options?.align || "left"}`
  //         )}>
  //           {text}
  //         </div>
  //       </Tooltip>
  //     </div>
  //   );
  // };
  // replace the part 31 7 1
  const renderTooltipText = (
    value: unknown,
    options?: {
      bold?: boolean;
      color?: string;
      align?: "left" | "center" | "right";
      numeric?: boolean;
      side?: "top" | "bottom";
    }
  ) => {
    const text = formatSmartValue(value);
    const isNoData = isNullOrMissing(value);
    const colorClass = isNoData ? "text-text-disabled" : (options?.color || "text-text-secondary");
    const align = options?.align || "left";

    // Wrapper is a flex box that hugs its content (does NOT stretch to the
    // full column width). This is what makes the tooltip popup anchor to
    // the actual visible text instead of the stretched <td> box edge —
    // without this, short values (e.g. "0") showed the popup shifted away
    // from the number since it was centered/aligned to the full column width.
    // justify-end/start/center mirrors the cell's own text alignment so the
    // hug direction matches where the text actually sits.
    // Truncation still works: the inner div keeps `truncate` + `max-w-full`,
    // so long values are still clipped to the column width via the parent
    // <td>'s fixed colgroup width — this wrapper just no longer force-expands
    // past that for short values.
    return (
      <div
        className={cn(
          "flex w-full min-w-0 [&>div]:min-w-0",
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
        )}
      >
        <Tooltip
          content={isNoData ? "No data" : text}
          side={options?.side || "top"}
        >
          <div className={cn(
            "block max-w-full truncate text-[12px]",
            options?.bold ? "font-bold" : "font-semibold",
            options?.numeric && "tabular-nums",
            colorClass,
            `text-${align}`
          )}>
            {text}
          </div>
        </Tooltip>
      </div>
    );
  };

  const renderActionButton = (row: RawMaterialStore) => {
    const status = normalizeStatus(row.approvalStatus);
    const canApprove = isRowApprovable(row);

    if (canApprove) {
      return <Button variant="primary" size="xs" onClick={() => handleApproveClick(row)} className={ACTION_BUTTON_WIDTH}>Approve</Button>;
    }
    if (status === "approved") {
      return <Button variant="outline" size="xs" disabled className={cn(ACTION_BUTTON_WIDTH, "bg-success-50 text-success-700 border-success-200")}>Approved</Button>;
    }
    return <Button variant="primary" size="xs" disabled className={ACTION_BUTTON_WIDTH}>Approve</Button>;
  };

  const baseColumnWidths: Record<string, string> = {
    "Select": "w-[40px]",
    "S.No": "w-[5%]",
    "Item Code": "w-[120px]",
    "Item Name": "w-[150px]",
    "Variance Name": "w-[180px]",
    "Itemgroup": "w-[150px]",
    "Category": "w-[120px]",
    "Subcategory": "w-[120px]",
    "Location Name": "w-[120px]"
  };

  return (
    <div className="w-full h-full min-h-0 bg-white relative">
      <div ref={scrollContainerRef} onScroll={onScroll} className="w-full h-full max-h-full overflow-auto border border-border rounded-xl bg-white" style={{ scrollbarWidth: "thin" }}>
        <table className="w-full border-separate border-spacing-0 text-left" style={{ minWidth: tableMinWidth(visibleColumnCount), tableLayout: "fixed" }}>
          {/* Explicit per-column widths so visible columns always sum to 100%.
              Required for table-layout:fixed to size columns deterministically —
              this is what prevents a long value in one column from overflowing
              into the next column. Order matches thead/tbody rendering order. */}
          <colgroup>
            {allVisibleColsInOrder.map((col) => (
              <col key={col} style={{ width: colWidths[col] }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 z-20">
            <tr>
              {/* {visibleBaseColumns.map((col) => (
                <th key={col} className={cn(TH_BASE_CLS,  "text-left whitespace-nowrap", baseColumnWidths[col], col === "Select" && "sticky left-0 z-30 shadow-[1px_0_0_#e2e8f0]",
                  col === "S.No" && "sticky left-[40px] z-30 bg-surface-muted shadow-[1px_0_0_#e2e8f0]",
                  col === "Item Code" && "sticky left-[90px] z-30 bg-surface-muted shadow-[1px_0_0_#e2e8f0]",
                  col === "Item Name" && "sticky left-[210px] z-30 bg-surface-muted shadow-[1px_0_0_#e2e8f0]")}> */}
              {/* replace the part 14 8 1 */}
              {visibleBaseColumns.map((col) => (
                <th
                  key={col}
                  onClick={() => {
                    if (
                      col !== "Select" &&
                      col !== "S.No" &&
                      onSortChange
                    ) {
                      onSortChange(col);
                    }
                  }}
                  // className={cn(
                  //   TH_BASE_CLS,
                  //   "text-left whitespace-nowrap",
                  //   baseColumnWidths[col],
                  //   col !== "Select" &&
                  //   col !== "S.No" &&
                  //   "cursor-pointer select-none hover:bg-surface-subtle",
                  //   col === "Select" &&
                  //   "sticky left-0 z-30 shadow-[1px_0_0_#e2e8f0]",
                  //   col === "S.No" &&
                  //   "sticky left-[40px] z-30 shadow-[1px_0_0_#e2e8f0]"
                  // )}
                  className={cn(
                    TH_BASE_CLS,
                    "text-left whitespace-nowrap",
                    baseColumnWidths[col],
                    col !== "Select" &&
                    col !== "S.No" &&
                    "cursor-pointer select-none hover:bg-surface-subtle",

                    col === "Select" &&
                    "sticky left-0 z-30 bg-surface-muted shadow-[1px_0_0_#e2e8f0]",

                    col === "S.No" &&
                    "sticky left-[40px] z-30 bg-surface-muted shadow-[1px_0_0_#e2e8f0]",

                    col === "Item Code" &&
                    "sticky left-[90px] z-30 bg-surface-muted shadow-[1px_0_0_#e2e8f0]",

                    col === "Item Name" &&
                    "sticky left-[210px] z-30 bg-surface-muted shadow-[1px_0_0_#e2e8f0]"
                  )}
                >
                  {col === "Select" ? (
                    <div className="flex items-center justify-center h-full">
                      <input
                        type="checkbox"
                        aria-label="Select all rows"
                        className="w-3.5 h-3.5 rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        onChange={onSelectAll}
                        checked={
                          filteredItems.length > 0 &&
                          filteredItems.every((item) =>
                            isRowApprovable(item) ? selectedApprovalItemCodes?.includes(item.itemCode) : true
                          ) &&
                          filteredItems.some(isRowApprovable)
                        }
                      />
                    </div>
                  ) : (
                    <div className="truncate w-full" title={col}>{col.toUpperCase()}</div>
                  )}
                </th>
              ))}
              {/* {visibleDynamicFields.map((field) => (
                <th key={field} className={cn(TH_BASE_CLS, "text-right whitespace-nowrap")}>
                  {/* <div className="truncate w-full" title={field}>{field.toUpperCase()}</div> */}
              {/* replace the part 31 7 1 
                  <div
                    className="truncate w-full"
                    title={field === "SystemStock" ? "System Stock" : field}
                  >
                    {(field === "SystemStock" ? "System Stock" : field).toUpperCase()}
                  </div>
                </th>
              ))} */}
              {/* replace the part 14 8 1 */}
              {visibleDynamicFields.map((field) => (
                <th
                  key={field}
                  onClick={() => {
                    if (field !== "Action" && onSortChange) {
                      onSortChange(field);
                    }
                  }}
                  className={cn(
                    TH_BASE_CLS,
                    "text-right whitespace-nowrap",
                    field !== "Action" &&
                    "cursor-pointer select-none hover:bg-surface-subtle"
                  )}
                >
                  <div
                    className="truncate w-full"
                    title={field === "SystemStock" ? "Live System Stock" : field}
                  >
                    {(field === "SystemStock"
                      ? "Live System Stock"
                      : field
                    ).toUpperCase()}
                  </div>
                </th>
              ))}
              {hasAction && (
                <th className={cn(TH_BASE_CLS, "text-center sticky right-0 z-30 shadow-[-1px_0_0_#e2e8f0] whitespace-nowrap")}>
                  <div className="truncate w-full" title="Action">ACTION</div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && <tr><td colSpan={visibleColumnCount} style={{ height: topSpacerHeight, padding: 0, border: 0 }} /></tr>}
            {loading && filteredItems.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-16 text-center">
                  <DotLoaderLike message="" />
                </td>
              </tr>
            ) : filteredItems.length > 0 ? (
              visibleRows.map((item, index) => (
                <tr key={`${item.itemCode}-${item.randomId || index}`} className="border-b border-surface-subtle last:border-0 hover:bg-brand-50/40 transition-colors">
                  {visibleBaseColumns.map((colKey) => {
                    if (colKey === "Select") {
                      return (
                        <td key={colKey} className={cn(TD_BASE_CLS, "text-center sticky left-0 z-10 bg-white shadow-[1px_0_0_#e2e8f0]")}>
                          <div className="flex items-center justify-center h-full">
                            <input
                              type="checkbox"
                              aria-label={`Select row ${item.itemCode}`}
                              className="w-3.5 h-3.5 rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              checked={selectedApprovalItemCodes?.includes(item.itemCode) || false}
                              onChange={() => onToggleSelectRow?.(item.itemCode)}
                              disabled={!isRowApprovable(item)}
                            />
                          </div>
                        </td>
                      );
                    }
                    if (colKey === "Itemgroup" || colKey === "Variance Name") {
                      return (
                        <td key={colKey} className={cn(TD_BASE_CLS, "text-left")}>
                          <div className="flex items-center gap-2 min-w-0 w-full">
                            <div className="min-w-0 flex-1">
                              {renderTooltipText(item.varianceName, { bold: true })}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailsRow(item);
                              }}
                              className="text-brand-500 hover:text-brand-700 hover:bg-brand-50 p-1 rounded transition-colors flex-shrink-0"
                              title="View details"
                              aria-label="View details"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      );
                    }

                    let content;
                    if (colKey === "S.No") {
                      content = renderTooltipText(startIdx + index + 1, { align: "center", bold: true });
                      return (
                        <td key={colKey} className={cn(TD_BASE_CLS, "text-center", "sticky left-[40px] z-10 bg-white shadow-[1px_0_0_#e2e8f0]")}>
                          {content}
                        </td>
                      );
                    }
                    if (colKey === "Item Code")
                      content = renderTooltipText(item.randomId, {
                        bold: true,
                        color: "text-text-primary",

                      });
                    else if (colKey === "Item Name")
                      content = renderTooltipText(item.itemName, {
                        bold: true,
                        color: "text-text-primary",

                      });
                    else if (colKey === "Category") content = renderTooltipText(item.category);
                    else if (colKey === "Subcategory") content = renderTooltipText(item.subcategory);
                    else if (colKey === "Location Name") content = renderTooltipText(item.locationName ?? item.locationId);
                    else content = renderTooltipText((item as unknown as Record<string, unknown>)[colKey]);

                    // return (
                    //   <td key={colKey} className={cn(TD_BASE_CLS, "text-left")}>
                    //     {content}
                    //   </td>
                    // );
                    // replace the part 10 8 1
                    return (
                      <td
                        key={colKey}
                        className={cn(
                          TD_BASE_CLS,
                          "text-left",
                          colKey === "Item Code" &&
                          "sticky left-[90px] z-10 bg-white shadow-[1px_0_0_#e2e8f0] hover:z-40 focus-within:z-40",
                          colKey === "Item Name" &&
                          "sticky left-[210px] z-10 bg-white shadow-[1px_0_0_#e2e8f0] hover:z-40 focus-within:z-40"
                        )}
                      >
                        {content}
                      </td>
                    );
                  })}

               
                  {visibleDynamicFields.map((field) => {
                    let rawValue: unknown = undefined;

                    if (field === "Opening" || field === "Opening Stock") rawValue = item.openingStock;
                    else if (field === "Receiving" || field === "Receiving Stock") rawValue = item.receivedQty;
                    else if (field === "Returned" || field === "Returned Stock") rawValue = item.returnedQty;
                    else if (field === "Dispatch" || field === "Dispatch Stock") rawValue = item.dispatchQty;
                    else if (field === "WH Return" || field === "WH-Return") rawValue = item.warehouseReturn;
                    else if (field === "Calc System") rawValue = item.currentSystem;
                    else if (field === "System" || field === "SystemStock") rawValue = item.updatedCurrentSystem ?? item.SystemStock;
       
                    else if (field === "Physical" || field === "PhysicalStock")
                      rawValue =
                        item.physicalClosing ??
                        item.PhysicalStock;
                    // else if (field === "Variance") rawValue = item.variance ?? item.stockVariance;
                    // replace the line 13 8 2
                    else if (field === "Variance") rawValue = item.variance ?? item.stockVariance;
                    else rawValue = (item as unknown as Record<string, unknown>)[field];

                    const numericValue = getInventoryNumber(rawValue);
                    const isNegative = numericValue !== null && numericValue < 0;
                    const isNoData = isNullOrMissing(rawValue);
                    const color = isNoData ? "text-text-disabled" : isNegative ? "text-danger-600" : "text-text-primary";

             
                    if (field === "Variance") {
                      const hasHistory =
                        Boolean(
                          (item as RawMaterialStore & { hasEditHistory?: boolean }).hasEditHistory
                        ) &&
                        normalizeStatus(item.approvalStatus) !== "approved";

                      return (
                        <td key={field} className={cn(TD_BASE_CLS, "text-right")}>
                          <div className="grid w-full grid-cols-[1fr_18px] items-center gap-1">
                            {/* Fixed value area */}
                            <div className="min-w-0 text-right">
                              {renderTooltipText(rawValue, {
                                align: "right",
                                numeric: true,
                                color,
                                bold: true,
                              })}
                            </div>

                            {/* Fixed icon area - keeps alignment stable */}
                            <div className="w-[18px] flex items-center justify-center">
                              {hasHistory ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setHistoryItem(item);
                                  }}
                                  className="text-brand-500 hover:text-brand-700 hover:bg-brand-50 p-1 rounded transition-colors flex-shrink-0"
                                  title="View variance edit history"
                                  aria-label="View variance edit history"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                  </svg>
                                </button>
                              ) : (
                                // Keep the icon slot empty but preserve the same alignment
                                <span className="w-[14px] h-[14px]" aria-hidden="true" />
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={field} className={cn(TD_BASE_CLS, "text-right")}>
                        {renderTooltipText(rawValue, { align: "right", numeric: true, color, bold: true })}
                      </td>
                    );
                  })}

                  {hasAction && (
                    <td className={cn(TD_BASE_CLS, "text-center sticky right-0 z-10 bg-white shadow-[-1px_0_0_#e2e8f0]")}>
                      <div className="flex items-center justify-center">
                        {renderActionButton(item)}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={visibleColumnCount} className="py-16 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-text-muted">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    </div>
                    <p className="text-[14px] font-bold text-text-primary">No data available</p>
                    <p className="text-[12px] font-medium text-text-muted">Try changing filters or refresh the data.</p>
                  </div>
                </td>
              </tr>
            )}

            {isLoadingMore && filteredItems.length > 0 && (
              <tr>
                <td colSpan={visibleColumnCount} className="py-3 text-center bg-white">
                  <div className="inline-flex items-center gap-2 text-text-muted">
                    <Spinner size="sm" />
                    <span className="text-[12px] font-semibold">Loading…</span>
                  </div>
                </td>
              </tr>
            )}

            {bottomSpacerHeight > 0 && <tr><td colSpan={visibleColumnCount} style={{ height: bottomSpacerHeight, padding: 0, border: 0 }} /></tr>}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!detailsRow}
        onClose={() => setDetailsRow(null)}
        title="Item Details"
        size="md"
      >
        {detailsRow && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Item Code</p>
                <p className="font-semibold text-text-primary">{detailsRow.itemCode || "-"}</p>
              </div>
              <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Variance Name</p>
                <p className="font-semibold text-text-primary">{detailsRow.varianceName || "-"}</p>
              </div>
              <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Item Name</p>
                <p className="font-semibold text-text-primary">{detailsRow.itemName || "-"}</p>
              </div>
              <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Category</p>
                <p className="font-semibold text-text-primary">{detailsRow.category || "-"}</p>
              </div>
              <div className="bg-surface-subtle p-3 rounded-lg border border-border col-span-2">
                <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Subcategory</p>
                <p className="font-semibold text-text-primary">{detailsRow.subcategory || "-"}</p>
              </div>
            </div>
            {/* <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setDetailsRow(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default React.memo(DataTable); */}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setDetailsRow(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        title="Variance Edit History"
        size="md"
      >
        {historyItem && (
          <div className="space-y-4">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : historyData.length === 0 ? (
              <p className="text-[13px] text-text-muted text-center py-6">
                No edit history found for this item.
              </p>
            ) : (
              historyData.map((h, idx) => (
                <div key={idx} className={idx < historyData.length - 1 ? "pb-4 mb-4 border-b border-border" : ""}>
              
                  {/*  replace tha part 3 8 3 */}
                  <div className="grid grid-cols-2 gap-4 text-[13px]">
                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Previous Physical Stock
                      </p>
                      <p className="font-semibold text-text-primary">
                        {h.previousPhysicalStock}
                      </p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Previous Variance
                      </p>
                      <p className="font-semibold text-text-primary">
                        {h.previousVariance}
                      </p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Edited By
                      </p>
                      <p className="font-semibold text-text-primary">
                        {h.editedBy || "-"}
                      </p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Edited Date
                      </p>
                      <p className="font-semibold text-text-primary">
                        {h.editedAt
                          ? new Date(h.editedAt).toLocaleDateString("en-CA")
                          : "-"}
                      </p>
                    </div>

                    <div className="col-span-2 flex justify-center">
                      <div className="bg-surface-subtle p-3 rounded-lg border border-border w-[220px] text-center">
                        <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                          Edited Time
                        </p>
                        <p className="font-semibold text-text-primary">
                          {h.editedAt
                            ? new Date(h.editedAt).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false,
                            })
                            : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-2 bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Reason
                      </p>
                      <p className="break-words text-sm font-semibold text-text-primary">
                        {h.reason?.trim() || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setHistoryItem(null)}>Close</Button>
            </div>
          </div>
        )}
        {/* </Modal>
    </div>
  );
};

export default React.memo(DataTable); */}
        {/* repalce the part 13 8 2 */}
      </Modal>

      {/* Variance Edit History Modal — mirrors warehouse exactly */}
      <Modal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        title="Variance Edit History"
        size="md"
      >
        {historyItem && (
          <div className="space-y-4">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : historyData.length === 0 ? (
              <p className="text-[13px] text-text-muted text-center py-6">
                No edit history found for this item.
              </p>
            ) : (
              historyData.map((h, idx) => (
                <div key={idx} className={idx < historyData.length - 1 ? "pb-4 mb-4 border-b border-border" : ""}>
                  <div className="grid grid-cols-2 gap-4 text-[13px]">
                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Previous Physical Stock
                      </p>
                      <p className="font-semibold text-text-primary">
                        {h.previousPhysicalStock}
                      </p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Previous Variance
                      </p>
                      <p className="font-semibold text-text-primary">
                        {h.previousVariance}
                      </p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Edited By
                      </p>
                      <p className="font-semibold text-text-primary">
                        {h.editedBy || "-"}
                      </p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Edited Date
                      </p>
                      <p className="font-semibold text-text-primary">
                        {h.editedAt
                          ? new Date(h.editedAt).toLocaleDateString("en-CA")
                          : "-"}
                      </p>
                    </div>

                    <div className="col-span-2 flex justify-center">
                      <div className="bg-surface-subtle p-3 rounded-lg border border-border w-[220px] text-center">
                        <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                          Edited Time
                        </p>
                        <p className="font-semibold text-text-primary">
                          {h.editedAt
                            ? new Date(h.editedAt).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false,
                            })
                            : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="col-span-2 bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">
                        Reason
                      </p>
                      <p className="break-words text-sm font-semibold text-text-primary">
                        {h.reason?.trim() || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setHistoryItem(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default React.memo(DataTable);
