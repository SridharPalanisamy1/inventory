"use client";

/**
 * storestockvarience/filterBar.tsx — rewritten with pure Tailwind CSS.
 * Replaces 543-line MUI version. Props interface 100% identical.
 */

import React, { useMemo, useCallback } from "react";
import CollapsibleFilter from "../physcialstockvarience/ui/collabsfiler";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

// ─── Props (unchanged) ────────────────────────────────────────────────────────

export interface FilterBarProps {
  searchParams: {
    itemName: string[];
    varianceName: string[];
    category: string[];
    subcategory: string[];
    locationName: string;
    createdDate?: string;
  };
  onSearchChange: (field: string, value: string[] | string) => void;
  setOpenDownloadDialog: (open: boolean) => void;
  filterOptions: {
    category: string[];
    subcategory: string[];
    itemName: string[];
    varianceName: string[];
    warehouses: { name: string; locationId: string; aliasName: string }[];
  };
  visibleColumns: Record<string, boolean>;
  onColumnVisibilityChange: (columns: Record<string, boolean>) => void;
  onFilterSearch: (field: "category" | "subcategory" | "itemName" | "varianceName" | "locationName", searchTerm: string) => void;
  onFilterScrollBottom: (field: "category" | "subcategory" | "itemName" | "varianceName" | "locationName") => void;
  getWarehouseName: (id: string) => string;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  onClearAllFilters?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  cascadeSourceKey?: string | null;
  cascadeLoading?: boolean;
  onCascadeReset?: () => void;
}

