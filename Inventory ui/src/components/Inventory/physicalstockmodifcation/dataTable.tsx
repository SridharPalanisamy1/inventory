  // "use client";

  // /**
  //  * physicalstockmodifcation/dataTable.tsx — rewritten with pure Tailwind CSS.
  //  * Replaces 633-line MUI version.
  //  */

  // import React, { useState, useCallback, useEffect, useMemo } from "react";
  // import { useSelector } from "react-redux";
  // import { selectVisibleColumns } from "../../../features/yen_inventory/OuletePhysicalStockSlice";
  // import DotLoaderLike from "@/components/Loaders/DotLoaderWrapper";
  // import { Tooltip } from "@/components/ui/Tooltip";
  // import { cn } from "@/lib/utils";
  // import {
  //   formatInventoryQty,
  //   getInventoryNumber,
  //   isMissingInventoryValue,
  // } from "@/components/Inventory/shared/numberFormat";
  // import {
  //   TH_BASE_CLS,
  //   TD_BASE_CLS,
  //   tableMinWidth,
  // } from "@/components/Inventory/shared/tableConfig";
  // import { useVirtualizedRows } from "@/components/Inventory/shared/useVirtualizedRows";

  // export interface Row {
  //   index: number;
  //   itemCode: string;
  //   category: string;
  //   subcategory: string;
  //   itemName: string;
  //   randomId: string;
  //   varianceName: string;
  //   closingQty: string;
  //   systemStock?: number | null;
  //   systemStockSo?: number | null;
  //   physicalStock?: number | null;
  //   previousSystemStock?: number | null;
  // }

  // interface DataTableProps {
  //   rows: Row[];
  //   selectedBranches: string;
  //   onPhysicalStockChange: (
  //     event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  //     itemName: string,
  //     varianceName: string,
  //     branchName: string,
  //     itemCode: string
  //   ) => void;
  //   loading: boolean;
  //   tableContainerRef: React.RefObject<HTMLDivElement>;
  //   inputRefs: React.MutableRefObject<Array<HTMLInputElement | null>>;
  //   resetInputs: boolean;
  //   disabled?: boolean;
  // }


  // const toTooltip = (value: unknown) => {
  //   if (value === undefined || value === null || value === "") return "-";
  //   return String(value);
  // };

  // const DataTable: React.FC<DataTableProps> = ({
  //   rows,
  //   selectedBranches,
  //   onPhysicalStockChange,
  //   inputRefs,
  //   tableContainerRef,
  //   loading,
  //   resetInputs,
  //   disabled = false,
  // }) => {
  //   const [tempStocks, setTempStocks] = useState<Record<string, number | string>>({});
  //   const [touchedKeys, setTouchedKeys] = useState<Set<string>>(new Set());

  //   const visibleColumns = useSelector(selectVisibleColumns) || {
  //     "S.No": true, "Item Code": true, "Category": false, "Sub Category": false,
  //     "Item Name": true, "Variance": true, "SO Stock": true, "Prev System": true,
  //     "System Stock": true, "Physical": true,
  //   };

  //   const isColumnVisible = useCallback(
  //     (columnKey: string) => visibleColumns[columnKey] !== false,
  //     [visibleColumns]
  //   );

  //   useEffect(() => {
  //     if (resetInputs) {
  //       setTempStocks({});
  //       setTouchedKeys(new Set());
  //     }
  //   }, [resetInputs]);

  //   const touchedCount = touchedKeys.size;

  //   const handlePhysicalStockChange = useCallback(
  //     (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, row: Row) => {
  //       const value = e.target.value;
  //       const key = `${row.itemName}-${row.varianceName}-${selectedBranches}`;

  //       if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) {
  //         setTempStocks((prev) => ({ ...prev, [key]: value }));
  //         setTouchedKeys((prev) => {
  //           const next = new Set(prev);
  //           next.add(key);
  //           return next;
  //         });

  //         onPhysicalStockChange(
  //           e,
  //           row.itemName,
  //           row.varianceName,
  //           selectedBranches,
  //           row.itemCode
  //         );
  //       }
  //     },
  //     [onPhysicalStockChange, selectedBranches]
  //   );

  //   // Column definitions mapping to state/data
  //   const columns = useMemo(() => [
  //     { key: "S.No",                label: "S.NO",          align: "center", width: "w-[50px]" },
  //     { key: "Item Code",           label: "Item Code",      align: "left", width: "w-[120px]" },
  //     { key: "Item Name",           label: "Item Name",      align: "left", width: "w-[180px]" },
  //     { key: "Variance",            label: "Variance",       align: "left", width: "w-[180px]" },
  //     { key: "Category",            label: "Category",       align: "left", width: "w-[150px]" },
  //     { key: "Subcategory",         label: "Subcategory",    align: "left", width: "w-[150px]" },
  //     { key: "S.O Stock",           label: "S.O Stock",      align: "right", width: "" },
  //     { key: "Prev. System Stock",  label: "Prev System",    align: "right", width: "" },
  //     { key: "System Stock",        label: "System Stock",   align: "right", width: "" },
  //     { key: "Physical Stock",      label: "Physical Stock", align: "right", width: "" },
  //   ], []);

  //   const activeColumns = columns.filter(c => isColumnVisible(c.key));

  //   const {
  //     visibleRows, startIdx, topSpacerHeight, bottomSpacerHeight, handleScroll: handleTableScroll,
  //   } = useVirtualizedRows(rows, tableContainerRef, { rowHeight: 37 });

  //   return (
  //     <div className="w-full h-full min-h-0 relative bg-white flex flex-col">
  //       {touchedCount > 0 && (
  //         <div className="absolute bottom-4 right-6 z-40 pointer-events-none shadow-md rounded-full">
  //           <div className="h-[28px] flex items-center px-3 text-[11.5px] font-extrabold text-[#c2410c] bg-[#fffaf2] border border-[#fed7aa] rounded-full">
  //             {touchedCount} changed
  //           </div>
  //         </div>
  //       )}

  //       <div 
  //         ref={tableContainerRef}
  //         onScroll={handleTableScroll}
  //         className="flex-1 w-full min-w-0 max-h-full overflow-auto border border-border rounded-xl bg-white"
  //         style={{ scrollbarWidth: "thin", contain: "layout paint" }}
  //       >
  //         <table className="w-full border-separate border-spacing-0" style={{ minWidth: tableMinWidth(activeColumns.length), tableLayout: "fixed" }}>
  //           <thead className="sticky top-0 z-30">
  //             <tr>
  //               {activeColumns.map(c => (
  //                 <th
  //                   key={c.key}
  //                   className={cn(
  //                     TH_BASE_CLS,
  //                     "whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)]",
  //                     c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
  //                     c.width
  //                   )}
  //                 >
  //                   <div className="truncate w-full" title={c.label}>{c.label}</div>
  //                 </th>
  //               ))}
  //             </tr>
  //           </thead>
  //           <tbody>
  //             {loading && rows.length === 0 ? (
  //               <tr>
  //                 <td colSpan={activeColumns.length} className="py-20">
  //                   <DotLoaderLike message="" />
  //                 </td>
  //               </tr>
  //             ) : rows.length === 0 ? (
  //               <tr>
  //                 <td colSpan={activeColumns.length} className="py-20 text-center">
  //                   <div className="inline-flex flex-col items-center gap-1.5">
  //                     <p className="text-[14px] font-extrabold text-text-primary">No records found</p>
  //                     <p className="text-[12px] font-semibold text-text-muted">Try changing filters or refresh the data.</p>
  //                   </div>
  //                 </td>
  //               </tr>
  //             ) : (
  //               <>
  //                 {topSpacerHeight > 0 && (
  //                   <tr style={{ height: topSpacerHeight }}>
  //                     <td colSpan={activeColumns.length} style={{ padding: 0, height: topSpacerHeight }} />
  //                   </tr>
  //                 )}
  //                 {visibleRows.map((row, index) => {
  //                   const idx = startIdx + index;
  //                   const key = `${row.itemName}-${row.varianceName}-${selectedBranches}`;
  //                   const isChanged = touchedKeys.has(key);
  //                   const displayPhysical = tempStocks[key] !== undefined ? tempStocks[key] : "";

  //                 return (
  //                   <tr
  //                     key={key}
  //                     className={cn(
  //                       "group border-b border-surface-subtle transition-colors",
  //                       isChanged ? "bg-[#fffaf2] hover:bg-[#fff3df]" : "bg-white hover:bg-brand-50/40"
  //                     )}
  //                   >
  //                     {activeColumns.map(c => {
  //                       let content = null;
                        
  //                       if (c.key === "S.No") {
  //                         content = <div className="text-[12px] font-extrabold text-text-muted text-center">{idx + 1}</div>;
  //                       } else if (c.key === "Item Code") {
  //                         content = <Tooltip content={toTooltip(row.randomId)} side="top"><div className="text-[12px] font-extrabold text-text-primary truncate">{row.randomId}</div></Tooltip>;
  //                       } else if (c.key === "Item Name") {
  //                         content = <Tooltip content={toTooltip(row.itemName)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate">{row.itemName}</div></Tooltip>;
  //                       } else if (c.key === "Variance") {
  //                         content = <Tooltip content={toTooltip(row.varianceName)} side="top"><div className="text-[12px] font-extrabold text-text-primary truncate">{row.varianceName}</div></Tooltip>;
  //                       } else if (c.key === "Category") {
  //                         content = <Tooltip content={toTooltip(row.category)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate">{row.category}</div></Tooltip>;
  //                       } else if (c.key === "Subcategory") {
  //                         content = <Tooltip content={toTooltip(row.subcategory)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate">{row.subcategory}</div></Tooltip>;
  //                       }
  //                        else if (c.key === "S.O Stock") {
  //                         content = <Tooltip content={toTooltip(row.systemStockSo)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate text-right">{row.systemStockSo ?? "-"}</div></Tooltip>;
  //                       } 
  //                       else if (c.key === "Prev. System Stock") {
  //                         content = <Tooltip content={toTooltip(row.previousSystemStock)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate text-right">{row.previousSystemStock ?? "-"}</div></Tooltip>;
  //                       } else if (c.key === "System Stock") {
  //                         content = <Tooltip content={toTooltip(row.systemStock)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate text-right">{row.systemStock ?? "-"}</div></Tooltip>;
  //                       } else if (c.key === "Physical Stock") {
  //                         content = (
  //                           <div className="pr-1.5 w-full flex justify-end">
  //                             <input
  //                               ref={(el) => { inputRefs.current[idx] = el; }}
  //                               value={displayPhysical}
  //                               onChange={(e) => handlePhysicalStockChange(e, row)}
  //                               onBlur={(e) => {
  //                                 if (!e.target.value) {
  //                                   setTempStocks((prev) => ({ ...prev, [key]: "" }));
  //                                   onPhysicalStockChange(
  //                                     { ...e, target: { ...e.target, value: "" } } as React.ChangeEvent<HTMLInputElement>,
  //                                     row.itemName, row.varianceName, selectedBranches, row.itemCode
  //                                   );
  //                                 }
  //                               }}
  //                               onFocus={(e) => {
  //                                 if (e.target.value === "0") {
  //                                   setTempStocks((prev) => ({ ...prev, [key]: "" }));
  //                                 }
  //                               }}
  //                               onKeyDown={(e) => {
  //                                 if (e.key === "Enter") {
  //                                   e.preventDefault();
  //                                   inputRefs.current[idx + 1]?.focus();
  //                                 }
  //                               }}
  //                               disabled={disabled}
  //                               inputMode="decimal"
  //                               maxLength={5}
  //                                 className={cn(
  //                                 "h-[29px] w-[100px] bg-white rounded-[9px] text-[12px] text-left px-2 font-extrabold text-text-primary tabular-nums",
  //                                 "border border-[#d3dfec] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20",
  //                                 "hover:border-[#9dccf7] transition-all",
  //                                 disabled && "bg-[#f8fafc] cursor-not-allowed text-text-disabled"
  //                               )}
  //                             />
  //                           </div>
  //                         );
  //                       }

  //                       return (
  //                         <td
  //                           key={c.key}
  //                           className={cn(
  //                             TD_BASE_CLS,
  //                             "h-[37px] align-middle",
  //                             c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
  //                             isChanged ? "bg-[#fffaf2] group-hover:bg-[#fff3df]" : "bg-white group-hover:bg-brand-50/40"
  //                           )}
  //                         >
  //                           {content}
  //                         </td>
  //                       );
  //                     })}
  //                   </tr>
  //                 );
  //               })}
                
  //               {bottomSpacerHeight > 0 && (
  //                 <tr style={{ height: bottomSpacerHeight }}>
  //                   <td colSpan={activeColumns.length} style={{ padding: 0, height: bottomSpacerHeight }} />
  //                 </tr>
  //               )}
  //             </>
  //           )}

  //             {loading && rows.length > 0 && (
  //               <tr>
  //                 <td colSpan={activeColumns.length} className="py-3 text-center bg-white">
  //                   <div className="flex items-center justify-center gap-2 text-text-muted">
  //                     <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
  //                     <span className="text-[12px] font-bold">Loading more items...</span>
  //                   </div>
  //                 </td>
  //               </tr>
  //             )}
  //           </tbody>
  //         </table>
  //       </div>
  //     </div>
  //   );
  // };

  // export default React.memo(DataTable);
  // replace the entire part 11 8 2
  "use client";

  /**
   * physicalstockmodifcation/dataTable.tsx — rewritten with pure Tailwind CSS.
   * Replaces 633-line MUI version.
   */

  import React, { useState, useCallback, useEffect, useMemo } from "react";
  import { useSelector } from "react-redux";
  import { selectVisibleColumns } from "../../../features/yen_inventory/OuletePhysicalStockSlice";
  import DotLoaderLike from "@/components/Loaders/DotLoaderWrapper";
  import { Tooltip } from "@/components/ui/Tooltip";
  import { cn } from "@/lib/utils";
  import {
    formatInventoryQty,
    getInventoryNumber,
    isMissingInventoryValue,
  } from "@/components/Inventory/shared/numberFormat";
   import {
    RM_HIDDEN_COLUMNS,
    selectOutletStockType,
  } from "../../../features/yen_inventory/outletStockTypeSlice";
  import {
    TH_BASE_CLS,
    TD_BASE_CLS,
    tableMinWidth,
  } from "@/components/Inventory/shared/tableConfig";
  import { useVirtualizedRows } from "@/components/Inventory/shared/useVirtualizedRows";

  export interface Row {
    index: number;
    itemCode: string;
    category: string;
    subcategory: string;
    itemName: string;
    randomId: string;
    varianceName: string;
    closingQty: string;
    systemStock?: number | null;
    systemStockSo?: number | null;
    physicalStock?: number | null;
    previousSystemStock?: number | null;
  }

  interface DataTableProps {
    rows: Row[];
    selectedBranches: string;
    onPhysicalStockChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      itemName: string,
      varianceName: string,
      branchName: string,
      itemCode: string
    ) => void;
    loading: boolean;
    tableContainerRef: React.RefObject<HTMLDivElement>;
    inputRefs: React.MutableRefObject<Array<HTMLInputElement | null>>;
    resetInputs: boolean;
    disabled?: boolean;
  }


  const toTooltip = (value: unknown) => {
    if (value === undefined || value === null || value === "") return "-";
    return String(value);
  };

  const DataTable: React.FC<DataTableProps> = ({
    rows,
    selectedBranches,
    onPhysicalStockChange,
    inputRefs,
    tableContainerRef,
    loading,
    resetInputs,
    disabled = false,
  }) => {
    const [tempStocks, setTempStocks] = useState<Record<string, number | string>>({});
    const [touchedKeys, setTouchedKeys] = useState<Set<string>>(new Set());

    const visibleColumns = useSelector(selectVisibleColumns) || {
      "S.No": true, "Item Code": true, "Category": false, "Sub Category": false,
      "Item Name": true, "Variance": true, "SO Stock": true, "Prev System": true,
      "System Stock": true, "Physical": true,
    };
const isRm = useSelector(selectOutletStockType) === "RM";
    const isColumnVisible = useCallback(
 (columnKey: string) =>
        !(isRm && RM_HIDDEN_COLUMNS.includes(columnKey)) &&
        visibleColumns[columnKey] !== false,
      [visibleColumns, isRm]
    );

    useEffect(() => {
      if (resetInputs) {
        setTempStocks({});
        setTouchedKeys(new Set());
      }
    }, [resetInputs]);

    const touchedCount = touchedKeys.size;

    const handlePhysicalStockChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, row: Row) => {
        const value = e.target.value;
        const key = `${row.itemName}-${row.varianceName}-${selectedBranches}`;

        if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) {
          setTempStocks((prev) => ({ ...prev, [key]: value }));
          setTouchedKeys((prev) => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });

          onPhysicalStockChange(
            e,
            row.itemName,
            row.varianceName,
            selectedBranches,
            row.itemCode
          );
        }
      },
      [onPhysicalStockChange, selectedBranches]
    );

    // Column definitions mapping to state/data
    const columns = useMemo(() => [
      { key: "S.No",                label: "S.NO",          align: "center", width: "w-[50px]" },
      { key: "Item Code",           label: "Item Code",      align: "left", width: "w-[120px]" },
      { key: "Item Name",           label: "Item Name",      align: "left", width: "w-[180px]" },
      { key: "Variance",            label: "Variance",       align: "left", width: "w-[180px]" },
      { key: "Category",            label: "Category",       align: "left", width: "w-[150px]" },
      { key: "Subcategory",         label: "Subcategory",    align: "left", width: "w-[150px]" },
      { key: "S.O Stock",           label: "S.O Stock",      align: "right", width: "" },
      { key: "Prev. System Stock",  label: "Prev System",    align: "right", width: "" },
      { key: "System Stock",        label: "System Stock",   align: "right", width: "" },
      { key: "Physical Stock",      label: "Physical Stock", align: "right", width: "" },
    ], []);

    const activeColumns = columns.filter(c => isColumnVisible(c.key));

    const {
      visibleRows, startIdx, topSpacerHeight, bottomSpacerHeight, handleScroll: handleTableScroll,
    } = useVirtualizedRows(rows, tableContainerRef, { rowHeight: 37 });

    return (
      <div className="w-full h-full min-h-0 relative bg-white flex flex-col">
        {touchedCount > 0 && (
          <div className="absolute bottom-4 right-6 z-40 pointer-events-none shadow-md rounded-full">
            <div className="h-[28px] flex items-center px-3 text-[11.5px] font-extrabold text-[#c2410c] bg-[#fffaf2] border border-[#fed7aa] rounded-full">
              {touchedCount} changed
            </div>
          </div>
        )}

        <div 
          ref={tableContainerRef}
          onScroll={handleTableScroll}
          className="flex-1 w-full min-w-0 max-h-full overflow-auto border border-border rounded-xl bg-white"
          style={{ scrollbarWidth: "thin", contain: "layout paint" }}
        >
          <table className="w-full border-separate border-spacing-0" style={{ minWidth: tableMinWidth(activeColumns.length), tableLayout: "fixed" }}>
            <thead className="sticky top-0 z-30">
              <tr>
                {activeColumns.map(c => (
                  <th
                    key={c.key}
                    className={cn(
                      TH_BASE_CLS,
                      "whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_0_rgba(226,232,240,0.28)]",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                      c.width
                    )}
                  >
                    <div className="truncate w-full" title={c.label}>{c.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length} className="py-20">
                    <DotLoaderLike message="" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length} className="py-20 text-center">
                    <div className="inline-flex flex-col items-center gap-1.5">
                      <p className="text-[14px] font-extrabold text-text-primary">No records found</p>
                      <p className="text-[12px] font-semibold text-text-muted">Try changing filters or refresh the data.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {topSpacerHeight > 0 && (
                    <tr style={{ height: topSpacerHeight }}>
                      <td colSpan={activeColumns.length} style={{ padding: 0, height: topSpacerHeight }} />
                    </tr>
                  )}
                  {visibleRows.map((row, index) => {
                    const idx = startIdx + index;
                    const key = `${row.itemName}-${row.varianceName}-${selectedBranches}`;
                    const isChanged = touchedKeys.has(key);
                    const displayPhysical = tempStocks[key] !== undefined ? tempStocks[key] : "";

                  return (
                    <tr
                      key={key}
                      className={cn(
                        "group border-b border-surface-subtle transition-colors",
                        isChanged ? "bg-[#fffaf2] hover:bg-[#fff3df]" : "bg-white hover:bg-brand-50/40"
                      )}
                    >
                      {activeColumns.map(c => {
                        let content = null;
                        
                        if (c.key === "S.No") {
                          content = <div className="text-[12px] font-extrabold text-text-muted text-center">{idx + 1}</div>;
                        } else if (c.key === "Item Code") {
                          content = <Tooltip content={toTooltip(row.itemCode)} side="top"><div className="text-[12px] font-extrabold text-text-primary truncate">{row.itemCode}</div></Tooltip>;
                        } else if (c.key === "Item Name") {
                          content = <Tooltip content={toTooltip(row.itemName)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate">{row.itemName}</div></Tooltip>;
                        } else if (c.key === "Variance") {
                          content = <Tooltip content={toTooltip(row.varianceName)} side="top"><div className="text-[12px] font-extrabold text-text-primary truncate">{row.varianceName}</div></Tooltip>;
                        } else if (c.key === "Category") {
                          content = <Tooltip content={toTooltip(row.category)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate">{row.category}</div></Tooltip>;
                        } else if (c.key === "Subcategory") {
                          content = <Tooltip content={toTooltip(row.subcategory)} side="top"><div className="text-[12px] font-semibold text-text-secondary truncate">{row.subcategory}</div></Tooltip>;
                        }
else if (c.key === "S.O Stock") {
  content = (
    <Tooltip
      content={toTooltip(formatInventoryQty(row.systemStockSo))}
      side="top"
    >
      <div className="text-[12px] font-semibold text-text-secondary truncate text-right">
        {formatInventoryQty(row.systemStockSo)}
      </div>
    </Tooltip>
  );
}
else if (c.key === "Prev. System Stock") {
  content = (
    <Tooltip
      content={toTooltip(formatInventoryQty(row.previousSystemStock))}
      side="top"
    >
      <div className="text-[12px] font-semibold text-text-secondary truncate text-right">
        {formatInventoryQty(row.previousSystemStock)}
      </div>
    </Tooltip>
  );
}
else if (c.key === "System Stock") {
  content = (
    <Tooltip
      content={toTooltip(formatInventoryQty(row.systemStock))}
      side="top"
    >
      <div className="text-[12px] font-semibold text-text-secondary truncate text-right">
        {formatInventoryQty(row.systemStock)}
      </div>
    </Tooltip>
  );
}
else if (c.key === "Physical Stock") {
                          content = (
                            <div className="pr-1.5 w-full flex justify-end">
                              <input
                                ref={(el) => { inputRefs.current[idx] = el; }}
                                value={displayPhysical}
                                onChange={(e) => handlePhysicalStockChange(e, row)}
                                onBlur={(e) => {
                                  if (!e.target.value) {
                                    setTempStocks((prev) => ({ ...prev, [key]: "" }));
                                    onPhysicalStockChange(
                                      { ...e, target: { ...e.target, value: "" } } as React.ChangeEvent<HTMLInputElement>,
                                      row.itemName, row.varianceName, selectedBranches, row.itemCode
                                    );
                                  }
                                }}
                                onFocus={(e) => {
                                  if (e.target.value === "0") {
                                    setTempStocks((prev) => ({ ...prev, [key]: "" }));
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    inputRefs.current[idx + 1]?.focus();
                                  }
                                }}
                                disabled={disabled}
                                inputMode="decimal"
                                maxLength={5}
                                  className={cn(
                                  "h-[29px] w-[100px] bg-white rounded-[9px] text-[12px] text-left px-2 font-extrabold text-text-primary tabular-nums",
                                  "border border-[#d3dfec] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20",
                                  "hover:border-[#9dccf7] transition-all",
                                  disabled && "bg-[#f8fafc] cursor-not-allowed text-text-disabled"
                                )}
                              />
                            </div>
                          );
                        }

                        return (
                          <td
                            key={c.key}
                            className={cn(
                              TD_BASE_CLS,
                              "h-[37px] align-middle",
                              c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                              isChanged ? "bg-[#fffaf2] group-hover:bg-[#fff3df]" : "bg-white group-hover:bg-brand-50/40"
                            )}
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                
                {bottomSpacerHeight > 0 && (
                  <tr style={{ height: bottomSpacerHeight }}>
                    <td colSpan={activeColumns.length} style={{ padding: 0, height: bottomSpacerHeight }} />
                  </tr>
                )}
              </>
            )}

              {loading && rows.length > 0 && (
                <tr>
                  <td colSpan={activeColumns.length} className="py-3 text-center bg-white">
                    <div className="flex items-center justify-center gap-2 text-text-muted">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      <span className="text-[12px] font-bold">Loading more items...</span>
                    </div>
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