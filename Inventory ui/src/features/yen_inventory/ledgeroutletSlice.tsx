import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import axios, { AxiosError } from "axios";
import { RootState } from "@/redux/store";
import { parseAxiosError } from "./OuletePhysicalStockSlice";
import { API_BASE_URL } from "./OuletePhysicalStockSlice";



/* ================= MODELS ================== */

export interface StockLedgerTransaction {
  date: string;
  openingStock: number;
  dispatchQty: number;
  salesQty: number;
  salesReturnQty: number;
  stockTransferInQty: number;
  stockTransferOutQty: number;
  wastageReceivedQty: number;
  wastageReturnQty: number;
  closingStock: number;

}

export interface StockLedgerResponse {
  varianceName: string;
  itemCode: string;
  uom: string;
  openingBalance: number;
  closingBalance: number;
  openingDate: string;

  transactions: StockLedgerTransaction[];
}

export interface PurchaseItem {
  itemCode: string;
  varianceName: string;
}

/* ================= STATE ================== */

export interface stockSummaryOutletState {
  stockLedgers: StockLedgerResponse[];
  loading: boolean;
  error: string | null;


  searchQuery: string;
  searchResults: PurchaseItem[];
  searchLoading: boolean;
  searchError: string | null;

  currentPage: number;
  hasMore: boolean;

  allPurchaseItems: PurchaseItem[];
  allItemsLoading: boolean;
  allItemsError: string | null;

  selectedItems: string[];

  exportLoading: boolean;
  exportError: string | null;
  branches: Branch[];
  branchSearchQuery: string;
  branchSearchResults: Branch[];
  branchSearchLoading: boolean;
  branchSelected: string[] // branchId array
  branchCurrentPage: number;
  branchHasMore: boolean;
}

const initialState: stockSummaryOutletState = {
  stockLedgers: [],
  loading: false,
  error: null,
  branches: [],

  searchQuery: "",
  searchResults: [],
  searchLoading: false,
  searchError: null,

  currentPage: 1,
  hasMore: false,

  allPurchaseItems: [],
  allItemsLoading: false,
  allItemsError: null,

  selectedItems: [],

  exportLoading: false,
  exportError: null,
  branchSearchQuery: "",
  branchSearchResults: [],
  branchSearchLoading: false,
  branchSelected: [],
  branchCurrentPage: 1,
  branchHasMore: false,
};

/* ================= ASYNC THUNKS ================== */
type AxiosErrorPayload = {
  message: string;
  status: number | null;
  raw?: unknown;
};


export interface Branch {
  locationId: string;
  locationName: string;
  aliasName: string;
}

interface BranchResponse {
  locationId: string;
  locationName: string;
  aliasName: string;
}


export const fetchBranches = createAsyncThunk<
  Branch[],
  { search?: string, page: number; limit: number },
  { rejectValue: AxiosErrorPayload }
>(
  "data/fetchBranches",
  async ({ page, limit }, { rejectWithValue }) => {
    try {
      const response = await axios.get<BranchResponse[]>(
        `${API_BASE_URL}/outletinventory/locations?page=${page}&limit=${limit}`
      );

      return response.data.map(({ locationId, locationName, aliasName }) => ({
        locationId,
        locationName,
        aliasName,
      }));
    } catch (error) {
      return rejectWithValue(parseAxiosError(error as AxiosError));
    }
  }
);
export const searchBranches = createAsyncThunk<
  { items: Branch[]; hasMore: boolean },
  { search?: string; page?: number; limit?: number },
  { state: RootState }
