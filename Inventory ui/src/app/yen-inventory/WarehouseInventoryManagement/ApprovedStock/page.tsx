"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { setIsFullScreen } from "../../../../features/yen_inventory/wharehoueStoreSlice";

import WarehouseInventoryManagementPage from "../page";
import ApprovedStockTable from "../../../../components/Inventory/storestockvarience/ui/approvedStocktable";

import { AppDispatch, RootState } from "@/redux/store";

const WarehouseApprovedStock: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const { isFullScreen, warehouses, searchParams } = useSelector(
    (state: RootState) => state.purchaseItems
  );

  const selectedWarehouseLabel = useMemo(() => {
    const warehouse = warehouses.find(
      (item) =>
        item.locationId === searchParams.locationName ||
        item.locationName === searchParams.locationName
    );

    return warehouse?.locationName || searchParams.locationName || "";
  }, [warehouses, searchParams.locationName]);

  const toggleFullScreen = useCallback(() => {
    dispatch(setIsFullScreen(!isFullScreen));
  }, [dispatch, isFullScreen]);

  return (
    <main
      className={`approved-page ${
        isFullScreen ? "approved-page--fullscreen" : ""
      }`}
    >
      {!isFullScreen && <WarehouseInventoryManagementPage />}

      {/* Page Header */}
      <header className="approved-page-header">
        <div className="approved-page-header__content">
          <div className="approved-page-header__icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>

          <div className="approved-page-header__text">
            <div className="approved-page-header__title-row">
              <h1 className="approved-page-header__title">
                Approved Stock Variance
              </h1>

              <span className="approved-page-header__status">
                Stock Review
              </span>
            </div>

            <p className="approved-page-header__subtitle">
              {selectedWarehouseLabel
                ? `Warehouse: ${selectedWarehouseLabel}`
                : "Select a warehouse to view stock variance records"}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="approved-page-header__fullscreen"
          onClick={toggleFullScreen}
          aria-label={
            isFullScreen ? "Exit full screen" : "Enter full screen"
          }
          title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
        >
          {isFullScreen ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          )}
        </button>
      </header>

      {/* Main Table Area */}
      <section className="approved-page-content">
        <ApprovedStockTable
          isFullScreen={isFullScreen}
          scrollContainerRef={scrollContainerRef}
        />
      </section>
    </main>
  );
};

export default React.memo(WarehouseApprovedStock);