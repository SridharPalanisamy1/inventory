"use client";

/**
 * physcialstockvarience/dataTable.tsx — rewritten with pure Tailwind CSS.
 * Replaces 428-line MUI version. Props interface 100% identical.
 */
import { useSelector } from "react-redux";
import {
  outletVarianceBase,
  selectOutletStockType,
} from "@/features/yen_inventory/outletStockTypeSlice";
import React, { useCallback, useMemo } from "react";
import DotLoaderLike from "@/components/Loaders/DotLoaderWrapper";
import { Branchitem, EditableRow } from "@/features/yen_inventory/OutletPhysicalVarianceSlice";
import { formatInventoryQty, getInventoryNumber, isMissingInventoryValue } from "@/components/Inventory/shared/numberFormat";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
// import { cn } from "@/lib/utils";
// replace the part 13 8 2
import { cn } from "@/lib/utils";
import axios from "axios";
import { API_BASE_URL } from "@/features/yen_inventory/OuletePhysicalStockSlice";
import { useVirtualizedRows } from "@/components/Inventory/shared/useVirtualizedRows";
import {
  TH_BASE_CLS,
  TD_BASE_CLS,
  ACTION_BUTTON_WIDTH,
  tableMinWidth,
} from "@/components/Inventory/shared/tableConfig";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DataTableProps {
  filteredItems: Branchitem[];
  visibleColumns: Record<string, boolean>;
  fieldTypes: string[];
  selectedLocation: string;
  editableRows: Record<string, EditableRow>;
  onCellEdit: (id: string, field: string, value: string, itemName: string, varianceName: string) => void;
  totalColspan: number;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  hasMoreData: boolean;
  isLoadingMore: boolean;
  inputRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>;
  isFullScreen: boolean;
  handleApproveClick: (item: Branchitem) => void;
  loading: boolean;
  tableContainerRef?: React.RefObject<HTMLDivElement>;
  selectedApprovalItemCodes?: string[];
  onToggleSelectRow?: (itemCode: string) => void;
  onSelectAll?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // newly add this line 14 8 1
  onSortChange?: (field: string) => void;
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
const normalizeStatus = (value: unknown) => String(value || "").trim();

const isRowApprovable = (row: Branchitem): boolean => {
  const status = normalizeStatus(row.approvalStatus);
  const hasButton = Boolean(row.approvalButton) || Boolean(row.canApprove);
  const isPending = status === "pendingapproval" || status === "pending" || status === "penv";
  const variance = getInventoryNumber(row.variance ?? row.stockVariance);
  const hasVar = variance !== null;
  return (hasButton || isPending) && hasVar;
};

// ─── Component ────────────────────────────────────────────────────────────────

// const DataTable: React.FC<DataTableProps> = ({
//   filteredItems, visibleColumns, fieldTypes, selectedLocation, editableRows,
//   onCellEdit, totalColspan, onScroll, scrollContainerRef, handleApproveClick,
//   loading, isLoadingMore, selectedApprovalItemCodes = [], onToggleSelectRow, onSelectAll
// }) => {
// replace the part 13 8 2
interface EditHistoryEntry {
  previousPhysicalStock: number;
  previousVariance: number;
  editedBy: string;
  editedAt: string;
  reason?: string;
}

// const DataTable: React.FC<DataTableProps> = ({
//   filteredItems, visibleColumns, staticColumns, fieldTypes, totalColspan,
//   isLoadingMore, loading, handleApproveClick, handleTableScroll, scrollContainerRef,
//   selectedApprovalItemCodes, onToggleSelectRow, onSelectAll
// }) => {
//   const [detailsRow, setDetailsRow] = React.useState<Branchitem | null>(null);
// replace the part 13 8 2
const DataTable: React.FC<DataTableProps> = ({
  filteredItems, visibleColumns, fieldTypes, totalColspan,
  isLoadingMore, loading, handleApproveClick, onScroll, scrollContainerRef,
  selectedLocation, editableRows, onCellEdit, inputRefs, isFullScreen,
  selectedApprovalItemCodes, onToggleSelectRow, onSelectAll,
  onSortChange,
}) => {
  const [detailsRow, setDetailsRow] = React.useState<Branchitem | null>(null);
const isRm = useSelector(selectOutletStockType) === "RM";
  // Variance edit-history modal state — outlet version.
  const [historyItem, setHistoryItem] = React.useState<Branchitem | null>(null);
  const [historyData, setHistoryData] = React.useState<EditHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  React.useEffect(() => {
    if (!historyItem) return;

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryData([]);

    axios
.get(`${API_BASE_URL}/${outletVarianceBase()}/${historyItem.itemCode}/edit-history`, {        params: { locationId: historyItem.locationId ?? selectedLocation },
      })
      .then(({ data }) => {
        if (!cancelled) setHistoryData(data?.history || []);
      })
      .catch(() => {
        if (!cancelled) setHistoryData([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [historyItem, selectedLocation]);
  const {
    visibleRows, startIdx, topSpacerHeight, bottomSpacerHeight, handleScroll: handleVirtualScroll,
  } = useVirtualizedRows(filteredItems, scrollContainerRef, { rowHeight: 44 });

  const handleTableScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      handleVirtualScroll(e);
      onScroll(e);
    },
    [handleVirtualScroll, onScroll]
  );

  const isColumnVisible = useCallback((columnKey: string) => visibleColumns[columnKey] !== false, [visibleColumns]);

  const baseColumns = useMemo(() => [
    { key: "Select", label: "", align: "center" as const, width: "w-[40px]" },
    { key: "S.No", label: "S.NO", align: "center" as const, width: "w-[50px]" },
    { key: "itemCode", label: "ITEM CODE", align: "left" as const, width: "w-[120px]" },
{ key: "Variance Name", label: isRm ? "ITEM NAME" : "VARIANCE NAME", align: "left" as const, width: "w-[180px]" },    { key: "Category", label: "CATEGORY", align: "left" as const, width: "w-[150px]" },
    { key: "Subcategory", label: "SUB CATEGORY", align: "left" as const, width: "w-[150px]" },
  ], []);


  const visibleBaseColumns = useMemo(() => baseColumns.filter((col) => isColumnVisible(col.key)), [baseColumns, isColumnVisible]);
  // newly added this part 12 8 4
  // Calculate sticky left position from the existing column widths.
  // This keeps the offsets in sync with baseColumns automatically.
  const getStickyLeft = useCallback(
    (columnKey: string) => {
      let left = 0;

      for (const column of visibleBaseColumns) {
        if (column.key === columnKey) break;

        const widthMatch = column.width.match(/\[(\d+)px\]/);
        if (widthMatch) {
          left += Number(widthMatch[1]);
        }
      }

      return left;
    },
    [visibleBaseColumns]
  );
  const visibleDynamicFields = useMemo(() => fieldTypes.filter((field) => isColumnVisible(field)), [fieldTypes, isColumnVisible]);
  const visibleColumnCount = visibleBaseColumns.length + visibleDynamicFields.length || totalColspan || 1;

  if (!selectedLocation) {
    return (
      <div className="w-full h-full min-h-0 flex items-center justify-center p-4 bg-white">
        <div className="px-6 py-4 rounded-xl border border-dashed border-brand-200 bg-brand-50 text-brand-700">
          <p className="text-[13px] font-bold">Select a location to view stock variance data</p>
        </div>
      </div>
    );
  }

  const renderTooltipText = (value: unknown, options?: { bold?: boolean; color?: string; align?: "left" | "center" | "right"; numeric?: boolean; side?: "top" | "bottom" }) => {
    const text = formatSmartValue(value);
    const isNoData = isNullOrMissing(value);
    const colorClass = isNoData ? "text-text-disabled" : (options?.color || "text-text-secondary");
    const align = options?.align || "left";

    // Wrapper is a flex box that HUGS its content (justify-end/center/start
    // matches the cell's own text alignment) instead of stretching w-full.
    // This makes the Tooltip anchor to the actual visible text position —
    // without this, right-aligned numeric values (e.g. "19") showed the
    // popup shifted toward the column's horizontal center instead of
    // sitting directly above the number.
    return (
      <div
        className={cn(
          "relative hover:z-50 focus-within:z-50 flex w-full min-w-0 [&>div]:min-w-0",
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
        )}
      >
        <Tooltip content={isNoData ? "No data" : text} side={options?.side || "top"}>
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
  const renderActionButton = (row: Branchitem) => {
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

  const renderEditableInput = (row: Branchitem, fieldKey: string, value: string) => (
    <input
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "" || /^-?[0-9]*\.?[0-9]*$/.test(next)) {
          onCellEdit(row.id, fieldKey, next, row.itemName, row.varianceName);
        }
      }}
      className="w-full max-w-[120px] h-7 px-2 rounded-lg border border-border bg-white outline-none text-text-primary text-[12px] font-semibold text-right focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
    />
  );


  return (
    <div className="w-full h-full min-h-0 bg-white relative">
      <div ref={scrollContainerRef} onScroll={handleTableScroll} className="w-full h-full max-h-full overflow-auto border border-border rounded-xl bg-white" style={{ scrollbarWidth: "thin" }}>
        <table className="w-full border-separate border-spacing-0 text-left" style={{ minWidth: tableMinWidth(visibleColumnCount), tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-20">
            <tr>
              {visibleBaseColumns.map((col) => (
                // <th
                //   key={col.key}
                //   className={cn(
                //     TH_BASE_CLS,
                //     `text-${col.align}`,
                //     "whitespace-nowrap",
                //     col.width,
                //     col.key === "Select" && "sticky left-0 z-30 shadow-[1px_0_0_#e2e8f0]",
                //     col.key === "S.No" && "sticky left-[40px] z-30 shadow-[1px_0_0_#e2e8f0]"
                //   )}
                // >
                // replace the part 14 8 1
                <th
                  key={col.key}
                  onClick={() => {
                    if (col.key !== "Select" && col.key !== "S.No") {
                      onSortChange?.(col.key);
                    }
                  }}
                  className={cn(
                    TH_BASE_CLS,
                    `text-${col.align}`,
                    "whitespace-nowrap",
                    col.width,
                    col.key !== "Select" &&
                    col.key !== "S.No" &&
                    "cursor-pointer select-none hover:bg-surface-subtle",
                    (col.key === "Select" ||
                      col.key === "S.No" ||
                      col.key === "itemCode" ||
                      col.key === "Variance Name") &&
                    "sticky z-30 shadow-[1px_0_0_#e2e8f0]"
                  )}
                  style={
                    col.key === "Select" ||
                      col.key === "S.No" ||
                      col.key === "itemCode" ||
                      col.key === "Variance Name"
                      ? { left: `${getStickyLeft(col.key)}px` }
                      : undefined
                  }
                >
                  {col.key === "Select" ? (
                    <div className="flex items-center justify-center h-full">
                      <input
                        type="checkbox"
                        aria-label="Select all rows"
                        className="w-3.5 h-3.5 rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        onChange={onSelectAll}
                        checked={
                          filteredItems.length > 0 &&
                          filteredItems.every((item) =>
                            isRowApprovable(item)
                              ? selectedApprovalItemCodes?.includes(item.itemCode)
                              : true
                          ) &&
                          filteredItems.some(isRowApprovable)
                        }
                      />
                    </div>
                  ) : (
                    <div className="truncate w-full" title={col.label}>
                      {col.label}
                    </div>
                  )}
                </th>
              ))}
              {/* {visibleDynamicFields.map((field) => (
                <th
                  key={field}
                  className={cn(
                    TH_BASE_CLS,
                    "whitespace-nowrap",
                    field === "Action" || field === "Physical Variance"
                      ? "text-center sticky right-0 z-30 shadow-[-1px_0_0_#e2e8f0]"
                      : "text-right"
                  )}
                >
                  <div className="truncate w-full" title={field}>{field}</div>
                </th>
              ))} */}
              {/* replace the part 14 8 1 */}
              {visibleDynamicFields.map((field) => (
                <th
                  key={field}
                  onClick={() => {
                    if (field !== "Action") {
                      onSortChange?.(field);
                    }
                  }}  
                  className={cn(
                    TH_BASE_CLS,
                    "whitespace-nowrap",
                    field !== "Action" &&
                    "cursor-pointer select-none hover:bg-surface-subtle",
                    field === "Action" || field === "Physical Variance"
                      ? "text-center sticky right-0 z-30 shadow-[-1px_0_0_#e2e8f0]"
                      : "text-right"
                  )}
                >
                  <div className="truncate w-full" title={field}>
                    {field}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-16 text-center text-text-muted font-bold">
                  No stock variance data found.
                </td>
              </tr>
            ) : (
              <>
                {topSpacerHeight > 0 && (
                  <tr style={{ height: topSpacerHeight }}>
                    <td colSpan={visibleColumnCount} style={{ padding: 0, height: topSpacerHeight }} />
                  </tr>
                )}
                {visibleRows.map((row, index) => {
                  const globalIndex = startIdx + index;
                  return (
                    <tr key={`${row.id}-${row.itemCode}-${globalIndex}`} className="border-b border-surface-subtle hover:bg-brand-50/40 transition-colors last:border-0">
                      {isColumnVisible("Select") && (
                        <td className={cn(TD_BASE_CLS, "text-center sticky left-0 z-10 bg-white shadow-[1px_0_0_#e2e8f0]")}>
                          <div className="flex items-center justify-center h-full">
                            <input
                              type="checkbox"
                              aria-label={`Select row ${row.itemCode}`}
                              className="w-3.5 h-3.5 rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              checked={selectedApprovalItemCodes?.includes(row.itemCode) || false}
                              onChange={() => onToggleSelectRow?.(row.itemCode)}
                              disabled={!isRowApprovable(row)}
                            />
                          </div>
                        </td>
                      )}
                      {/* {isColumnVisible("S.No") && (
                        <td className={cn(TD_BASE_CLS, "text-center text-[12px] font-semibold text-text-muted", isColumnVisible("Select") && "sticky left-[40px] z-10 bg-white shadow-[1px_0_0_#e2e8f0]")}>
                          {globalIndex + 1}
                        </td>
                      )} */}
                      {/* replace the part 12 8 4 */}
                      {isColumnVisible("S.No") && (
                        <td
                          className={cn(
                            TD_BASE_CLS,
                            "text-center text-[12px] font-semibold text-text-muted sticky z-10 bg-white shadow-[1px_0_0_#e2e8f0]"
                          )}
                          style={{ left: `${getStickyLeft("S.No")}px` }}
                        >
                          {globalIndex + 1}
                        </td>
                      )}
                      {/* {isColumnVisible("itemCode") && (
                        <td className={cn(TD_BASE_CLS, "text-left")}>
                          {renderTooltipText(row.itemCode, { bold: true, color: "text-text-primary" })}
                        </td>
                      )} */}
                      {/* replace the part 12 8 4 */}
                      {isColumnVisible("itemCode") && (
                        <td
                          className={cn(
                            TD_BASE_CLS,
                            "text-left sticky z-10 bg-white shadow-[1px_0_0_#e2e8f0]"
                          )}
                          style={{ left: `${getStickyLeft("itemCode")}px` }}
                        >
                          {renderTooltipText(row.itemCode, {
                            bold: true,
                            color: "text-text-primary",
                          })}
                        </td>
                      )}
                      {/* {isColumnVisible("Variance Name") && (
                        <td className={cn(TD_BASE_CLS, "text-left")}>
                          <div className="flex items-center gap-2">
                            {renderTooltipText(row.varianceName, { bold: true, color: "text-text-primary" })}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailsRow(row);
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
                      )} */}
                      {/* replace the part 13 8 2 */}
                      {isColumnVisible("Variance Name") && (
                        <td
                          className={cn(
                            TD_BASE_CLS,
                            // hover:z-40 / focus-within:z-40 lift THIS sticky
                            // cell's own stacking context above the sticky
                            // header (z-30) only while hovered/focused — at
                            // rest it's still z-10, same as every other
                            // sticky column, so column layering while
                            // scrolling is unaffected.
                            "text-left sticky z-10 hover:z-40 focus-within:z-40 bg-white shadow-[1px_0_0_#e2e8f0]"
                          )}
                          style={{ left: `${getStickyLeft("Variance Name")}px` }}
                        >
                          <div className="grid w-full grid-cols-[1fr_18px] items-center gap-1 min-w-0">
                            {/* Text area — min-w-0 only, NO overflow-hidden here.
                                Truncation happens inside renderTooltipText's own
                                inner div (via `truncate`), which is a sibling of
                                the Tooltip popup, not an ancestor — so it clips
                                only the text box, never the hover popup. */}
                            {/* repalce the part 13 8 2 */}
                            <div className="min-w-0">
                              {renderTooltipText(row.varianceName, {
                                bold: true,
                                color: "text-text-primary",
                              })}
                            </div>

                            {/* Fixed icon area — stays pinned inside the column always */}
                            <div className="w-[18px] flex items-center justify-center flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailsRow(row);
                                }}
                                className="text-brand-500 hover:text-brand-700 hover:bg-brand-50 p-1 rounded transition-colors flex-shrink-0"
                                title="View details"
                                aria-label="View details"
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
                            </div>
                          </div>
                        </td>
                      )}
                      {isColumnVisible("Category") && (
                        <td className={cn(TD_BASE_CLS, "text-left")}>{renderTooltipText(row.category)}</td>
                      )}
                      {isColumnVisible("Subcategory") && (
                        <td className={cn(TD_BASE_CLS, "text-left")}>{renderTooltipText(row.subCategory)}</td>
                      )}

                      {visibleDynamicFields.map((field) => {
                        const fk = `${selectedLocation}-${field}`;
                        let rawValue: unknown = undefined;
                        const editedVal = editableRows[row.id]?.[fk];
                        if (editedVal !== undefined) {
                          rawValue = editedVal;
                        } else {
                          const directVal = (row as Record<string, unknown>)[fk];
                          if (directVal !== undefined) {
                            rawValue = directVal;
                          } else {
                            if (field.toLowerCase().includes("system")) {
                              rawValue = row.systemStock ?? row.updatedCurrentSystem ?? row.currentInventorySystemStock;
                            }
                            else if (field.toLowerCase().includes("physical")) {
                              rawValue = row.physicalStock ?? row.physicalClosing ?? row.currentInventoryPhysicalStock;
                            }
                            else {
                              rawValue = undefined;
                            }
                          }
                        }

                        const numericValue = getInventoryNumber(rawValue);
                        const isNegative = numericValue !== null && numericValue < 0;
                        const isNoData = isNullOrMissing(rawValue);
                        const color = isNoData ? "text-text-disabled" : isNegative ? "text-danger-600" : "text-text-primary";

                        // if (field === "Action") {
                        //   return (
                        //     <td key={fk} className={cn(TD_BASE_CLS, "text-center bg-white sticky right-0 z-10 shadow-[-1px_0_0_#e2e8f0]")}>
                        //       <div className="flex items-center justify-center">{renderActionButton(row)}</div>
                        //     </td>
                        //   );
                        // }

                        // return (
                        //   <td key={fk} className={cn(
                        //     TD_BASE_CLS,
                        //     field === "Physical Variance"
                        //       ? "text-center sticky right-0 z-10 bg-white shadow-[-1px_0_0_#e2e8f0]"
                        //       : "text-right"
                        //   )}>
                        //     {field === "Physical Variance"
                        //       ? renderEditableInput(row, fk, String(rawValue ?? ""))
                        //       : renderTooltipText(rawValue, { align: "right", numeric: true, color, bold: true })
                        //     }
                        //   </td>
                        // );
                        // replace the part 13 8 2
                        if (field === "Action") {
                          return (
                            <td key={fk} className={cn(TD_BASE_CLS, "text-center bg-white sticky right-0 z-10 shadow-[-1px_0_0_#e2e8f0]")}>
                              <div className="flex items-center justify-center">{renderActionButton(row)}</div>
                            </td>
                          );
                        }

                        if (field === "Variance") {
                          const hasHistory = Boolean(
                            (row as Branchitem & { hasEditHistory?: boolean }).hasEditHistory
                          );

                          return (
                            <td key={fk} className={cn(TD_BASE_CLS, "text-right")}>
                              <div className="grid w-full grid-cols-[1fr_18px] items-center gap-1">
                                <div className="min-w-0 text-right">
                                  {renderTooltipText(rawValue, { align: "right", numeric: true, color, bold: true })}
                                </div>
                                <div className="w-[18px] flex items-center justify-center">
                                  {hasHistory ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setHistoryItem(row);
                                      }}
                                      className="text-brand-500 hover:text-brand-700 hover:bg-brand-50 p-1 rounded transition-colors flex-shrink-0"
                                      title="View variance edit history"
                                      aria-label="View variance edit history"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                      </svg>
                                    </button>
                                  ) : (
                                    <span className="w-[14px] h-[14px]" aria-hidden="true" />
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td key={fk} className={cn(
                            TD_BASE_CLS,
                            field === "Physical Variance"
                              ? "text-center sticky right-0 z-10 bg-white shadow-[-1px_0_0_#e2e8f0]"
                              : "text-right"
                          )}>
                            {field === "Physical Variance"
                              ? renderEditableInput(row, fk, String(rawValue ?? ""))
                              : renderTooltipText(rawValue, { align: "right", numeric: true, color, bold: true })
                            }
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {bottomSpacerHeight > 0 && (
                  <tr style={{ height: bottomSpacerHeight }}>
                    <td colSpan={visibleColumnCount} style={{ padding: 0, height: bottomSpacerHeight }} />
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={visibleColumnCount} className="py-3 text-center text-text-muted text-[12px] bg-white">Loading…</td>
                  </tr>
                )}
                {isLoadingMore && (
                  <tr>
                    <td colSpan={visibleColumnCount} className="py-3 text-center bg-white">
                      <div className="flex items-center justify-center gap-2 text-text-muted">
                        <Spinner size="sm" />
                        <span className="text-[12px] font-semibold">Loading more…</span>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
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
                <p className="font-semibold text-text-primary">{detailsRow.subCategory || "-"}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setDetailsRow(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Variance Edit History Modal */}
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
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Previous Physical Stock</p>
                      <p className="font-semibold text-text-primary">{h.previousPhysicalStock}</p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Previous Variance</p>
                      <p className="font-semibold text-text-primary">{h.previousVariance}</p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Edited By</p>
                      <p className="font-semibold text-text-primary">{h.editedBy || "-"}</p>
                    </div>

                    <div className="bg-surface-subtle p-3 rounded-lg border border-border">
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Edited Date</p>
                      <p className="font-semibold text-text-primary">
                        {h.editedAt ? new Date(h.editedAt).toLocaleDateString("en-CA") : "-"}
                      </p>
                    </div>

                    <div className="col-span-2 flex justify-center">
                      <div className="bg-surface-subtle p-3 rounded-lg border border-border w-[220px] text-center">
                        <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Edited Time</p>
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
                      <p className="text-text-muted text-[11px] font-bold uppercase mb-1">Reason</p>
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
