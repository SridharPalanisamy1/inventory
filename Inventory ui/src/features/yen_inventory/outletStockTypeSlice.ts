import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/redux/store";

/**
 * Outlet stock type shared by the outlet inventory screens.
 *   FG -> finished goods  (existing flow, /outletinventory)
 *   RM -> raw materials   (/outletrminventory, Branch_wise_stock where itemType = "RM")
 */
export type OutletStockType = "FG" | "RM";

export const OUTLET_STOCK_TYPE_KEY = "globalOutletStockType";

/** RM has no variance (Category / Sub Category stay available from the column menu). */
export const RM_HIDDEN_COLUMNS = ["Variance"];

/** Reads the saved type. Safe on the server (returns FG). */
export const getOutletStockType = (): OutletStockType => {
  if (typeof window === "undefined") return "FG";
  try {
    return window.localStorage.getItem(OUTLET_STOCK_TYPE_KEY) === "RM" ? "RM" : "FG";
  } catch {
    return "FG";
  }
};

export const saveOutletStockType = (value: OutletStockType) => {
  try {
    window.localStorage.setItem(OUTLET_STOCK_TYPE_KEY, value);
  } catch {
    /* storage unavailable - selection still works for this session */
  }
};

/** API path segment for the outlet stock screens (read at request time). */
export const outletInventoryBase = (): string =>
  getOutletStockType() === "RM" ? "outletrminventory" : "outletinventory";
/** API path segment for the outlet variance / approval screens. */
export const outletVarianceBase = (): string =>
  getOutletStockType() === "RM" ? "outletrminventoryvariance" : "outletinventoryvariance";
interface OutletStockTypeState {
  stockType: OutletStockType;
  hydrated: boolean;
}

const initialState: OutletStockTypeState = { stockType: "FG", hydrated: false };

const outletStockTypeSlice = createSlice({
  name: "outletStockType",
  initialState,
  reducers: {
    hydrateOutletStockType(state) {
      state.stockType = getOutletStockType();
      state.hydrated = true;
    },
    setOutletStockType(state, action: PayloadAction<OutletStockType>) {
      state.stockType = action.payload;
      state.hydrated = true;
    },
  },
});

export const { hydrateOutletStockType, setOutletStockType } = outletStockTypeSlice.actions;

export const selectOutletStockType = (state: RootState): OutletStockType =>
  state.outletStockType.stockType;
export const selectOutletStockTypeHydrated = (state: RootState): boolean =>
  state.outletStockType.hydrated;

/** Hydrates from localStorage once (after mount) and returns the current type. */
export const useOutletStockType = () => {
  const dispatch = useDispatch();
  const stockType = useSelector(selectOutletStockType);
  const hydrated = useSelector(selectOutletStockTypeHydrated);

  useEffect(() => {
    if (!hydrated) dispatch(hydrateOutletStockType());
  }, [dispatch, hydrated]);

  return { stockType, hydrated };
};

export default outletStockTypeSlice.reducer;