type FilterField = "category" | "subcategory" | "itemName" | "varianceName";
const FILTER_FIELDS: FilterField[] = ["category", "subcategory", "itemName", "varianceName"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCascadeSourceLabel = (field: string | null) => {
  if (field === "category") return "Category";
  if (field === "subcategory") return "Sub Category";
  if (field === "itemName") return "Item Group";
  if (field === "varianceName") return "Item Name";
  return "";
};

// ─── Icon Buttons ─────────────────────────────────────────────────────────────

const ClearIcon   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>;
const RefreshIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
const FilterListIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;

const ActionBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}> = ({ onClick, disabled, tooltip, children, danger, active }) => (
  <Tooltip content={tooltip} side="top">
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={tooltip}
      className={cn(
        "h-8 w-8 flex items-center justify-center rounded-[8px] border transition-all duration-150 shrink-0",
        danger
          ? "border-danger-200 text-danger-500 bg-white hover:bg-danger-50 hover:border-danger-300"
          : active
          ? "bg-brand-50 border-brand-300 text-brand-700 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
          : "border-brand-200 text-brand-600 bg-white hover:bg-brand-50 hover:border-brand-300",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none border-border text-text-disabled bg-surface-subtle"
      )}
    >
      {children}
    </button>
  </Tooltip>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const FilterBar: React.FC<FilterBarProps> = ({
  searchParams,
  onSearchChange,
  filterOptions,
  onFilterSearch,
  onFilterScrollBottom,
  onClearAllFilters,
  onRefresh,
  isRefreshing,
  cascadeSourceKey = null,
  cascadeLoading = false,
  onCascadeReset,
  visibleColumns,
  onColumnVisibilityChange,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasLocation = Boolean(searchParams.locationName);
  const cascadeSourceLabel = useMemo(() => getCascadeSourceLabel(cascadeSourceKey), [cascadeSourceKey]);

  const selectedWarehouseAlias = useMemo(() => {
    const w = filterOptions.warehouses.find((item) => item.locationId === searchParams.locationName);
    return w?.aliasName || w?.name || searchParams.locationName || "";
  }, [filterOptions.warehouses, searchParams.locationName]);

  const warehouseOptions = useMemo(() => filterOptions.warehouses.map((w) => ({
    label: `${w.name} (${w.locationId})`, value: w.locationId,
  })), [filterOptions.warehouses]);

  const isAnyFilterActive = useMemo(() => FILTER_FIELDS.some((f) => searchParams[f]?.length > 0), [searchParams]);

  const handleClearFilters = useCallback(() => {
    onCascadeReset?.();
    onSearchChange("category", []); onSearchChange("subcategory", []);
    onSearchChange("itemName", []); onSearchChange("varianceName", []);
    onFilterSearch("category", ""); onFilterSearch("subcategory", "");
    onFilterSearch("itemName", ""); onFilterSearch("varianceName", "");
    onClearAllFilters?.();
  }, [onCascadeReset, onSearchChange, onFilterSearch, onClearAllFilters]);

  const columnOptions = useMemo(() => {
    if (!visibleColumns) return [];
    return Object.keys(visibleColumns).map((col) => ({ label: col, value: col }));
  }, [visibleColumns]);

  const selectedColumns = useMemo(() => {
    if (!visibleColumns) return [];
    return Object.keys(visibleColumns).filter((col) => visibleColumns[col]);
  }, [visibleColumns]);

  const handleToggleColumn = useCallback((col: string) => {
    if (!visibleColumns || !onColumnVisibilityChange) return;
    onColumnVisibilityChange({ ...visibleColumns, [col]: !visibleColumns[col] });
  }, [visibleColumns, onColumnVisibilityChange]);

  const getCascadeProps = (field: FilterField) => {
    const isSource = cascadeSourceKey === field;
    const isCascadeDisabled = cascadeLoading && Boolean(cascadeSourceKey) && !isSource;
    return {
      disabled: !hasLocation || isCascadeDisabled,
      loading: isCascadeDisabled,
      linked: Boolean(cascadeSourceKey) && !isSource,
      statusLabel: isSource ? "Selected" : cascadeSourceKey ? `From ${cascadeSourceLabel}` : undefined,
      loadingText: "Loading related options...",
    };
  };

  return (
    <div className="w-full min-w-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-surface-muted border-y border-border relative z-[20]">
      {/* commentthis part 4 8 1 */}
      {/* Label
      <div className="hidden sm:flex h-[34px] items-center px-2.5 rounded-[8px] bg-white border border-brand-200 text-[11px] font-extrabold text-brand-700 whitespace-nowrap shrink-0">
        {cascadeSourceKey ? `Filters · ${cascadeSourceLabel}` : "Filters"}
      </div> */}

      <div className="shrink-0 w-[140px] md:w-[180px]">
        <CollapsibleFilter
          title="Location"
          options={warehouseOptions}
          selectedOptions={searchParams.locationName ? [searchParams.locationName] : []}
          onChange={(v) => onSearchChange("locationName", Array.isArray(v) ? v[0] || "" : v)}
          onClear={() => { onSearchChange("locationName", ""); onFilterSearch("locationName", ""); }}
          onScrollBottom={() => onFilterScrollBottom("locationName")}
          onSearch={(t) => onFilterSearch("locationName", t)}
          inputType="single-select"
          isMulti={false}
          showSelectedCount={false}
          showRemoveOption={false}
          displayLabel={hasLocation ? selectedWarehouseAlias : ""}
        />
      </div>

      {!hasLocation ? (
        <div className="shrink-0 h-[34px] flex items-center px-3 rounded-[8px] border border-dashed border-brand-200 bg-brand-50 text-[11px] sm:text-[12px] font-extrabold text-brand-700 whitespace-nowrap">
          Select a warehouse to enable Category, Sub Category, Item Group and Item Name filters.
        </div>
      ) : (
        <>
          <div className="shrink-0 w-[140px] md:w-[180px]">
            <CollapsibleFilter
              title="Category"
              options={filterOptions.category.map((n) => ({ label: n, value: n }))}
              selectedOptions={searchParams.category}
              onChange={(v) => onSearchChange("category", Array.isArray(v) ? v : [v])}
              onClear={() => { onSearchChange("category", []); onFilterSearch("category", ""); }}
              onScrollBottom={() => onFilterScrollBottom("category")}
              onSearch={(t) => onFilterSearch("category", t)}
              inputType="multi-select"
              isMulti
              {...getCascadeProps("category")}
            />
          </div>

          <div className="shrink-0 w-[140px] md:w-[180px]">
            <CollapsibleFilter
              title="Sub Category"
              options={filterOptions.subcategory.map((n) => ({ label: n, value: n }))}
              selectedOptions={searchParams.subcategory}
              onChange={(v) => onSearchChange("subcategory", Array.isArray(v) ? v : [v])}
              onClear={() => { onSearchChange("subcategory", []); onFilterSearch("subcategory", ""); }}
              onScrollBottom={() => onFilterScrollBottom("subcategory")}
              onSearch={(t) => onFilterSearch("subcategory", t)}
              inputType="multi-select"
              isMulti
              {...getCascadeProps("subcategory")}
            />
          </div>

          <div className="shrink-0 w-[170px] md:w-[220px]">
            <CollapsibleFilter
              title="Item Group"
              options={filterOptions.itemName.map((n) => ({ label: n, value: n }))}
              selectedOptions={searchParams.itemName}
              onChange={(v) => onSearchChange("itemName", Array.isArray(v) ? v : [v])}
              onClear={() => { onSearchChange("itemName", []); onFilterSearch("itemName", ""); }}
              onScrollBottom={() => onFilterScrollBottom("itemName")}
              onSearch={(t) => onFilterSearch("itemName", t)}
              inputType="multi-select"
              isMulti
              {...getCascadeProps("itemName")}
            />
          </div>

          <div className="shrink-0 w-[170px] md:w-[220px]">
            <CollapsibleFilter
              title="Item Name"
              options={filterOptions.varianceName.map((n) => ({ label: n, value: n }))}
              selectedOptions={searchParams.varianceName}
              onChange={(v) => onSearchChange("varianceName", Array.isArray(v) ? v : [v])}
              onClear={() => { onSearchChange("varianceName", []); onFilterSearch("varianceName", ""); }}
              onScrollBottom={() => onFilterScrollBottom("varianceName")}
              onSearch={(t) => onFilterSearch("varianceName", t)}
              inputType="multi-select"
              isMulti
              {...getCascadeProps("varianceName")}
            />
          </div>
        </>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-1.5 ml-auto">
        <ActionBtn
          onClick={handleClearFilters}
          disabled={!hasLocation || !isAnyFilterActive}
          tooltip="Clear filters"
          danger
        >
          <ClearIcon />
        </ActionBtn>
        <ActionBtn
          onClick={onRefresh || (() => {})}
          disabled={!hasLocation || isRefreshing}
          tooltip="Refresh"
        >
          <RefreshIcon />
        </ActionBtn>

        {/* Column menu */}
        {visibleColumns && hasLocation && (
          <div className="relative" ref={menuRef}>
            <ActionBtn onClick={() => setMenuOpen(!menuOpen)} active={menuOpen} tooltip="Columns">
              <FilterListIcon />
            </ActionBtn>

            {menuOpen && (
              <div className="absolute right-0 top-[110%] w-[230px] rounded-xl border border-brand-200 bg-white shadow-xl p-2 z-[50]">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[12px] font-bold text-text-primary">Show / Hide Columns</span>
                  <button onClick={() => setMenuOpen(false)} aria-label="Close" className="text-text-muted hover:text-text-primary"><ClearIcon/></button>
                </div>
                <div className="h-px bg-border w-full mb-1.5" />
                <div className="max-h-[190px] overflow-y-auto space-y-0.5 pr-1" style={{ scrollbarWidth: "thin" }}>
                  {columnOptions.map((opt) => {
                    const isChecked = selectedColumns.includes(opt.value);
                    return (
                      <div
                        key={opt.value}
                        onClick={() => handleToggleColumn(opt.value)}
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
                          isChecked ? "bg-brand-50 hover:bg-brand-100" : "hover:bg-surface-muted"
                        )}
                      >
                        <span className={cn("text-[11.5px] truncate", isChecked ? "font-bold text-brand-700" : "font-semibold text-text-secondary")}>
                          {opt.label}
                        </span>
                        <input type="checkbox" checked={isChecked} readOnly className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer pointer-events-none" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default FilterBar;