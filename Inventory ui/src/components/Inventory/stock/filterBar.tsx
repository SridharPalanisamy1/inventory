"use client";

/**
 * stock/filterBar.tsx — rewritten with pure Tailwind CSS v4.
 * All MUI Box, IconButton, Tooltip, Menu, MenuItem, Checkbox, ListItemText,
 * Typography, UploadFileIcon, FileDownloadIcon, etc. removed.
 * Business logic (dispatch calls, cascade, handlers) 100% unchanged.
 */

import React, { useRef, useMemo, useCallback } from "react";
import {
  RawMaterialsState,
  downloadExportCSV,
  downloadSampleCSV,
  importRawMaterialStock,
  setEditMessage,
  setOpenSnackbar,
  selectVisibleColumns,
  toggleColumn,
} from "@/features/yen_inventory/wharehoueSlice";
import CollapsibleFilter from "../physcialstockvarience/ui/collabsfiler";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { AxiosError } from "axios";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

// ─── Props (unchanged from original) ─────────────────────────────────────────

export interface FilterBarProps {
  searchParams: {
    page: number;
    limit: number;
    locationId: string;
    purchasecategoryName?: string[];
    purchasesubcategoryName?: string[];
    itemName?: string[];
    varianceName?: string[];
    createdDate?: string;
    categorySearch?: string;
    subCategorySearch?: string;
    itemNameSearch?: string;
    varianceNameSearch?: string;
    categoryPage: number;
    categoryLimit: number;
    subCategoryPage: number;
    subCategoryLimit: number;
    itemNamePage: number;
    itemNameLimit: number;
    varianceNamePage: number;
    varianceNameLimit: number;
    includeDropdowns?: boolean;
  };
  onClearAll: () => void;
  onSearchChange: (
    field: keyof RawMaterialsState["filters"],
    value: string | string[]
  ) => void;
  setOpenDownloadDialog: (open: boolean) => void;
  filterOptions: {
    itemNames: string[];
    varianceNames: string[];
    categories: string[];
    subcategories: string[];
    warehouses: { label: string; value: string; aliasName: string }[];
  };
  warehousesLoading?: boolean;
  onFilterScrollBottom: (
    field: "categories" | "subcategories" | "itemNames" | "varianceNames"
  ) => void;
  onFilterSearch: (
    field: "categories" | "subcategories" | "itemNames" | "varianceNames",
    searchTerm: string
  ) => void;
  displayLabel?: string;
  onImportSuccess?: () => void;
  onDownloadCSV?: () => void;
  onDownloadSampleCSV?: () => void;
  onImportCSV?: (file: File) => Promise<void>;
  todayDate: string | null;
  handleRefreshData: () => void;
  disabled?: boolean;
  busyType?:
    | "loading"
    | "importing"
    | "exporting"
    | "saving"
    | "approving"
    | "deleting"
    | null;
  cascadeSourceKey?: string | null;
  cascadeLoading?: boolean;
}

type CascadeKey =
  | "purchasecategoryName"
  | "purchasesubcategoryName"
  | "itemName"
  | "varianceName";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCascadeSourceLabel = (key: string | null) => {
  if (key === "purchasecategoryName")    return "Category";
  if (key === "purchasesubcategoryName") return "Sub Category";
  if (key === "itemName")                return "Item Group";
  if (key === "varianceName")            return "Item Name";
  return "";
};

// ─── Icon Buttons (inline SVGs — no @mui/icons-material) ──────────────────────

const SampleIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const ImportIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const ExportIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const ClearIcon   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>;
const RefreshIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
const ColumnIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>;

// ─── Action Button Primitive ──────────────────────────────────────────────────

const ActionBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
  danger?: boolean;
}> = ({ onClick, disabled, tooltip, children, danger }) => (
  <Tooltip content={tooltip} side="top">
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={tooltip}
      className={cn(
        "h-8 w-8 flex items-center justify-center rounded-[8px] border",
        "transition-all duration-150",
        danger
          ? "border-danger-200 text-danger-500 bg-white hover:bg-danger-50 hover:border-danger-300"
          : "border-brand-200 text-brand-600 bg-white hover:bg-brand-50 hover:border-brand-300",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none border-border text-text-disabled bg-surface-subtle"
      )}
    >
      {children}
    </button>
  </Tooltip>
);

// ─── Column Toggle Dropdown ────────────────────────────────────────────────────

