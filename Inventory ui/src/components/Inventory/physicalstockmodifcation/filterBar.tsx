"use client";



import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch } from "@/redux/store";
import {
  selectFilterOptions,
  clearFilterSearch,
  setFilterSearch,
  fetchItems,
  Branch,
  selectVisibleColumns,
  toggleColumn,
} from "../../../features/yen_inventory/OuletePhysicalStockSlice";
import CollapsibleFilter from "../physcialstockvarience/ui/collabsfiler";
import StockTypeSelect from "../shared/StockTypeSelect";
import {
  RM_HIDDEN_COLUMNS,
  selectOutletStockType,
} from "../../../features/yen_inventory/outletStockTypeSlice";
import { debounce, DebouncedFunc } from "lodash";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

interface SearchParams {
  itemName: string[];
  varianceName: string[];
  category: string[];
  subCategory: string[];
}

interface FilterBarProps {
  searchParams: SearchParams;
  onSearchChange: (field: keyof SearchParams, value: string[] | string) => void;
  branches: Branch[];
  selectedBranches: string;
  onBranchChange: (value: string | string[]) => void;
  setOpenDownloadDialog?: (open: boolean) => void;
  handleDownloadCSV: () => void;
  onToggleColumn?: (column: string) => void;
  onImportFile?: (file: File) => void;
  handleDownloadSampleCSV: () => void;
  skipNextSearch?: () => void;
  todayDate: string | null;
  skipNextSearchRef: React.MutableRefObject<boolean>;
  onRefresh?: () => void;
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
  onCascadeReset?: () => void;
}

type FilterField = keyof Omit<SearchParams, "queryDate">;

const filterFields: FilterField[] = [
  "category",
  "subCategory",
  "itemName",
  "varianceName",
];

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

const SampleIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>;
const ImportIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
const ExportIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const ClearIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>;
const RefreshIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>;
const ColumnIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>;

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
                      <path d="M2 6l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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