>(
  "stockSummaryOutlet/searchBranches",
  async ({ search = "", page = 1, limit = 20 }, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/outletinventory/locations`,
        {
          params: { search: search.trim() || undefined, page, limit }
        }
      );
      const items: Branch[] = response.data || [];
      return { items, hasMore: items.length === limit };
    } catch (error) {
      const err = error as AxiosError;
      return rejectWithValue(err.response?.data || "Failed to search branches");
    }
  }
);
// 1️⃣ Fetch Stock Ledger
export const fetchStockLedger = createAsyncThunk<
  StockLedgerResponse[],
  { locationId: string; itemCode: string[]; fromDate: string; toDate: string },
  { rejectValue: AxiosErrorPayload }
>(
  "stockSummaryOutlet/fetchStockLedger",
  async (params, { rejectWithValue }) => {
    try {
      if (!params.itemCode || params.itemCode.length === 0) {
        return rejectWithValue({
          message: "At least one itemCode is required",
          status: 400,
          raw: null
        });
      }

      const response = await axios.get(
        `${API_BASE_URL}/outletinventoryvariance/stock-ledger/transactions`,
        {
          params: {
            fromDate: params.fromDate,
            toDate: params.toDate,
            locationId: params.locationId,
            // Try different serialization approaches
            itemCode: params.itemCode,
          },
          paramsSerializer: {
            indexes: null, // Try null instead of false
         
          },
        }
      );

      return response.data;
    } catch (error) {
      const parsedError = parseAxiosError(error as AxiosError);
      console.error("API Error:", parsedError);
      return rejectWithValue(parsedError);
    }
  }
);


// 2️⃣ Search Purchase Items (pagination for dropdown scroll)
export const searchPurchaseItems = createAsyncThunk<
  { items: PurchaseItem[]; hasMore: boolean },
  { search?: string; page?: number; limit?: number }
>(
  "stockSummaryOutlet/searchPurchaseItems",
  async ({ search = "", page = 1, limit = 20 }, { rejectWithValue }) => {
    try {
      const isSearching = !!search.trim();

      const response = await axios.get(
        `${API_BASE_URL}/outletinventoryvariance/items`,
        {
          params: {
            search: search.trim() || undefined,
            ...(isSearching ? {} : { page, limit }),
          },
        }
      );

      const items = response.data || [];
      return {
        items,
        hasMore: !isSearching && items.length === limit,
      };
    } catch (error) {
      const err = error as AxiosError;
      return rejectWithValue(err.response?.data || "Failed to search items");
    }
  }
);


// 3️⃣ Fetch All Purchase Items (no pagination)
export const fetchAllPurchaseItems = createAsyncThunk<PurchaseItem[]>(
  "stockSummaryOutlet/fetchAllPurchaseItems",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/outletinventoryvariance/items`,
        { params: { search: "" } }
      );
      return response.data || [];
    } catch (error) {
      const err = error as AxiosError;
      return rejectWithValue(err.response?.data || "Failed to fetch all items");
    }
  }
);


// 4️⃣ Export Stock Ledger Excel
export const exportStockLedgerExcel = createAsyncThunk<
  void,
  {
    locationName: string;
    itemCodes: string[];
    fromDate: string;
    toDate: string;
  },
  { rejectValue: AxiosErrorPayload }
>(
  "stockSummaryOutlet/exportStockLedgerExcel",
  async (params, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/outletinventoryvariance/stock-ledger/transactions/excel`,
        {
          params: {
            locationName: params.locationName,
            itemCodes: params.itemCodes,
            fromDate: params.fromDate,
            toDate: params.toDate,
          },
          paramsSerializer: { indexes: null },
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `Stock_Ledger_${params.fromDate}_${params.toDate}.xlsx`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      return rejectWithValue(parseAxiosError(error as AxiosError));
    }
  }
);

// 5️⃣ Export Stock Ledger CSV
export const exportStockLedgerCSV = createAsyncThunk<
  void,
  {
    locationId: string;
    itemCode: string[];
    fromDate: string;
    toDate: string;
  },
  { rejectValue: AxiosErrorPayload }
>(
  "stockSummaryOutlet/exportStockLedgerCSV",
  async (params, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/outletinventoryvariance/stock-ledger/transactions/export`,
        {
          params: {
            locationId: params.locationId,
            itemCode: params.itemCode,
            fromDate: params.fromDate,
            toDate: params.toDate,
          },
          paramsSerializer: {
            indexes: null, // VERY IMPORTANT for itemCode[]
          },
          responseType: "blob",
        }
      );

      // ⬇️ Download CSV
      const blob = new Blob([response.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `stock_ledger_${params.locationId}_${params.fromDate}_${params.toDate}.csv`;
      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      return rejectWithValue(parseAxiosError(error as AxiosError));
    }
  }
);


/* ================= SLICE ================== */

