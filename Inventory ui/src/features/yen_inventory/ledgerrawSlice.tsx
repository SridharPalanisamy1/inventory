import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import axios, { AxiosError } from "axios";
import { RootState } from "@/redux/store";
import { parseAxiosError } from "./wharehoueSlice";
import { API_BASE_URL } from "./OuletePhysicalStockSlice";

/* ======================================================
   🔹 MODELS
====================================================== */

// -------- Daily Stock Ledger --------
export interface StockLedgerTransaction {
  date: string;
  inStock: number;
  outStock: number;
  returnedStock: number;
  balanceStock: number;
  grnVendorName?: string;   // ✅ fixed casing
  dispatchBranch?: string;
  returnedToVendor?: string;
}

export interface StockLedgerItem {
  randomId: string;

  // ✅ UPDATED to match backend response
  itemDetails: {
    itemName: string;
    uom: string;
  };

  openingReference: { date: string; closingStock: number };
  transactions: StockLedgerTransaction[];
  closingSummary: { date: string; closingStock: number };
}

// 🔥 Keyed by randomId (NOT itemName)
export interface StockLedgerResponse {
  [randomId: string]: StockLedgerItem;
}

// -------- Purchase Item --------
export interface PurchaseItem {
  randomId: string;
  itemName: string;
}

export interface SelectedItem {
  randomId: string;
  itemName: string;
}

/* ======================================================
   🔹 STATE
====================================================== */

export interface StockSummaryState {
  stockLedger: StockLedgerResponse | null;
  loading: boolean;
  error: string | null;

  searchQuery: string;
  searchResults: PurchaseItem[];
  searchLoading: boolean;
  searchError: string | null;

  currentPage: number;
  hasMore: boolean;
  warehouses: Warehouse[];
  selectedWarehouse: string | null;
  warehousesLoading: boolean;

  allPurchaseItems: PurchaseItem[];
  allItemsLoading: boolean;
  allItemsError: string | null;

  selectedItems: SelectedItem[];

  exportLoading: boolean;
  exportError: string | null;
}

const initialState: StockSummaryState = {
  stockLedger: null,
  loading: false,
  error: null,

  searchQuery: "",
  searchResults: [],
  searchLoading: false,
  searchError: null,
  warehouses: [] as Warehouse[],
  selectedWarehouse: null,
  warehousesLoading: false,

  currentPage: 1,
  hasMore: false,

  allPurchaseItems: [],
  allItemsLoading: false,
  allItemsError: null,

  selectedItems: [],
  exportLoading: false,
  exportError: null,
};

export interface Warehouse {
  locationId: string;
  locationName: string;
  aliasName: string;
}

interface AxiosErrorPayload {
  message: string;
  status: number | null;
  raw?: unknown;
}

const toErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
};

/* ======================================================
   🔹 ASYNC THUNKS
====================================================== */

export const fetchWarehouses = createAsyncThunk<
  Warehouse[],
  { page?: number; limit?: number; search?: string },
  { rejectValue: AxiosErrorPayload }
>(
  "stockSummary/fetchWarehouses",
  async ({ page = 1, limit = 30, search }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", limit.toString());
      if (search) params.append("search", search);

      const response = await axios.get(
        `${API_BASE_URL}/warehouseinventory/warehouses`,
        { params, timeout: 15000 }
      );

      return response.data;
    } catch (e) {
      const err = e as AxiosError;
      if (err.code === "ECONNABORTED") {
        return rejectWithValue({ message: "Request timeout", status: 408 });
      }
      return rejectWithValue(parseAxiosError(err));
    }
  }
);

// 1️⃣ Fetch Daily Stock Ledger
export const fetchStockLedger = createAsyncThunk<
  StockLedgerResponse,
  { fromDate: string; toDate: string; itemRandomId?: string; locationName?: string },
  { rejectValue: string }
