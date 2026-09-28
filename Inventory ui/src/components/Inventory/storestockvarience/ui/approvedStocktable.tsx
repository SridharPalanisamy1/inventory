"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useDispatch, useSelector } from "react-redux";

import { AppDispatch, RootState } from "@/redux/store";

import {
  fetchApprovedItems,
  resetApprovedItems,
  setSnackbarMessage,
  setOpenSnackbar,
  ApprovedStockItem,
} from "@/features/yen_inventory/wharehoueStoreSlice";

import DotLoaderLike from "@/components/Loaders/DotLoaderWrapper";
import { Tooltip } from "@/components/ui/Tooltip";
import { Spinner } from "@/components/ui/Spinner";

interface ApprovedStockTableProps {
  isFullScreen?: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}

interface ActiveFilters {
  status: string;
  itemName: string;
  approvedBy: string;
  fromDate: string;
  toDate: string;
}

const DEFAULT_FILTERS: ActiveFilters = {
  status: "approved",
  itemName: "",
  approvedBy: "",
  fromDate: "",
  toDate: "",
};

type HeaderType = "text" | "number" | "center";

interface TableHeader {
  key: string;
  label: string;
  type: HeaderType;
  columnClass: string;
}

const HEADERS: TableHeader[] = [
  {
    key: "serialNumber",
    label: "S.No",
    type: "center",
    columnClass: "approved-col-serial",
  },
  {
    key: "itemName",
    label: "Item Name",
    type: "text",
    columnClass: "approved-col-item",
  },
  {
    key: "locationName",
    label: "Location ID",
    type: "text",
    columnClass: "approved-col-location",
  },
  {
    key: "date",
    label: "Approved At",
    type: "text",
    columnClass: "approved-col-date",
  },
  {
    key: "approvedBy",
    label: "Approved By",
    type: "text",
    columnClass: "approved-col-user",
  },
  {
    key: "currentSystem",
    label: "System Before",
    type: "number",
    columnClass: "approved-col-number",
  },
  {
    key: "physicalClosing",
    label: "Physical Closing",
    type: "number",
    columnClass: "approved-col-number",
  },
  {
    key: "actualVariance",
    label: "Actual Variance",
    type: "number",
    columnClass: "approved-col-number",
  },
  {
    key: "updatedCurrentSystem",
    label: "System After",
    type: "number",
    columnClass: "approved-col-number",
  },
  {
    key: "description",
    label: "Description",
    type: "text",
    columnClass: "approved-col-description",
  },
];

const ITEMS_PER_PAGE = 30;

const formatText = (value: unknown): string => {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  return String(value);
};

const formatNumber = (value: unknown): string => {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

return new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
}).format(number);
};

