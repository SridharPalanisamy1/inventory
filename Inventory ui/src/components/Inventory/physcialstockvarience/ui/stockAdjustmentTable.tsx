"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { useDispatch, useSelector } from "react-redux";

import { AppDispatch } from "@/redux/store";

import {
  fetchApprovedItems,
  selectApprovedItems,
  selectApprovedItemsLoading,
  selectApprovedItemsError,
  selectApprovedItemsTotal,
  selectApprovedItemsPage,
  selectApprovedItemsLimit,
  selectApprovedItemsHasMore,
  selectApprovedItemsIsLoadingMore,
  resetApprovedItemsPagination,
  setOpenSnackbar,
  setSnackbarMessage,
  ApprovedItem,
} from "@/features/yen_inventory/OutletPhysicalVarianceSlice";

import DotLoaderLike from "@/components/Loaders/DotLoaderWrapper";
import { Tooltip } from "@/components/ui/Tooltip";
import { Spinner } from "@/components/ui/Spinner";

interface StockAdjustmentTableProps {
  isFullScreen?: boolean;
}

/* =========================================================
   TABLE COLUMN CONFIGURATION
   ========================================================= */

const HEADERS = [
  {
    key: "serialNumber",
    label: "S.No",
    type: "center",
    widthClass: "approved-col-serial",
  },

  {
    key: "itemCode",
    label: "Item Code",
    type: "text",
    widthClass: "approved-col-location",
  },

  {
    key: "itemName",
    label: "Item Name",
    type: "text",
    widthClass: "approved-col-item",
  },

  {
    key: "locationId",
    label: "Location ID",
    type: "text",
    widthClass: "approved-col-location",
  },

  {
    key: "approvedAt",
    label: "Approved At",
    type: "text",
    widthClass: "approved-col-date",
  },

  {
    key: "approvedBy",
    label: "Approved By",
    type: "text",
    widthClass: "approved-col-user",
  },

  {
    key: "systemStockBefore",
    label: "System Before",
    type: "number",
    widthClass: "approved-col-number",
  },

  {
    key: "physicalClosing",
    label: "Physical",
    type: "number",
    widthClass: "approved-col-number",
  },

  {
    key: "actualVariance",
    label: "Variance",
    type: "number",
    widthClass: "approved-col-number",
  },

  {
    key: "systemStockAfter",
    label: "System After",
    type: "number",
    widthClass: "approved-col-number",
  },

  {
    key: "description",
    label: "Description",
    type: "text",
    widthClass: "approved-col-description",
  },
] as const;

/* =========================================================
   FORMAT HELPERS
   ========================================================= */

const formatValue = (value: unknown) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "-";
  }

  return String(value);
};

const formatNumber = (value: unknown) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
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

/* =========================================================
   COMPONENT
   ========================================================= */

export const StockAdjustmentTable: React.FC<
  StockAdjustmentTableProps