>(
  "stockSummary/fetchStockLedger",
  async (params, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/warehouseinventoryvariance/stock-ledger`,
        {
          params: {
            from_date: params.fromDate,
            to_date: params.toDate,
            itemRandomId: params.itemRandomId,
            locationName: params.locationName,
          },
        }
      );

      // ✅ Transform array to object
      const ledgerArray = Array.isArray(response.data)
        ? (response.data as StockLedgerItem[])
        : [];
      const ledgerObject: StockLedgerResponse = {};

      ledgerArray.forEach(item => {
        ledgerObject[item.randomId] = item;
      });

      return ledgerObject;
    } catch (error) {
      const err = error as AxiosError;
      return rejectWithValue(toErrorMessage(err.response?.data, "Failed to fetch stock ledger"));
    }
  }
);

// 2️⃣ Search Purchase Items
export const searchPurchaseItems = createAsyncThunk<
  { items: PurchaseItem[]; hasMore: boolean },
  { search?: string; page?: number; limit?: number },
  { state: RootState; rejectValue: string }
>("stockSummary/searchPurchaseItems", async (
  { search = "", page = 1, limit = 20 },
  { rejectWithValue }
) => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/warehouseinventoryvariance/items`,
      {
        params: {
          search: search.trim() || undefined,
          page,
          limit,
        },
      }
    );

    const items = Array.isArray(response.data) ? (response.data as PurchaseItem[]) : [];
    return {
      items,
      hasMore: items.length === limit,
    };
  } catch (error) {
    const err = error as AxiosError;
    return rejectWithValue(toErrorMessage(err.response?.data, "Failed to search items"));
  }
});

// 3️⃣ Fetch ALL Purchase Items
export const fetchAllPurchaseItems = createAsyncThunk<PurchaseItem[], void, { rejectValue: string }>(
  "stockSummary/fetchAllPurchaseItems",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/warehouseinventoryvariance/items`,
        {
          params: { search: "" },
        }
      );
      return Array.isArray(response.data) ? (response.data as PurchaseItem[]) : [];
    } catch (error) {
      const err = error as AxiosError;
      return rejectWithValue(toErrorMessage(err.response?.data, "Failed to fetch all items"));
    }
  }
);

// 4️⃣ Export Stock Ledger Excel
export const exportStockLedgerExcel = createAsyncThunk<
  void,
  { fromDate: string; toDate: string; itemRandomId: string; locationName?: string },
  { rejectValue: string }
>(
  "stockSummary/exportStockLedgerExcel",
  async (params, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/warehouseinventoryvariance/stock-ledger/excel`,
        {
          params: {
            from_date: params.fromDate,
            to_date: params.toDate,
            itemRandomId: params.itemRandomId,
            locationName: params.locationName,
          },
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `StockLedger_YenERP_${params.fromDate}_to_${params.toDate}.xlsx`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const err = error as AxiosError;
      return rejectWithValue(toErrorMessage(err.response?.data, "Failed to export Excel"));
    }
  }
);

/* ======================================================
   🔹 SLICE
====================================================== */