const ColumnToggle: React.FC<{
  visibleColumns: Record<string, boolean>;
  onToggle: (key: string) => void;
  disabled?: boolean;
}> = ({ visibleColumns, onToggle, disabled }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <ActionBtn
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        tooltip="Toggle columns"
      >
        <ColumnIcon />
      </ActionBtn>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-[1200] w-48 rounded-xl border border-border bg-white shadow-xl animate-scale-in overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Columns</p>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {Object.entries(visibleColumns).map(([key, visible]) => (
              <button
                key={key}
                onClick={() => onToggle(key)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-subtle transition-colors"
              >
                <span className={cn(
                  "h-4 w-4 rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-colors",
                  visible ? "bg-brand-600 border-brand-600" : "border-border bg-white"
                )}>
                  {visible && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                {key}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main FilterBar ───────────────────────────────────────────────────────────

const FilterBar: React.FC<FilterBarProps> = ({
  searchParams,
  onClearAll,
  onSearchChange,
  filterOptions,
  warehousesLoading,
  onFilterScrollBottom,
  onFilterSearch,
  onImportSuccess,
  onDownloadCSV,
  onDownloadSampleCSV,
  onImportCSV,
  handleRefreshData,
  disabled = false,
  busyType = null,
  cascadeSourceKey = null,
  cascadeLoading = false,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const visibleColumns = useSelector(selectVisibleColumns) || {
    "S.No": true, "Item Code": true, "Category": false,
    "Sub Category": false, "Item Group": true, "Item Name": true,
    "SO Stock": true, "Prev System": true, "System Stock": true, "Physical": true,
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cascadeSourceLabel = useMemo(() => getCascadeSourceLabel(cascadeSourceKey), [cascadeSourceKey]);

  const handleDownloadSampleCSV = useCallback(() => {
    if (onDownloadSampleCSV) { onDownloadSampleCSV(); return; }
    dispatch(downloadSampleCSV());
  }, [dispatch, onDownloadSampleCSV]);

  const handleDownloadCSV = useCallback(() => {
    if (onDownloadCSV) { onDownloadCSV(); return; }
    if (!searchParams.locationId) {
      dispatch(setEditMessage("Please select a warehouse first."));
      dispatch(setOpenSnackbar(true));
      return;
    }
    dispatch(downloadExportCSV({
      locationId: searchParams.locationId,
      purchasecategoryName:    searchParams.purchasecategoryName?.join(","),
      purchasesubcategoryName: searchParams.purchasesubcategoryName?.join(","),
      itemName:      searchParams.itemName?.join(","),
      varianceName:  searchParams.varianceName?.join(","),
    }));
  }, [dispatch, onDownloadCSV, searchParams.itemName, searchParams.locationId, searchParams.purchasecategoryName, searchParams.purchasesubcategoryName, searchParams.varianceName]);

  const handleImportClick = useCallback(() => {
    if (!disabled) fileInputRef.current?.click();
  }, [disabled]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onImportCSV) {
      try { await onImportCSV(file); }
      catch (error) {
        const err = error as Error;
        dispatch(setEditMessage(`Import failed: ${err.message}`));
        dispatch(setOpenSnackbar(true));
      } finally { e.target.value = ""; }
      return;
    }
    if (!searchParams.locationId) {
      dispatch(setEditMessage("Please select a warehouse first."));
      dispatch(setOpenSnackbar(true));
      e.target.value = ""; return;
    }
    try {
      await dispatch(importRawMaterialStock({ file, locationId: searchParams.locationId })).unwrap();
      dispatch(setEditMessage("CSV imported successfully"));
      dispatch(setOpenSnackbar(true));
      onImportSuccess?.();
    } catch (err) {
      const error = err as AxiosError;
      dispatch(setEditMessage(`Import failed: ${error?.message || "Unknown error"}`));
      dispatch(setOpenSnackbar(true));
    } finally { e.target.value = ""; }
  }, [dispatch, onImportCSV, onImportSuccess, searchParams.locationId]);

  const warehouseOptions = useMemo(
    () => filterOptions.warehouses.map((w) => ({ label: w.label, value: w.value, locationId: w.value })),
    [filterOptions.warehouses]
  );

  const selectedWarehouseAlias = useMemo(
    () => {
      const w = filterOptions.warehouses.find((w) => w.value === searchParams.locationId);
      return w ? w.aliasName || w.label || searchParams.locationId : searchParams.locationId || "";
    },
    [filterOptions.warehouses, searchParams.locationId]
  );

  const isAnyFilterActive = useMemo(() =>
    Boolean(searchParams.locationId) ||
    (searchParams.purchasecategoryName?.length ?? 0) > 0 ||
    (searchParams.purchasesubcategoryName?.length ?? 0) > 0 ||
    (searchParams.itemName?.length ?? 0) > 0 ||
    (searchParams.varianceName?.length ?? 0) > 0,
    [searchParams.locationId, searchParams.purchasecategoryName, searchParams.purchasesubcategoryName, searchParams.itemName, searchParams.varianceName]
  );

  const getCascadeProps = (key: CascadeKey) => {
    const isSource = cascadeSourceKey === key;
    const isCascadeDisabled = cascadeLoading && Boolean(cascadeSourceKey) && !isSource;
    return {
      disabled: disabled || isCascadeDisabled,
      loading: isCascadeDisabled,
      linked: Boolean(cascadeSourceKey) && !isSource,
      statusLabel: isSource ? "Selected" : cascadeSourceKey ? `From ${cascadeSourceLabel}` : undefined,
      loadingText: "Loading related options...",
    };
  };

  return (
    <div className="w-full min-w-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-surface-muted border-y border-border relative z-[100]">
      {/* comment this part because remove the filter 4 8 1 */}
      {/* Label */}
      {/* <div className="hidden sm:flex h-[34px] items-center px-2.5 rounded-[8px] bg-white border border-brand-200 text-[11px] font-extrabold text-brand-700 whitespace-nowrap shrink-0">
        {cascadeSourceKey ? `Filters · ${cascadeSourceLabel}` : "Filters"}
      </div> */}

        <div className="w-[180px] shrink-0">
          <CollapsibleFilter
            title="Location"
            options={warehouseOptions}
            selectedOptions={searchParams.locationId ? [searchParams.locationId] : []}
            onChange={(value) => {
              const sv = Array.isArray(value) ? value[0] || "" : value || "";
              onSearchChange("locationId", sv);
            }}
            onClear={() => onSearchChange("locationId", "")}
            onScrollBottom={() => {}}
            onSearch={() => {}}
            inputType="single-select"
            isMulti={false}
            loading={warehousesLoading}
            disabled={disabled}
            statusLabel={searchParams.locationId ? "Selected" : undefined}
            showSelectedCount={false}
            showRemoveOption={false}
            displayLabel={selectedWarehouseAlias}
          />
        </div>

        <div className="w-[180px] shrink-0">
          <CollapsibleFilter
            title="Category"
            options={filterOptions.categories.map((n) => ({ label: n, value: n }))}
            selectedOptions={searchParams.purchasecategoryName || []}
            onChange={(v) => onSearchChange("purchasecategoryName", Array.isArray(v) ? v : [v])}
            onClear={() => onSearchChange("purchasecategoryName", [])}
            onScrollBottom={() => onFilterScrollBottom("categories")}
            onSearch={(t) => onFilterSearch("categories", t)}
            inputType="multi-select"
            isMulti
            {...getCascadeProps("purchasecategoryName")}
          />
        </div>

        <div className="w-[180px] shrink-0">
          <CollapsibleFilter
            title="Sub Category"
            options={filterOptions.subcategories.map((n) => ({ label: n, value: n }))}
            selectedOptions={searchParams.purchasesubcategoryName || []}
            onChange={(v) => onSearchChange("purchasesubcategoryName", Array.isArray(v) ? v : [v])}
            onClear={() => onSearchChange("purchasesubcategoryName", [])}
            onScrollBottom={() => onFilterScrollBottom("subcategories")}
            onSearch={(t) => onFilterSearch("subcategories", t)}
            inputType="multi-select"
            isMulti
            {...getCascadeProps("purchasesubcategoryName")}
          />
        </div>

        <div className="w-[180px] shrink-0">
          <CollapsibleFilter
            title="Item Group"
            options={filterOptions.itemNames.map((n) => ({ label: n, value: n }))}
            selectedOptions={searchParams.itemName || []}
            onChange={(v) => onSearchChange("itemName", Array.isArray(v) ? v : [v])}
            onClear={() => onSearchChange("itemName", [])}
            onScrollBottom={() => onFilterScrollBottom("itemNames")}
            onSearch={(t) => onFilterSearch("itemNames", t)}
            inputType="multi-select"
            isMulti
            {...getCascadeProps("itemName")}
          />
        </div>

        <div className="w-[180px] shrink-0">
          <CollapsibleFilter
            title="Item Name"
            options={filterOptions.varianceNames.map((n) => ({ label: n, value: n }))}
            selectedOptions={searchParams.varianceName || []}
            onChange={(v) => onSearchChange("varianceName", Array.isArray(v) ? v : [v])}
            onClear={() => onSearchChange("varianceName", [])}
            onScrollBottom={() => onFilterScrollBottom("varianceNames")}
            onSearch={(t) => onFilterSearch("varianceNames", t)}
            inputType="multi-select"
            isMulti
            {...getCascadeProps("varianceName")}
          />
        </div>

        {/* Buttons section to match Outlet UI exactly */}
        <div className="flex items-center gap-1.5 ml-auto">
          <ActionBtn
            onClick={onClearAll}
            disabled={disabled || !isAnyFilterActive}
            tooltip="Clear filters"
            danger
          >
            <ClearIcon />
          </ActionBtn>
          <ActionBtn onClick={handleRefreshData} disabled={disabled} tooltip="Refresh">
            <RefreshIcon />
          </ActionBtn>
          
          <div className="w-[1px] h-5 bg-border mx-1 shrink-0" />
          
          <ActionBtn onClick={handleDownloadSampleCSV} disabled={disabled} tooltip="Download sample CSV">
            <SampleIcon />
          </ActionBtn>
          <ActionBtn
            onClick={handleImportClick}
            disabled={disabled}
            tooltip={busyType === "importing" ? "Importing…" : "Import CSV"}
          >
            <ImportIcon />
          </ActionBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <ActionBtn
            onClick={handleDownloadCSV}
            disabled={disabled}
            tooltip={busyType === "exporting" ? "Exporting…" : "Export CSV"}
          >
            <ExportIcon />
          </ActionBtn>
          
          <div className="w-[1px] h-5 bg-border mx-1 shrink-0" />
          
          <ColumnToggle
            visibleColumns={visibleColumns}
            onToggle={(key) => dispatch(toggleColumn(key))}
            disabled={disabled}
          />
        </div>
    </div>
  );
};

export default FilterBar;