> = ({ isFullScreen = false }) => {

  const dispatch = useDispatch<AppDispatch>();

  /* =======================================================
     REDUX DATA
     ======================================================= */

  const approvedItems =
    useSelector(selectApprovedItems);

  const approvedItemsLoading =
    useSelector(selectApprovedItemsLoading);

  const approvedItemsError =
    useSelector(selectApprovedItemsError);

  const approvedItemsTotal =
    useSelector(selectApprovedItemsTotal);

  const approvedItemsPage =
    useSelector(selectApprovedItemsPage);

  const approvedItemsLimit =
    useSelector(selectApprovedItemsLimit);

  const approvedItemsHasMore =
    useSelector(selectApprovedItemsHasMore);

  const approvedItemsIsLoadingMore =
    useSelector(selectApprovedItemsIsLoadingMore);

  const isFetchingRef = useRef(false);

  /* =======================================================
     FETCH APPROVED DATA
     ======================================================= */

  const loadApprovedItems = useCallback(
    async (
      page: number,
      isLoadMore = false
    ) => {

      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;

      try {

        if (!isLoadMore) {
          dispatch(resetApprovedItemsPagination());
        }

        await dispatch(
          fetchApprovedItems({
            page,
            limit: approvedItemsLimit,
            isLoadMore,
          })
        ).unwrap();

      } catch (error) {

        console.error(
          "Error fetching approved items:",
          error
        );

        dispatch(
          setSnackbarMessage(
            "Error fetching approved items."
          )
        );

        dispatch(setOpenSnackbar(true));

      } finally {

        isFetchingRef.current = false;

      }

    },
    [
      dispatch,
      approvedItemsLimit,
    ]
  );

  /* =======================================================
     INITIAL LOAD
     ======================================================= */

  useEffect(() => {
    loadApprovedItems(1, false);
  }, [loadApprovedItems]);

  /* =======================================================
     LOAD NEXT PAGE
     ======================================================= */

  const loadMoreApprovedItems =
    useCallback(async () => {

      if (
        approvedItemsIsLoadingMore ||
        !approvedItemsHasMore ||
        isFetchingRef.current
      ) {
        return;
      }

      await loadApprovedItems(
        approvedItemsPage + 1,
        true
      );

    }, [
      approvedItemsIsLoadingMore,
      approvedItemsHasMore,
      approvedItemsPage,
      loadApprovedItems,
    ]);

  /* =======================================================
     INFINITE SCROLL
     ======================================================= */

  const handleScroll = useCallback(
    (
      event: React.UIEvent<HTMLDivElement>
    ) => {

      const {
        scrollTop,
        scrollHeight,
        clientHeight,
      } = event.currentTarget;

      const distanceFromBottom =
        scrollHeight -
        scrollTop -
        clientHeight;

      if (
        distanceFromBottom <= 120 &&
        !approvedItemsLoading &&
        !approvedItemsIsLoadingMore &&
        approvedItemsHasMore
      ) {
        loadMoreApprovedItems();
      }

    },
    [
      approvedItemsLoading,
      approvedItemsIsLoadingMore,
      approvedItemsHasMore,
      loadMoreApprovedItems,
    ]
  );

  /* =======================================================
     DISPLAY DATA
     ======================================================= */

  type DisplayedApprovedItem =
    ApprovedItem & {
      serialNumber: number;
    };

  const displayedItems =
    useMemo<DisplayedApprovedItem[]>(
      () =>
        approvedItems.map(
          (item, index) => ({
            ...item,
            serialNumber: index + 1,
          })
        ),
      [approvedItems]
    );

  const isInitialLoading =
    approvedItemsLoading &&
    approvedItems.length === 0;

  /* =======================================================
     ALIGNMENT
     ======================================================= */

  const getAlignmentClass = (
    type: (typeof HEADERS)[number]["type"]
  ) => {

    if (type === "center") {
      return "approved-table-align-center";
    }

    if (type === "number") {
      return "approved-table-align-right";
    }

    return "approved-table-align-left";
  };

  /* =======================================================
     CELL RENDERING
     ======================================================= */

  const renderCell = (
    item: DisplayedApprovedItem,
    header: (typeof HEADERS)[number]
  ) => {

    const value =
      item[
        header.key as keyof DisplayedApprovedItem
      ];

    /* -------------------------
       Serial Number
       ------------------------- */

    if (header.key === "serialNumber") {
      return (
        <span className="approved-cell approved-cell--serial">
          {value}
        </span>
      );
    }

    /* -------------------------
       Numeric Values
       ------------------------- */

    if (header.type === "number") {

      const numberValue = Number(value);

      const isNegative =
        Number.isFinite(numberValue) &&
        numberValue < 0;

      const isVariance =
        header.key === "actualVariance";

      let varianceClass = "";

      if (isVariance) {
        varianceClass = isNegative
          ? "approved-cell--negative"
          : "approved-cell--positive";
      }

      return (
        <Tooltip
          content={formatNumber(value)}
          side="top"
        >
          <span
            className={[
              "approved-cell",
              "approved-cell--number",
              varianceClass,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {formatNumber(value)}
          </span>
        </Tooltip>
      );
    }

    /* -------------------------
       Important Text
       ------------------------- */

    const isImportant =
      header.key === "itemCode" ||
      header.key === "itemName";

    return (
      <Tooltip
        content={formatValue(value)}
        side="top"
      >
        <span
          className={
            isImportant
              ? "approved-cell approved-cell--important"
              : "approved-cell approved-cell--text"
          }
        >
          {formatValue(value)}
        </span>
      </Tooltip>
    );
  };

  /* =======================================================
     UI
     ======================================================= */

  return (
    <section
      className={
        isFullScreen
          ? "approved-stock-card approved-stock-card--fullscreen"
          : "approved-stock-card"
      }
    >

      {/* ===================================================
          TABLE CONTAINER
          =================================================== */}

      <div
        className="approved-table-container"
        onScroll={handleScroll}
      >

        <table className="approved-stock-table">

          {/* Column Widths */}
          <colgroup>
            {HEADERS.map((header) => (
              <col
                key={header.key}
                className={header.widthClass}
              />
            ))}
          </colgroup>

          {/* =================================================
              HEADER
              ================================================= */}

          <thead>
            <tr>

              {HEADERS.map((header) => (

                <th
                  key={header.key}
                  className={[
                    header.widthClass,
                    getAlignmentClass(
                      header.type
                    ),
                  ].join(" ")}
                >
                  {header.label}
                </th>

              ))}

            </tr>
          </thead>

          {/* =================================================
              BODY
              ================================================= */}

          <tbody>

            {/* Initial Loading */}

            {isInitialLoading && (
              <tr>
                <td
                  colSpan={HEADERS.length}
                  className="approved-table-state"
                >
                  <DotLoaderLike
                    message="Loading approved stock data..."
                  />
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
                      Unable to load approved records
                    </p>

                    <p className="approved-table-state__message">
                      {approvedItemsError}
                    </p>

                  </td>
                </tr>
              )}

            {/* Empty Data */}

            {!approvedItemsLoading &&
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
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >

                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />

                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />

                        <line
                          x1="12"
                          y1="22.08"
                          x2="12"
                          y2="12"
                        />

                      </svg>

                    </div>

                    <p className="approved-table-state__title">
                      No adjustment records found
                    </p>

                    <p className="approved-table-state__message">
                      Approved stock variance records
                      will appear here after approval.
                    </p>

                  </td>

                </tr>
              )}

            {/* =================================================
                DATA ROWS
                ================================================= */}

            {displayedItems.map((item) => (

              <tr
                key={
                  item._id ||
                  `${item.itemCode}-${item.serialNumber}`
                }
              >

                {HEADERS.map((header) => (

                  <td
                    key={header.key}
                    className={[
                      header.widthClass,
                      getAlignmentClass(
                        header.type
                      ),
                    ].join(" ")}
                  >

                    {renderCell(
                      item,
                      header
                    )}

                  </td>

                ))}

              </tr>

            ))}

            {/* Loading Next Page */}

            {approvedItemsIsLoadingMore && (
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

      {/* =====================================================
          FOOTER
          ===================================================== */}

      <footer className="approved-table-footer">

        <div className="approved-table-footer__count">

          <span>
            Showing
          </span>

          <strong>
            {approvedItems.length}
          </strong>

          <span>
            of
          </span>

          <strong>
            {approvedItemsTotal}
          </strong>

          <span>
            items
          </span>

        </div>

        <div className="approved-table-footer__status">

          <span
            className={
              approvedItemsIsLoadingMore
                ? "approved-footer-dot approved-footer-dot--loading"
                : !approvedItemsHasMore &&
                    approvedItems.length > 0
                ? "approved-footer-dot approved-footer-dot--success"
                : "approved-footer-dot"
            }
          />

          <span>
            {approvedItemsIsLoadingMore
              ? "Loading more records..."
              : approvedItemsHasMore
              ? "Scroll down to load more records"
              : approvedItems.length > 0
              ? "All approved records loaded"
              : "No records loaded"}
          </span>

        </div>

      </footer>

    </section>
  );
};