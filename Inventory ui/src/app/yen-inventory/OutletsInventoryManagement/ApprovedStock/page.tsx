"use client";

import React, { useCallback, useMemo } from "react";
import { Tooltip } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import StockTypeSelect from "../../../../components/Inventory/shared/StockTypeSelect";
import { useOutletStockType } from "../../../../features/yen_inventory/outletStockTypeSlice";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";

import {
  selectSelectedLocation,
  selectIsFullScreen,
  setIsFullScreen,
  selectBranches,
} from "../../../../features/yen_inventory/OutletPhysicalVarianceSlice";

import OutletsInventoryManagementPage from "../page";

import { StockAdjustmentTable } from
  "../../../../components/Inventory/physcialstockvarience/ui/stockAdjustmentTable";

import { AppDispatch } from "@/redux/store";

const OutletApprovedStock: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  const isFullScreen = useSelector(selectIsFullScreen);
  const selectedLocation = useSelector(selectSelectedLocation);
  const branches = useSelector(selectBranches);

  const selectedBranchLabel = useMemo(() => {
    const branch = branches.find(
      (branch) =>
        branch.locationId === selectedLocation ||
        branch.locationName === selectedLocation ||
        branch.aliasName === selectedLocation
    );

    return (
      branch?.aliasName ||
      branch?.locationName ||
      selectedLocation ||
      ""
    );
  }, [branches, selectedLocation]);

  const toggleFullScreen = useCallback(() => {
    dispatch(setIsFullScreen(!isFullScreen));
  }, [dispatch, isFullScreen]);

  return (
    <div
      className={
        isFullScreen
          ? "approved-page approved-page--fullscreen"
          : "approved-page"
      }
    >
      {/* Main Outlet Navigation */}
      {!isFullScreen && <OutletsInventoryManagementPage />}

      {/* Approved Stock Header */}
      <header className="approved-page-header">

        {/* Left Side */}
        <div className="approved-page-header__content">

          <div className="approved-page-header__icon">
            <FactCheckOutlinedIcon />
          </div>

          <div className="approved-page-header__text">

            <div className="approved-page-header__title-row">

              <h1 className="approved-page-header__title">
                Approved Stock Variance
              </h1>

              <span className="approved-page-header__status">
                Approved
              </span>

            </div>

            <p className="approved-page-header__subtitle">
              {selectedBranchLabel
                ? `Outlet: ${selectedBranchLabel}`
                : "No outlet selected"}
            </p>

          </div>
        </div>

        {/* Right Side */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 110 }}>
          <StockTypeSelect />
        </div>
        <Tooltip
          title={
            isFullScreen
              ? "Exit Full Screen"
              : "Full Screen"
          }
          arrow
        >
          <button
            type="button"
            onClick={toggleFullScreen}
            className="approved-page-header__fullscreen"
            aria-label={
              isFullScreen
                ? "Exit Full Screen"
                : "Full Screen"
            }
          >
            {isFullScreen ? (
              <FullscreenExitIcon />
            ) : (
              <FullscreenIcon />
            )}
          </button>
        </Tooltip>
 </div>
      </header>

      {/* Main Content */}
      <main className="approved-page-content">
        <StockAdjustmentTable
          isFullScreen={isFullScreen}
        />
      </main>

    </div>
  );
};

// FG / RM: remount the whole screen when the type changes so every effect starts clean
const OutletApprovedStockByType: React.FC = () => {
  const { stockType, hydrated } = useOutletStockType();
  if (!hydrated) return null;
  return <OutletApprovedStock key={stockType} />;
};

export default OutletApprovedStockByType;