"use client";

/**
 * physcialstockvarience/filterBar.tsx — rewritten with pure Tailwind CSS.
 * Replaces 650-line MUI version. Props interface 100% identical.
 */
import StockTypeSelect from "../shared/StockTypeSelect";
import { selectOutletStockType } from "../../../features/yen_inventory/outletStockTypeSlice";
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch } from "@/redux/store";
import {
  selectFilterOptions,
  selectVisibleColumns,
  Branch,
  setSearchParams,
} from "../../../features/yen_inventory/OutletPhysicalVarianceSlice";
import CollapsibleFilter from "./ui/collabsfiler";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTodayDate } from "@/components/Hooks/useTodayDate";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SearchParams {
  itemName: string[];
  varianceName: string[];
  category: string[];
  subCategory: string[];
  location?: string[];
  queryDate?: string;
}

type FilterField = keyof Omit<SearchParams, "queryDate" | "location">;

interface FilterBarProps {
  searchParams: SearchParams;
  onSearchChange: (field: keyof SearchParams, value: string[] | string) => void;
  branches: Branch[];
  selectedLocation: string;
  onLocationChange: (selectedOptions: string[] | string) => void;
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (column: string) => void;
  fieldTypes: string[];
  staticColumns: string[];
  loading: boolean;
  isFullScreen?: boolean;
  fullScreenContainerRef?: React.RefObject<HTMLDivElement | null>;
  setResetAnchorEl?: (callback: () => void) => void;
  showColumnFilter: boolean;
  onLoadMoreFilterOptions?: (field: FilterField, page: number, search?: string) => Promise<void>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  cascadeSourceKey?: string | null;
  cascadeLoading?: boolean;
  onCascadeReset?: () => void;
}

const filterFields: FilterField[] = ["category", "subCategory", "itemName", "varianceName"];

const getFilterTitle = (field: FilterField) => {
  if (field === "category") return "Category";
  if (field === "subCategory") return "Sub Category";
  if (field === "itemName") return "Item Name";
  if (field === "varianceName") return "Variance Name";
  return field;
};

const getCascadeSourceLabel = (field: string | null) => {
  if (field === "category") return "Category";
  if (field === "subCategory") return "Sub Category";
  if (field === "itemName") return "Item Name";
  if (field === "varianceName") return "Variance Name";
  return "";
};

// ─── Icon Buttons ─────────────────────────────────────────────────────────────

const ClearIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>;
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
            ? "border-brand-600 text-white bg-brand-600 hover:bg-brand-700"
            : "border-brand-200 text-brand-600 bg-white hover:bg-brand-50 hover:border-brand-300",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none border-border text-text-disabled bg-surface-subtle"
      )}
    >
      {children}
    </button>
  </Tooltip>
);

// ─── Component ────────────────────────────────────────────────────────────────