const FilterBar: React.FC<FilterBarProps> = ({
  searchParams,
  onSearchChange,
  branches,
  selectedBranches,
  onBranchChange,
  handleDownloadCSV,
  onImportFile,
  handleDownloadSampleCSV,
  onRefresh,
  disabled = false,
  busyType = null,
  cascadeSourceKey = null,
  cascadeLoading = false,
  onCascadeReset,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const visibleColumns = useSelector(selectVisibleColumns) || {
    "S.No": true,
    "Item Code": true,
    "Category": false,
    "Subcategory": false,
    "Item Name": true,
    "Variance": true,
    "Prev. System Stock": true,
    "System Stock": true,
    "Physical Stock": true,
  };

  const filterOptions = useSelector(selectFilterOptions);
  // RM: only Item Name filter, no variance/category columns, no CSV import/export yet
  const isRm = useSelector(selectOutletStockType) === "RM";
  const visibleFilterFields = useMemo(
    () => (isRm ? filterFields.filter((field) => field !== "varianceName") : filterFields),
    [isRm]
  );
  const toggleableColumns = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(visibleColumns).filter(
          ([key]) => !(isRm && RM_HIDDEN_COLUMNS.includes(key))
        )
      ),
    [isRm, visibleColumns]
  );

  const isFetchingRef = useRef(false);
  const isInitializedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cascadeSourceLabel = useMemo(() => getCascadeSourceLabel(cascadeSourceKey), [cascadeSourceKey]);

  const debouncedSearchRef = useRef<
    Record<FilterField, DebouncedFunc<(searchTerm: string) => void> | null>
  >({
    category: null,
    subCategory: null,
    itemName: null,
    varianceName: null,
  });

  useEffect(() => {
    if (isInitializedRef.current) return;

    isInitializedRef.current = true;

    filterFields.forEach((field) => {
      debouncedSearchRef.current[field] = debounce(
        async (searchTerm: string) => {
          if (!searchTerm?.trim()) {
            dispatch(clearFilterSearch(field));

            await dispatch(
              fetchItems({
                params: {
                  [`${field}Page`]: 1,
                  [`${field}Limit`]: 50,
                  [`${field}Search`]: "",
                  include_filter_options: true,
                },
                field,
                append: false,
                skipCache: true,
              })
            );

            return;
          }

          dispatch(setFilterSearch({ field, searchFilter: searchTerm }));

          await dispatch(
            fetchItems({
              params: {
                [`${field}Page`]: 1,
                [`${field}Limit`]: 50,
                [`${field}Search`]: searchTerm,
                include_filter_options: true,
              },
              field,
              append: false,
              skipCache: true,
            })
          );
        },
        300
      );
    });

    return () => {
      filterFields.forEach((field) => {
        debouncedSearchRef.current[field]?.cancel();
      });
    };
  }, [dispatch]);

  const createScrollHandler = useCallback(
    (field: FilterField) => async () => {
      const fieldOptions = filterOptions[field];

      if (
        !fieldOptions?.hasMore ||
        isFetchingRef.current ||
        fieldOptions.loading
      ) {
        return;
      }

      isFetchingRef.current = true;

      try {
        const nextPage = (fieldOptions.page || 1) + 1;
        const searchTerm = fieldOptions.searchFilter || "";

        await dispatch(
          fetchItems({
            params: {
              [`${field}Page`]: nextPage,
              [`${field}Limit`]: 50,
              [`${field}Search`]: searchTerm,
              include_filter_options: true,
            },
            field,
            append: true,
            skipCache: true,
          })
        ).unwrap();
      } catch (err) {
        console.error(`Failed to load more ${field}:`, err);
      } finally {
        isFetchingRef.current = false;
      }
    },
    [dispatch, filterOptions]
  );

  const createSearchHandler = useCallback(
    (field: FilterField) => (searchTerm: string) => {
      debouncedSearchRef.current[field]?.(searchTerm);
    },
    []
  );

  const handleClearFilter = useCallback(
    (field: FilterField) => {
      debouncedSearchRef.current[field]?.cancel();
      dispatch(clearFilterSearch(field));
      onSearchChange(field, []);
    },
    [dispatch, onSearchChange]
  );

  const isAnyFilterActive = useMemo(
    () =>
      filterFields.some(
        (field) =>
          Array.isArray(searchParams[field]) && searchParams[field].length > 0
      ),
    [searchParams]
  );

  const handleClearAll = useCallback(() => {
    filterFields.forEach((field) => {
      debouncedSearchRef.current[field]?.cancel();
      dispatch(clearFilterSearch(field));
    });

    filterFields.forEach(field => {
      onSearchChange(field, []);
    });

    if (onCascadeReset) {
      onCascadeReset();
    }
  }, [dispatch, onBranchChange, onSearchChange, onCascadeReset]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        if (onImportFile) onImportFile(file);
      }
      e.target.value = "";
    },
    [onImportFile]
  );

  const handleToggleColumn = useCallback((key: string) => {
    dispatch(toggleColumn(key));
  }, [dispatch]);


  const mappedBranches = useMemo(() => {
    return branches.map((b) => ({
      label: b.aliasName || b.locationName || "Unknown",
      value: b.locationId,
    }));
  }, [branches]);

  const isUIBusy = busyType !== null || cascadeLoading;

  return (
    <div className="flex flex-col gap-3 p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
           <div className="w-[110px] shrink-0">
            <StockTypeSelect disabled={disabled || isUIBusy} />
          </div>
          <div className="w-[180px] shrink-0">
            <CollapsibleFilter
              title="Branch"
              options={mappedBranches}
              selectedOptions={selectedBranches}
              onChange={(value) => onBranchChange(Array.isArray(value) ? value : [value])}
              onClear={() => onBranchChange([])}
              inputType="single-select"
              disabled={disabled || isUIBusy}
              linked={false}
              showRemoveOption={false}
            />
          </div>

        {visibleFilterFields.map((field) => {
            const fieldValues = filterOptions[field]?.values || [];

            const mappedOptions = fieldValues.map((v) => ({
              label: v.name || v.id,
              value: v.id,
            }));

            return (
              <div key={field} className="w-[180px] shrink-0">
                <CollapsibleFilter
                  title={getFilterTitle(field)}
                  options={mappedOptions}
                  selectedOptions={searchParams[field] || []}
                  onChange={(value) => onSearchChange(field, value)}
                  onClear={() => handleClearFilter(field)}
                  onScrollBottom={createScrollHandler(field)}
                  onSearch={createSearchHandler(field)}
                  inputType="multi-select"
                  searchValue={filterOptions[field]?.searchFilter || ""}
                  disabled={disabled || isUIBusy || (cascadeLoading && cascadeSourceKey !== field)}
                  loading={filterOptions[field]?.loading || false}
                  statusLabel={
                    cascadeLoading && cascadeSourceKey !== field
                      ? `Waiting for ${cascadeSourceLabel}...`
                      : filterOptions[field]?.loading
                        ? `Loading ${getFilterTitle(field)}...`
                        : undefined
                  }
                  linked={true}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
         {!isRm && (
            <>
              <ActionBtn onClick={handleDownloadSampleCSV} disabled={disabled || isUIBusy} tooltip="Download sample CSV template">
                <SampleIcon />
              </ActionBtn>
              <ActionBtn onClick={() => fileInputRef.current?.click()} disabled={disabled || isUIBusy} tooltip="Import Physical Stocks (CSV)">
                <ImportIcon />
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".csv"
                  onChange={handleFileChange}
                />
              </ActionBtn>
              <ActionBtn onClick={handleDownloadCSV} disabled={disabled || isUIBusy} tooltip="Export Data (CSV)">
                <ExportIcon />
              </ActionBtn>
            </>
          )}
          <ActionBtn onClick={handleClearAll} disabled={disabled || isUIBusy || (!isAnyFilterActive && !selectedBranches)} danger tooltip="Clear all filters">
            <ClearIcon />
          </ActionBtn>
          {onRefresh && (
            <ActionBtn onClick={onRefresh} disabled={disabled || isUIBusy} tooltip="Refresh Data">
              <RefreshIcon />
            </ActionBtn>
          )}
<ColumnToggle visibleColumns={toggleableColumns} onToggle={handleToggleColumn} disabled={disabled || isUIBusy} />        </div>
      </div>

      {cascadeLoading && cascadeSourceLabel && (
        <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg animate-pulse">
          <svg className="w-4 h-4 text-brand-600 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          <span className="text-[12px] font-semibold text-brand-700">Updating dependent filters based on {cascadeSourceLabel}...</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(FilterBar);