const ApprovedStockTable: React.FC<ApprovedStockTableProps> = ({
  isFullScreen = false,
  scrollContainerRef,
}) => {
  const dispatch = useDispatch<AppDispatch>();

  const {
    approvedItems,
    approvedItemsTotal,
    approvedItemsStatus,
    approvedItemsError,
    isLoadingMore,
  } = useSelector((state: RootState) => state.purchaseItems);

  const isFetchingRef = useRef(false);
  const autoLoadTriggerRef = useRef(0);

  /* ---------------------------------------------
     Draft filter values
  --------------------------------------------- */

  const [filterItemName, setFilterItemName] = useState("");
  const [filterApprovedBy, setFilterApprovedBy] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  const [activeFilters, setActiveFilters] =
    useState<ActiveFilters>(DEFAULT_FILTERS);

  const [filtersVisible, setFiltersVisible] = useState(true);

  const activeFiltersRef = useRef(activeFilters);

  activeFiltersRef.current = activeFilters;

  /* ---------------------------------------------
     Fetch records
  --------------------------------------------- */

  const loadApprovedItems = useCallback(
    async (page: number) => {
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;

      try {
        const filters = activeFiltersRef.current;

        await dispatch(
          fetchApprovedItems({
            page,
            limit: ITEMS_PER_PAGE,

            status: filters.status || undefined,
            itemName: filters.itemName || undefined,
            approvedBy: filters.approvedBy || undefined,
            fromDate: filters.fromDate || undefined,
            toDate: filters.toDate || undefined,
          })
        ).unwrap();
      } catch (error) {
        console.error("Error fetching approved items:", error);

        dispatch(
          setSnackbarMessage("Unable to load approved stock records.")
        );

        dispatch(setOpenSnackbar(true));
      } finally {
        isFetchingRef.current = false;
      }
    },
    [dispatch]
  );

  /* ---------------------------------------------
     Reload when actual filters change
  --------------------------------------------- */

  useEffect(() => {
    dispatch(resetApprovedItems());

    const timer = window.setTimeout(() => {
      loadApprovedItems(1);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dispatch, loadApprovedItems, activeFilters]);

  /* ---------------------------------------------
     Infinite scroll
  --------------------------------------------- */

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;

      if (element.scrollHeight <= element.clientHeight) {
        return;
      }

      const distanceFromBottom =
        element.scrollHeight -
        element.scrollTop -
        element.clientHeight;

      const isNearBottom = distanceFromBottom <= 160;

      const canLoadMore =
        approvedItemsStatus !== "loading" &&
        !isLoadingMore &&
        !isFetchingRef.current &&
        approvedItems.length < approvedItemsTotal;

      if (!isNearBottom || !canLoadMore) {
        return;
      }

      const nextPage =
        Math.floor(approvedItems.length / ITEMS_PER_PAGE) + 1;

      loadApprovedItems(nextPage);
    },
    [
      approvedItemsStatus,
      isLoadingMore,
      approvedItems.length,
      approvedItemsTotal,
      loadApprovedItems,
    ]
  );

  /* ---------------------------------------------
     Auto-load if first 30 rows don't fill table
  --------------------------------------------- */

  useEffect(() => {
    if (
      approvedItemsStatus === "loading" &&
      approvedItems.length === 0
    ) {
      return;
    }

    if (approvedItems.length === 0) return;

    const container = scrollContainerRef.current;

    if (!container) return;

    const hasMore =
      approvedItems.length < approvedItemsTotal;

    const notLoading =
      approvedItemsStatus !== "loading" &&
      !isLoadingMore &&
      !isFetchingRef.current;

    const hasNoVerticalOverflow =
      container.scrollHeight - container.clientHeight <= 2;

    if (!hasNoVerticalOverflow || !hasMore || !notLoading) {
      return;
    }

    const nextPage =
      Math.floor(approvedItems.length / ITEMS_PER_PAGE) + 1;

    if (autoLoadTriggerRef.current === nextPage) {
      return;
    }

    autoLoadTriggerRef.current = nextPage;

    loadApprovedItems(nextPage);
  }, [
    approvedItems.length,
    approvedItemsTotal,
    approvedItemsStatus,
    isLoadingMore,
    loadApprovedItems,
    scrollContainerRef,
  ]);

  /* ---------------------------------------------
     Status
  --------------------------------------------- */

  const isPending =
    activeFilters.status === "pendingapproval";

  const handleStatusToggle = useCallback(
    (status: string) => {
      autoLoadTriggerRef.current = 0;

      /*
       * approvedBy doesn't apply to pending rows.
       * Remove hidden approvedBy filter when switching.
       */
      if (status === "pendingapproval") {
        setFilterApprovedBy("");

        setActiveFilters((previous) => ({
          ...previous,
          status,
          approvedBy: "",
        }));

        return;
      }

      setActiveFilters((previous) => ({
        ...previous,
        status,
      }));
    },
    []
  );

  /* ---------------------------------------------
     Filters
  --------------------------------------------- */

  const applyFilters = useCallback(() => {
    setActiveFilters((previous) => ({
      ...previous,
      itemName: filterItemName.trim(),
      approvedBy: isPending
        ? ""
        : filterApprovedBy.trim(),
      fromDate: filterFromDate,
      toDate: filterToDate,
    }));

    autoLoadTriggerRef.current = 0;
  }, [
    filterItemName,
    filterApprovedBy,
    filterFromDate,
    filterToDate,
    isPending,
  ]);

  const clearFilters = useCallback(() => {
    setFilterItemName("");
    setFilterApprovedBy("");
    setFilterFromDate("");
    setFilterToDate("");

    setActiveFilters(DEFAULT_FILTERS);

    autoLoadTriggerRef.current = 0;
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      activeFilters.status !== "approved" ||
      Boolean(activeFilters.itemName) ||
      Boolean(activeFilters.approvedBy) ||
      Boolean(activeFilters.fromDate) ||
      Boolean(activeFilters.toDate)
    );
  }, [activeFilters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (activeFilters.status !== "approved") count++;
    if (activeFilters.itemName) count++;
    if (activeFilters.approvedBy) count++;
    if (activeFilters.fromDate) count++;
    if (activeFilters.toDate) count++;

    return count;
  }, [activeFilters]);

  /* ---------------------------------------------
     Display rows
  --------------------------------------------- */

  type DisplayedApprovedItem = ApprovedStockItem & {
    serialNumber: number;
    locationName: string;
    date: string;
    currentSystem: number;
    updatedCurrentSystem: number;
  };

  const displayedItems = useMemo<DisplayedApprovedItem[]>(
    () =>
      approvedItems.map((item, index) => ({
        ...item,

        serialNumber: index + 1,
        locationName: item.locationId,
        date: item.approvedAt,

        currentSystem: item.systemStockBefore,
        updatedCurrentSystem: item.systemStockAfter,
      })),
    [approvedItems]
  );

  const isInitialLoading =
    approvedItemsStatus === "loading" &&
    approvedItems.length === 0;

  /* ---------------------------------------------
     Table cell renderer
  --------------------------------------------- */

  const renderCell = (
    item: DisplayedApprovedItem,
    header: TableHeader
  ) => {
    const value = (
      item as unknown as Record<string, unknown>
    )[header.key];

    if (header.key === "serialNumber") {
      return (
        <span className="approved-cell approved-cell--serial">
          {formatText(value)}
        </span>
      );
    }

    if (header.type === "number") {
      const number = Number(value);

      const isNegative =
        Number.isFinite(number) && number < 0;

      const isVariance =
        header.key === "actualVariance";

      const varianceClass = isVariance
        ? isNegative
          ? "approved-cell--negative"
          : "approved-cell--positive"
        : "";

      return (
        <Tooltip
          content={formatNumber(value)}
          side="top"
        >
          <span
            className={`approved-cell approved-cell--number ${varianceClass}`}
          >
            {formatNumber(value)}
          </span>
        </Tooltip>
      );
    }

    const important =
      header.key === "itemName" ||
      header.key === "locationName";

    return (
      <Tooltip
        content={formatText(value)}
        side="top"
      >
        <span
          className={`approved-cell approved-cell--text ${
            important
              ? "approved-cell--important"
              : ""
          }`}
        >
          {formatText(value)}
        </span>
      </Tooltip>
    );
  };

  return (
    <section
      className={`approved-stock-card ${
        isFullScreen
          ? "approved-stock-card--fullscreen"
          : ""
      }`}
    >
      {/* ==========================================
          Toolbar
      ========================================== */}

      <div className="approved-toolbar">
        <div className="approved-toolbar__top">
          <div className="approved-toolbar__left">
            {/* Status tabs */}

            <div
              className="approved-status-tabs"
              role="group"
              aria-label="Stock approval status"
            >
              <button
                type="button"
                onClick={() =>
                  handleStatusToggle("approved")
                }
                className={`approved-status-tab ${
                  !isPending
                    ? "approved-status-tab--approved"
                    : ""
                }`}
                aria-pressed={!isPending}
              >
                <span className="approved-status-dot approved-status-dot--approved" />

                Approved
              </button>

              <button
                type="button"
                onClick={() =>
                  handleStatusToggle(
                    "pendingapproval"
                  )
                }
                className={`approved-status-tab ${
                  isPending
                    ? "approved-status-tab--pending"
                    : ""
                }`}
                aria-pressed={isPending}
              >
                <span className="approved-status-dot approved-status-dot--pending" />

                Pending
              </button>
            </div>

            {/* Filters toggle */}

            <button
              type="button"
              className={`approved-filter-toggle ${
                filtersVisible
                  ? "approved-filter-toggle--active"
                  : ""
              }`}
              onClick={() =>
                setFiltersVisible(
                  (previous) => !previous
                )
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 5h18" />
                <path d="M6 12h12" />
                <path d="M10 19h4" />
              </svg>

              <span>Filters</span>

              {activeFilterCount > 0 && (
                <span className="approved-filter-count">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div className="approved-toolbar__right">
            <span className="approved-record-summary">
              <strong>{approvedItemsTotal}</strong>
              {isPending
                ? " pending records"
                : " approved records"}
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="approved-clear-button"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ========================================
            Filter fields
        ======================================== */}

        {filtersVisible && (
          <div className="approved-filters">
            <div className="approved-filter-field approved-filter-field--item">
              <label
                htmlFor="approved-filter-item"
                className="approved-filter-label"
              >
                Item Name
              </label>

              <div className="approved-input-wrapper">
                <svg
                  className="approved-input-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>

                <input
                  id="approved-filter-item"
                  type="text"
                  placeholder="Search item name"
                  value={filterItemName}
                  onChange={(event) =>
                    setFilterItemName(
                      event.target.value
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyFilters();
                    }
                  }}
                  className="approved-filter-input approved-filter-input--icon"
                />
              </div>
            </div>

            {!isPending && (
              <div className="approved-filter-field approved-filter-field--user">
                <label
                  htmlFor="approved-filter-user"
                  className="approved-filter-label"
                >
                  Approved By
                </label>

                <input
                  id="approved-filter-user"
                  type="text"
                  placeholder="Search employee"
                  value={filterApprovedBy}
                  onChange={(event) =>
                    setFilterApprovedBy(
                      event.target.value
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyFilters();
                    }
                  }}
                  className="approved-filter-input"
                />
              </div>
            )}

            <div className="approved-filter-field approved-filter-field--date">
              <label
                htmlFor="approved-filter-from"
                className="approved-filter-label"
              >
                From Date
              </label>

              <input
                id="approved-filter-from"
                type="date"
                value={filterFromDate}
                onChange={(event) =>
                  setFilterFromDate(
                    event.target.value
                  )
                }
                className="approved-filter-input"
              />
            </div>

            <div className="approved-filter-field approved-filter-field--date">
              <label
                htmlFor="approved-filter-to"
                className="approved-filter-label"
              >
                To Date
              </label>

              <input
                id="approved-filter-to"
                type="date"
                value={filterToDate}
                onChange={(event) =>
                  setFilterToDate(
                    event.target.value
                  )
                }
                className="approved-filter-input"
              />
            </div>

            <div className="approved-filter-actions">
              <button
                type="button"
                onClick={applyFilters}
                className="approved-apply-button"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>

                Apply
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="approved-reset-button"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ==========================================
          Table
      ========================================== */}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="approved-table-container"
      >
        <table className="approved-stock-table">
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th
                  key={header.key}
                  className={`
                    ${header.columnClass}
                    ${
                      header.type === "number"
                        ? "approved-table-align-right"
                        : header.type === "center"
                          ? "approved-table-align-center"
                          : "approved-table-align-left"
                    }
                  `}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Initial loading */}

            {isInitialLoading && (
              <tr>
                <td
                  colSpan={HEADERS.length}
                  className="approved-table-state"
                >
                  <DotLoaderLike message="" />

                  <p className="approved-table-state__message">
                    Loading stock records...
                  </p>
                </td>
              </tr>
            )}

            {/* Error */}

            {!isInitialLoading &&
              approvedItemsError && (
                <tr>
                  <td
                    colSpan={HEADERS.length}
                    className="approved-table-state"
                  >
                    <div className="approved-state-icon approved-state-icon--error">
                      !
                    </div>

                    <p className="approved-table-state__title">
                      Unable to load records
                    </p>

                    <p className="approved-table-state__message">
                      {approvedItemsError}
                    </p>
                  </td>
                </tr>
              )}

            {/* Empty */}

            {!isInitialLoading &&
              approvedItemsStatus !== "loading" &&
              approvedItems.length === 0 &&
              !approvedItemsError && (
                <tr>
                  <td
                    colSpan={HEADERS.length}
                    className="approved-table-state"
                  >
                    <div className="approved-state-icon">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <path d="m3.3 7 8.7 5 8.7-5" />
                        <path d="M12 22V12" />
                      </svg>
                    </div>

                    <p className="approved-table-state__title">
                      {isPending
                        ? "No pending records"
                        : "No approved records"}
                    </p>

                    <p className="approved-table-state__message">
                      {isPending
                        ? "Items waiting for approval will appear here."
                        : "Approved warehouse stock records will appear here."}
                    </p>
                  </td>
                </tr>
              )}

            {/* Rows */}

            {displayedItems.map(
              (item, index) => (
                <tr
                  key={
                    item.id ||
                    item.randomId ||
                    `approved-row-${index}`
                  }
                >
                  {HEADERS.map((header) => (
                    <td
                      key={header.key}
                      className={`
                        ${header.columnClass}
                        ${
                          header.type ===
                          "number"
                            ? "approved-table-align-right"
                            : header.type ===
                                "center"
                              ? "approved-table-align-center"
                              : "approved-table-align-left"
                        }
                      `}
                    >
                      {renderCell(item, header)}
                    </td>
                  ))}
                </tr>
              )
            )}

            {/* More loading */}

            {isLoadingMore && (
              <tr>
                <td
                  colSpan={HEADERS.length}
                  className="approved-table-loading-more"
                >
                  <div>
                    <Spinner size="sm" />

                    <span>
                      Loading more records...
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ==========================================
          Footer
      ========================================== */}

      <footer className="approved-table-footer">
        <div className="approved-table-footer__count">
          Showing
          <strong>{approvedItems.length}</strong>
          of
          <strong>{approvedItemsTotal}</strong>
          {isPending ? "pending" : "approved"}
          records
        </div>

        <div className="approved-table-footer__status">
          {approvedItems.length <
          approvedItemsTotal ? (
            <>
              <span className="approved-footer-dot approved-footer-dot--loading" />
              Scroll to load more
            </>
          ) : approvedItems.length > 0 ? (
            <>
              <span className="approved-footer-dot approved-footer-dot--success" />
              All records loaded
            </>
          ) : (
            <>
              <span className="approved-footer-dot" />
              No records
            </>
          )}
        </div>
      </footer>
    </section>
  );
};

export default React.memo(ApprovedStockTable);