const stockSummaryOutletSlice = createSlice({
  name: "stockSummaryOutlet",
  initialState,
  reducers: {
    clearStockLedger: (state) => {
      state.stockLedgers = [];
      state.loading = false;
      state.error = null;
    },
    addSelectedItem: (state, action: PayloadAction<string>) => {
      if (!state.selectedItems.includes(action.payload)) {
        state.selectedItems.push(action.payload);
      }
    },
    removeSelectedItem: (state, action: PayloadAction<string>) => {
      state.selectedItems = state.selectedItems.filter((i) => i !== action.payload);
    },
    clearSelectedItems: (state) => {
      state.selectedItems = [];
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    clearSearchResults: (state) => {
      state.searchResults = [];
      state.currentPage = 1;
      state.hasMore = false;
    },
    setBranchSearchQuery: (state, action: PayloadAction<string>) => {
      state.branchSearchQuery = action.payload;
    },

    addSelectedBranch: (state, action: PayloadAction<string>) => {
      if (!state.branchSelected.includes(action.payload)) state.branchSelected.push(action.payload);
    },
    removeSelectedBranch: (state, action: PayloadAction<string>) => {
      state.branchSelected = state.branchSelected.filter(id => id !== action.payload);
    },
    clearSelectedBranches: (state) => {
      state.branchSelected = [];
    },
    resetState: () => initialState,
  },

  extraReducers: (builder) => {
    builder.addCase(fetchBranches.pending, (state) => {
      state.loading = true;
      state.error = null;
    })
      .addCase(fetchBranches.fulfilled, (state, action) => {
        state.loading = false;
        state.branches = action.payload;
      })
      .addCase(fetchBranches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || "Failed to fetch branches";
      });
    builder.addCase(searchBranches.pending, (state) => {
      state.branchSearchLoading = true;
    });
    builder.addCase(searchBranches.fulfilled, (state, action) => {
      state.branchSearchLoading = false;

      const page = action.meta.arg.page ?? 1;
      const newItems = action.payload.items;

      const mergedItems =
        page === 1 ? newItems : [...state.branchSearchResults, ...newItems];

      const uniqueItems = Array.from(
        new Map(mergedItems.map(i => [i.aliasName, i])).values()
      );

      state.branchSearchResults = uniqueItems;
      state.branchHasMore = action.payload.hasMore;
      state.branchCurrentPage = page;
    });


    // fetchStockLedger
    builder.addCase(fetchStockLedger.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(fetchStockLedger.fulfilled, (state, action) => { state.stockLedgers = action.payload; state.loading = false; });
    builder.addCase(fetchStockLedger.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload?.message || "Failed to fetch stock ledger";
    });
    // searchPurchaseItems
    builder.addCase(searchPurchaseItems.pending, (state) => { state.searchLoading = true; state.searchError = null; });
    builder.addCase(searchPurchaseItems.fulfilled, (state, action) => {
      state.searchLoading = false;
      const newItems = action.payload.items;
      const mergedItems = state.currentPage === 1 ? newItems : [...state.searchResults, ...newItems];
      const uniqueItems = Array.from(new Map(mergedItems.map(i => [i.itemCode, i])).values());
      state.searchResults = uniqueItems;
      state.hasMore = action.payload.hasMore;
      state.currentPage += 1;
    });
    // exportStockLedgerCSV
    builder.addCase(exportStockLedgerCSV.pending, (state) => {
      state.exportLoading = true;
      state.exportError = null;
    });
    builder.addCase(exportStockLedgerCSV.fulfilled, (state) => {
      state.exportLoading = false;
    });
    builder.addCase(exportStockLedgerCSV.rejected, (state, action) => {
      state.exportLoading = false;
      state.exportError = action.payload?.message || "Failed to export CSV";
    });

    builder.addCase(searchPurchaseItems.rejected, (state, action) => { state.searchLoading = false; state.searchError = action.payload as string; });

    // fetchAllPurchaseItems
    builder.addCase(fetchAllPurchaseItems.pending, (state) => { state.allItemsLoading = true; state.allItemsError = null; });
    builder.addCase(fetchAllPurchaseItems.fulfilled, (state, action) => { state.allItemsLoading = false; state.allPurchaseItems = action.payload; });
    builder.addCase(fetchAllPurchaseItems.rejected, (state, action) => { state.allItemsLoading = false; state.allItemsError = action.payload as string; });

    // exportStockLedgerExcel
    builder.addCase(exportStockLedgerExcel.pending, (state) => {
      state.exportLoading = true;
      state.exportError = null;
    }); builder.addCase(exportStockLedgerExcel.fulfilled, (state) => { state.exportLoading = false; });
    builder.addCase(exportStockLedgerExcel.rejected, (state, action) => {
      state.exportLoading = false;
      state.exportError =
        action.payload?.message || "Failed to export stock ledger Excel";
    });
  },



});

/* ================= SELECTORS ================== */
export const selectStockLedgers = (state: RootState) => state.stockSummaryOutlet.stockLedgers; // CHANGED
export const selectStockLoading = (state: RootState) => state.stockSummaryOutlet.loading;
export const selectSearchResults = (state: RootState) => state.stockSummaryOutlet.searchResults;
export const selectSearchLoading = (state: RootState) => state.stockSummaryOutlet.searchLoading;
export const selectSelectedItems = (state: RootState) => state.stockSummaryOutlet.selectedItems;
export const selectSearchQuery = (state: RootState) => state.stockSummaryOutlet.searchQuery;

/* ================= EXPORTS ================== */
export const {
  clearStockLedger,
  addSelectedItem,
  removeSelectedItem,
  clearSelectedItems,
  resetState,
  setSearchQuery,
  clearSearchResults,
  clearSelectedBranches,
  addSelectedBranch,
  setBranchSearchQuery,
  removeSelectedBranch,
} = stockSummaryOutletSlice.actions;

export default stockSummaryOutletSlice.reducer;