const stockSummarySlice = createSlice({
  name: "stockSummary",
  initialState,
  reducers: {
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setSelectedWarehouse: (state, action: PayloadAction<string | null>) => {
      state.selectedWarehouse = action.payload;
    },
    clearSelectedWarehouse: (state) => {
      state.selectedWarehouse = null;
    },
    clearSearchResults: (state) => {
      state.searchResults = [];
      state.currentPage = 1;
      state.hasMore = false;
    },
    clearStockLedger: (state) => {
      state.stockLedger = null;
      state.loading = false;
      state.error = null;
    },
    addSelectedItem: (state, action: PayloadAction<SelectedItem>) => {
      const exists = state.selectedItems.some(
        (i) => i.randomId === action.payload.randomId
      );
      if (!exists) state.selectedItems.push(action.payload);
    },
    removeSelectedItem: (state, action: PayloadAction<string>) => {
      state.selectedItems = state.selectedItems.filter(
        (i) => i.randomId !== action.payload
      );
    },
    clearSelectedItems: (state) => {
      state.selectedItems = [];
    },
    resetState: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWarehouses.pending, (state) => {
        state.warehousesLoading = true;
        state.error = null;
      })
      .addCase(fetchWarehouses.fulfilled, (state, action) => {
        state.warehousesLoading = false;
        state.warehouses = action.payload;
      })
      .addCase(fetchWarehouses.rejected, (state, action) => {
        state.warehousesLoading = false;
        state.warehouses = [];
        state.error = (action.payload as AxiosErrorPayload)?.message || "Failed";
      })

      .addCase(fetchStockLedger.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStockLedger.fulfilled, (state, action) => {
        state.stockLedger = action.payload;
        state.loading = false;
      })
      .addCase(fetchStockLedger.rejected, (state, action) => {
        state.loading = false;
        state.error = toErrorMessage(action.payload, "Failed to fetch stock ledger");
      })

      .addCase(searchPurchaseItems.pending, (state) => {
        state.searchLoading = true;
        state.searchError = null;
      })
      .addCase(searchPurchaseItems.fulfilled, (state, action) => {
        state.searchLoading = false;

        const newItems = action.payload.items;

        const requestedPage = action.meta.arg.page ?? 1;
        const mergedItems = requestedPage <= 1
          ? newItems
          : [...state.searchResults, ...newItems];

        const uniqueItems = Array.from(
          new Map(mergedItems.map(item => [item.randomId, item])).values()
        );

        state.searchResults = uniqueItems;
        state.hasMore = action.payload.hasMore;
        state.currentPage = requestedPage;
      })
      .addCase(searchPurchaseItems.rejected, (state, action) => {
        state.searchLoading = false;
        state.searchError = toErrorMessage(action.payload, "Failed to search items");
      })

      .addCase(exportStockLedgerExcel.pending, (state) => {
        state.exportLoading = true;
        state.exportError = null;
      })
      .addCase(exportStockLedgerExcel.fulfilled, (state) => {
        state.exportLoading = false;
      })
      .addCase(exportStockLedgerExcel.rejected, (state, action) => {
        state.exportLoading = false;
        state.exportError = toErrorMessage(action.payload, "Failed to export Excel");
      })

      .addCase(fetchAllPurchaseItems.pending, (state) => {
        state.allItemsLoading = true;
        state.allItemsError = null;
      })
      .addCase(fetchAllPurchaseItems.fulfilled, (state, action) => {
        state.allItemsLoading = false;
        state.allPurchaseItems = action.payload;
      })
      .addCase(fetchAllPurchaseItems.rejected, (state, action) => {
        state.allItemsLoading = false;
        state.allItemsError = toErrorMessage(action.payload, "Failed to fetch all items");
      });
  },
});

/* ======================================================
   🔹 SELECTORS
====================================================== */

export const selectStockLedger = (state: RootState) =>
  state.stockSummary.stockLedger;

export const selectStockLoading = (state: RootState) =>
  state.stockSummary.loading;

export const selectLedgerTransactions = (state: RootState) =>
  state.stockSummary.stockLedger || {};

export const selectOpeningReference = (state: RootState) =>
  state.stockSummary.stockLedger?.openingReference || null;

export const selectClosingSummary = (state: RootState) =>
  state.stockSummary.stockLedger?.closingSummary || null;

export const selectSearchResults = (state: RootState) =>
  state.stockSummary.searchResults;

export const selectWarehouses = (state: RootState) =>
  state.stockSummary.warehouses;

export const selectSelectedWarehouse = (state: RootState) =>
  state.stockSummary.selectedWarehouse;

export const selectAllPurchaseItems = (state: RootState) =>
  state.stockSummary.allPurchaseItems;

export const selectSearchLoading = (state: RootState) =>
  state.stockSummary.searchLoading;

export const selectSelectedItems = (state: RootState) =>
  state.stockSummary.selectedItems;

export const selectSearchQuery = (state: RootState) =>
  state.stockSummary.searchQuery;

/* ======================================================
   🔹 EXPORTS
====================================================== */

export const {
  setSearchQuery,
  clearSearchResults,
  clearStockLedger,
  addSelectedItem,
  removeSelectedItem,
  clearSelectedItems,
  resetState,
  setSelectedWarehouse,
  clearSelectedWarehouse,
} = stockSummarySlice.actions;

export default stockSummarySlice.reducer;