const FilterBarComponent: React.FC<FilterBarProps> = ({
  searchParams,
  onSearchChange,
  branches,
  selectedLocation,
  onToggleColumn,
  onLocationChange,
  fieldTypes,
  staticColumns,
  showColumnFilter,
  onRefresh,
  isRefreshing,
  onLoadMoreFilterOptions,
  cascadeSourceKey = null,
  cascadeLoading = false,
  onCascadeReset,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const filterOptions = useSelector(selectFilterOptions);
  // RM: no Variance Name filter (raw materials have no variance)
  const isRm = useSelector(selectOutletStockType) === "RM";
  const visibleFilterFields = useMemo(
    () => (isRm ? filterFields.filter((field) => field !== "varianceName") : filterFields),
    [isRm]
  );
  const columns = useSelector(selectVisibleColumns);
  const apiDate = useTodayDate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasLocation = Boolean(selectedLocation);
  const cascadeSourceLabel = useMemo(() => getCascadeSourceLabel(cascadeSourceKey), [cascadeSourceKey]);

  useEffect(() => {
    const clickOut = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", clickOut);
    return () => document.removeEventListener("mousedown", clickOut);
  }, [menuOpen]);

  const columnOptions = useMemo(() => [
    ...staticColumns.map((col) => ({ label: isRm && col === "Variance Name" ? "Item Name" : col, value: col })),
    ...(selectedLocation ? fieldTypes.filter((col) => col !== "Action").map((col) => ({ label: col, value: col })) : []),
  ], [staticColumns, fieldTypes, selectedLocation, isRm]);

  const selectedColumns = useMemo(() => Object.keys(columns).filter((col) => columns[col]), [columns]);

  const handleClearAllFilters = useCallback(() => {
    onCascadeReset?.();
    dispatch(setSearchParams({
      itemName: [], varianceName: [], category: [], subCategory: [],
      location: selectedLocation ? [selectedLocation] : [],
      queryDate: searchParams.queryDate || apiDate,
    }));
  }, [apiDate, dispatch, onCascadeReset, searchParams.queryDate, selectedLocation]);

  const isAnyFilterActive = useMemo(() => filterFields.some((field) => searchParams[field]?.length > 0), [searchParams]);

  const getCascadeProps = (field: FilterField) => {
    const isSource = cascadeSourceKey === field;
    const isCascadeDisabled = cascadeLoading && Boolean(cascadeSourceKey) && !isSource;
    return {
      disabled: !hasLocation || isCascadeDisabled,
      loading: isCascadeDisabled || filterOptions[field]?.loading || false,
      linked: Boolean(cascadeSourceKey) && !isSource,
      statusLabel: isSource ? "Selected" : cascadeSourceKey ? `From ${cascadeSourceLabel}` : undefined,
      loadingText: "Loading related options...",
    };
  };

  const handleFilterScroll = useCallback((field: FilterField) => {
    if (!hasLocation || !onLoadMoreFilterOptions) return;
    const data = filterOptions[field];
    if (!data?.hasMore || data?.loading) return;
    onLoadMoreFilterOptions(field, (data.page || 1) + 1, data.search);
  }, [filterOptions, hasLocation, onLoadMoreFilterOptions]);

  const handleFilterSearch = useCallback((field: FilterField, term: string) => {
    if (hasLocation && onLoadMoreFilterOptions) onLoadMoreFilterOptions(field, 1, term);
  }, [hasLocation, onLoadMoreFilterOptions]);

  const selectedBranchAlias = useMemo(() => {
    const branch = branches.find((b) => b.locationId === selectedLocation);
    return branch?.aliasName || branch?.locationName || selectedLocation;
  }, [branches, selectedLocation]);

  const branchOptions = useMemo(() => branches.map((b) => ({
    label: `${b.locationName} (${b.locationId || ""})`, value: b.locationId,
  })), [branches]);

  return (
    <div className="w-full min-w-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-surface-muted border-y border-border relative z-[20]">
   
      {/* Label  4 8 1*/}
      {/* <div className="hidden sm:flex h-[34px] items-center px-2.5 rounded-[8px] bg-white border border-brand-200 text-[11px] font-extrabold text-brand-700 whitespace-nowrap shrink-0">
        {cascadeSourceKey ? `Filters · ${cascadeSourceLabel}` : "Filters"}
      </div> */}
      <div className="shrink-0 w-[100px] md:w-[110px]">
        <StockTypeSelect />
      </div>
      <div className="shrink-0 w-[140px] md:w-[180px]">
        <CollapsibleFilter
          title="Location"
          options={branchOptions}
          selectedOptions={selectedLocation}
          onChange={onLocationChange}
          onClear={() => onLocationChange("")}
          inputType="single-select"
          isMulti={false}
          showSelectedCount={false}
          showRemoveOption={false}
          displayLabel={selectedBranchAlias}
        />
      </div>

      {!hasLocation ? (
        <div className="shrink-0 h-[34px] flex items-center px-3 rounded-[8px] border border-dashed border-brand-200 bg-brand-50 text-[11px] sm:text-[12px] font-extrabold text-brand-700 whitespace-nowrap">
          Select a location to enable Category, Sub Category, Item Name and Variance Name filters.
        </div>
      ) : (
        visibleFilterFields.map((field) => {
          const fieldOpts = filterOptions[field];
          const opts = fieldOpts?.values?.map((val: string | { id?: string; name?: string }) => ({
            label: typeof val === "string" ? val : val.name ?? "",
            value: typeof val === "string" ? val : val.id ?? val.name ?? "",
          })) || [];

          return (
            <div key={field} className={cn("shrink-0", 
              (field === "itemName" || field === "varianceName") ? "w-[170px] md:w-[220px]" : "w-[140px] md:w-[180px]")}>
              <CollapsibleFilter
                title={getFilterTitle(field)}
                options={opts}
                selectedOptions={searchParams[field]}
                onChange={(val) => onSearchChange(field, val)}
                onClear={() => onSearchChange(field, [])}
                inputType="multi-select"
                isMulti
                onScrollBottom={() => handleFilterScroll(field)}
                onSearch={(term) => handleFilterSearch(field, term)}
                {...getCascadeProps(field)}
              />
            </div>
          );
        })
      )}

      {/* Buttons */}
      <div className="flex items-center gap-1.5 ml-auto">
        <ActionBtn onClick={handleClearAllFilters} disabled={!hasLocation || !isAnyFilterActive} tooltip="Clear filters" danger>
          <ClearIcon />
        </ActionBtn>
        <ActionBtn onClick={onRefresh || (() => {})} disabled={!hasLocation || isRefreshing} tooltip="Refresh">
          <RefreshIcon />
        </ActionBtn>
        
        {/* Column menu */}
        {showColumnFilter && hasLocation && (
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
                        onClick={() => onToggleColumn(opt.value)}
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

export default React.memo(FilterBarComponent);