import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios, { AxiosError } from "axios";
import { API_BASE_URL } from "./OuletePhysicalStockSlice";

// Type for dropdown options
type OptionType = {
  value: string;
  label: string;
};

// Interface for PurchaseItem
export interface RawMaterialStore {
  locationId: string;
  randomId: string;
  itemName: string;
  itemCode: string;
  category: string;
  subcategory: string;
  varianceName: string;
  receivedQty: number;
  returnedQty: number;
  dispatchQty: number;
  openingStock?: number;
  warehouseReturn?: number;
  locationName?: string;
  physicalClosing?: number;
  SystemStock: number;
  updatedCurrentSystem?: number;
  PhysicalStock?: number;
  currentSystem?: number;
  variance?: number;
  approvalStatus?: string;
  approvalButton?: boolean;
  canApprove?: boolean;
  stockVariance?: string;
};

export interface ApprovedStockItem {
  id: string;
  randomId: string;
  itemName: string;
  locationId: string;
  systemStockBefore: number;
  PhysicalStock: number;
  actualVariance: number;
  systemStockAfter: number;
  // approvedBy: string;
  // description?: string;
  // approvedAt: string;
  // status: "Approved";
  // replace the part 11 8 1
    approvedBy?: string | null;
  description?: string;
  approvedAt: string;
  status: string;
}

// --- Define a reusable type for fetchPurchaseItems params ---
// export interface FetchPurchaseItemsParams {
//   skip?: number;
//   limit?: number;
//   itemName?: string[];
//   category?: string[];
//   subcategory?: string[];
//   varianceName?: string[];
//   locationName?: string;
//   createdDate?: string;
//   fetchDropdowns?: boolean;

//   categorySearch?: string;
//   categoryPage?: number;
//   categoryLimit?: number;

//   subcategorySearch?: string;
//   subcategoryPage?: number;
//   subcategoryLimit?: number;

//   itemNameSearch?: string;
//   itemNamePage?: number;
//   itemNameLimit?: number;

//   varianceNameSearch?: string;
//   varianceNamePage?: number;
//   varianceNameLimit?: number;
// }
// replace the part 12 8 3
export interface FetchPurchaseItemsParams {
  skip?: number;
  limit?: number;
  itemName?: string[];
  category?: string[];
  subcategory?: string[];
  varianceName?: string[];
  locationName?: string;
  createdDate?: string;
  fetchDropdowns?: boolean;
  pendingOnly?: boolean;

  categorySearch?: string;
  categoryPage?: number;
  categoryLimit?: number;

  subcategorySearch?: string;
  subcategoryPage?: number;
  subcategoryLimit?: number;

  itemNameSearch?: string;
  itemNamePage?: number;
  itemNameLimit?: number;

  varianceNameSearch?: string;
  varianceNamePage?: number;
  varianceNameLimit?: number;

  // newly add this part 14 8 1
  sortField?: string;
  sortOrder?: "asc" | "desc";
}
// Interface for Warehouse
export interface Warehouse {
  locationId: string;
  locationName: string;
  aliasName: string;
}

// Interface for SearchParams
export interface SearchParams {
  itemName: string[];
  category: string[];
  subcategory: string[];
  varianceName: string[];
  locationName: string;
  createdDate?: string;
}

// Interface for Paginated Items Response
interface PaginatedItemsResponse {
  items?: RawMaterialStore[];
  totalItems?: number;
  dropdowns?: {
    category?: { items: string[]; total: number; page: number; limit: number };
    subcategory?: { items: string[]; total: number; page: number; limit: number };
    itemName?: { items: string[]; total: number; page: number; limit: number };
    varianceName?: { items: string[]; total: number; page: number; limit: number };
  };
}

// State interface
interface PurchaseItemState {
  rawmaterialItems: RawMaterialStore[];
  totalItems: number;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  categoryNameOptions: OptionType[];
  subcategoryNameOptions: OptionType[];
  varianceNameOptions: OptionType[];
  itemNameOptions: OptionType[];
  categoryNameTotal: number;
  subcategoryNameTotal: number;
  itemNameTotal: number;
  varianceNameTotal: number;
  varianceNamePage: number;
  categoryNamePage: number;
  subcategoryNamePage: number;
  itemNamePage: number;
  warehouses: Warehouse[];
  warehouseStatus: "idle" | "loading" | "succeeded" | "failed";
  warehouseError: string | null;
  approvedItems: ApprovedStockItem[];
  approvedItemsTotal: number;
  approvedItemsStatus: "idle" | "loading" | "succeeded" | "failed";
  approvedItemsError: string | null;
  hasMore: boolean;
  currentSkip: number;
  searchParams: SearchParams;
  categoryNameSearchTerm: string;
  subcategoryNameSearchTerm: string;
  itemNameSearchTerm: string;
  varianceNameSearchTerm: string;
  isLoadingMore: boolean;
  isFullScreen: boolean;
  openSnackbar: boolean;
  snackbarMessage: string;
  openAdjustmentDialog: boolean;
  openApproveDialog: boolean;
  openDownloadDialog: boolean;
  selectedItem: RawMaterialStore | null;
  adjustedPhysicalStock: string;
  adjustmentReason: string;
  selectedApproveItem: RawMaterialStore | null;
  approveDescription: string;
  visibleColumns: Record<string, boolean>;
  approveAllBranchLoading: boolean;
  loadingPendingCodes: boolean;
}

// Initial state
const initialState: PurchaseItemState = {
  rawmaterialItems: [],
  totalItems: 0,
  status: "idle",
  error: null,
  categoryNameOptions: [],
  subcategoryNameOptions: [],
  itemNameOptions: [],
  varianceNameOptions: [],
  categoryNameTotal: 0,
  subcategoryNameTotal: 0,
  itemNameTotal: 0,
  varianceNameTotal: 0,
  varianceNamePage: 1,
  categoryNamePage: 1,
  subcategoryNamePage: 1,
  itemNamePage: 1,
  warehouses: [],
  warehouseStatus: "idle",
  warehouseError: null,
  approvedItems: [],
  approvedItemsTotal: 0,
  approvedItemsStatus: "idle",
  approvedItemsError: null,
  hasMore: false,
  currentSkip: 0,
  searchParams: {
    itemName: [],
    category: [],
    subcategory: [],
    varianceName: [],
    locationName: "",
    createdDate: "",
  },
  categoryNameSearchTerm: "",
  subcategoryNameSearchTerm: "",
  itemNameSearchTerm: "",
  varianceNameSearchTerm: "",
  isLoadingMore: false,
  isFullScreen: false,
  openSnackbar: false,
  snackbarMessage: "",
  openAdjustmentDialog: false,
  openApproveDialog: false,
  openDownloadDialog: false,
  selectedItem: null,
  adjustedPhysicalStock: "",
  adjustmentReason: "",
  selectedApproveItem: null,
  approveDescription: "",
  approveAllBranchLoading: false,
  loadingPendingCodes: false,
  visibleColumns: {
    "S.No": true,
    "Item Code": true,
    "Item Name": true,
    Category: false,
    Subcategory: false,
    "Itemgroup": true,
    "Opening": true,
    "Receiving": true,
    "Returned": true,
    "Dispatch": true,
    "WH Return": true,
    "Calc System": true,
    "System": true,
    "Physical": true,
    Variance: true,
    "Status": true,
    Action: true,
  },
};

// Fetch warehouses
export const fetchWarehouses = createAsyncThunk(
  "purchaseItems/fetchWarehouses",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get<Warehouse[]>(`${API_BASE_URL}/warehouseinventory/warehouses`);
      return response.data;
    } catch (error) {
      const err = error as AxiosError<{ detail: string }>;
      return rejectWithValue(err.response?.data?.detail || "Failed to fetch warehouses");
    }
  }
);

// Fetch purchase items with dropdown search support
export const fetchPurchaseItems = createAsyncThunk(
  "purchaseItems/fetchAll",
  async (params: FetchPurchaseItemsParams, { rejectWithValue, signal }) => {
    try {
      const baseUrl = `${API_BASE_URL}/warehouseinventoryvariance/`
      const queryParams = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          if (Array.isArray(value)) {
            if (value.length > 0) {
              queryParams.append(key, value.join(","));
            }
          } else {
            queryParams.append(key, value.toString());
          }
        }
      });

      const url = `${baseUrl}?${queryParams.toString()}`;
      const response = await axios.get<PaginatedItemsResponse>(url, { signal });
      return response.data;
    } catch (error) {
      if (axios.isCancel(error) || (error as AxiosError).name === "CanceledError") {
        throw error;
      }
      const err = error as AxiosError<{ detail: string }>;
      return rejectWithValue(err.response?.data?.detail || "Failed to fetch purchase items");
    }
  }
);

// Approve an item (PATCH /approve)
export const approveItem = createAsyncThunk<
  { randomId: string; updatedItem: any },
  { item_id: string; locationId: string; approved_by?: string; description?: string; adjustmentMode?: "ADJUST_SYSTEM" | "KEEP_SYSTEM" },
  { rejectValue: string }
>(
  "purchaseItems/approveItem",
  async (params, { rejectWithValue, dispatch }) => {
    const { item_id, locationId, approved_by, description, adjustmentMode } = params;

    try {
      // ✅ Ensure no trailing slash
      const url = `${API_BASE_URL}/warehouseinventoryvariance/${item_id}/approve?locationId=${encodeURIComponent(locationId)}`;

      const response = await axios.patch(url, {
        approved_by,
        description,
        adjustmentMode: adjustmentMode || "ADJUST_SYSTEM"
      });

      dispatch(setSnackbarMessage(response.data.message));
      dispatch(setOpenSnackbar(true));

      return {
        randomId: item_id,
        updatedItem: response.data.data, // match your backend response
      };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        "Failed to approve item";

      dispatch(setSnackbarMessage(errorMessage));
      dispatch(setOpenSnackbar(true));
      return rejectWithValue(errorMessage);
    }
  }
);

// Fetch approved items (GET /approved)
export const fetchApprovedItems = createAsyncThunk<
  { items: ApprovedStockItem[]; total: number },
  // { page: number; limit: number; locationName?: string; date?: string },
  // replace the line 11 8 1
    { page: number; limit: number; locationName?: string; date?: string; status?: string; itemName?: string; approvedBy?: string; fromDate?: string; toDate?: string },
  { rejectValue: string }
>("purchaseItems/fetchApprovedItems", async (params, { rejectWithValue }) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/warehouseinventoryvariance/approved`, { params });

    return {
      items: res.data.data,
      total: res.data.total,
    };
  } catch {
    return rejectWithValue("Failed to fetch approved items");
  }
});

export interface ApproveAllWarehouseBranchParams {
  locationId: string;
  queryDate?: string;
  approved_by?: string;
  description?: string;
  adjustmentMode?: string;
  varianceThresholdPct?: number;
  varianceThresholdUnits?: number;
  tenant_id?: string;
}

export interface ApproveAllWarehouseBranchResult {
  success: boolean;
  message: string;
  approved: number;
  autoVerified: number;
  flagged: number;
  failed: number;
  skipped: number;
  totalInClosing: number;
  alreadyApproved: number;
  flaggedItems?: any[];
  failedItems?: any[];
}

export interface WarehousePendingCodesResult {
  locationId: string;
  itemCodes: string[];
  total: number;
  totalInClosing: number;
  alreadyApproved: number;
  closingDate?: string;
}

export const fetchWarehousePendingCodes = createAsyncThunk<
  WarehousePendingCodesResult,
  { locationId: string; queryDate?: string },
  { rejectValue: string }
>(
  "purchaseItems/fetchWarehousePendingCodes",
  async ({ locationId, queryDate }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/warehouseinventoryvariance/pending-codes`, {
        params: { branch: locationId, queryDate },
      });
      return response.data;
    } catch (error) {
      const err = error as AxiosError<{ detail: string }>;
      return rejectWithValue(err.response?.data?.detail || "Failed to fetch pending item codes");
    }
  }
);

export const approveAllWarehouseBranch = createAsyncThunk<
  ApproveAllWarehouseBranchResult,
  ApproveAllWarehouseBranchParams,
  { rejectValue: string }
>(
  "purchaseItems/approveAllWarehouseBranch",
  async (params, { rejectWithValue }) => {
    try {
      const { locationId, queryDate, ...body } = params;
      const response = await axios.patch(`${API_BASE_URL}/warehouseinventoryvariance/approve/all`, body, {
        params: { branch: locationId, queryDate },
      });
      return response.data;
    } catch (error) {
      const err = error as AxiosError<{ detail: string }>;
      return rejectWithValue(err.response?.data?.detail || "Failed to approve all items for branch");
    }
  }
);

const purchaseItemSlice = createSlice({
  name: "purchaseItems",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
      state.warehouseError = null;
      state.approvedItemsError = null;
    },
    resetStatus: (state) => {
      state.status = "idle";
      state.warehouseStatus = "idle";
      state.approvedItemsStatus = "idle";
    },
    resetPurchaseItems: (state) => {
      state.rawmaterialItems = [];
      state.totalItems = 0;
      state.status = "idle";
      state.hasMore = false;
      state.currentSkip = 0;
    },
    resetDropdownPagesSelectively: (state, action: { payload: { preservePages?: boolean } }) => {
      if (!action.payload.preservePages) {
        state.categoryNamePage = 1;
        state.subcategoryNamePage = 1;
        state.itemNamePage = 1;
        state.varianceNamePage = 1;
      }
    },
    resetApprovedItems: (state) => {
      state.approvedItems = [];
      state.approvedItemsTotal = 0;
      state.approvedItemsStatus = "idle";
      state.approvedItemsError = null;
    },
    incrementDropdownPage: (state, action: { payload: { field: string } }) => {
      const { field } = action.payload;
      if (field === "category") {
        state.categoryNamePage += 1;
      } else if (field === "subcategory") {
        state.subcategoryNamePage += 1;
      } else if (field === "itemName") {
        state.itemNamePage += 1;
      } else if (field === "varianceName") {
        state.varianceNamePage += 1;
      }
    },
    resetDropdownPages: (state) => {
      state.categoryNamePage = 1;
      state.subcategoryNamePage = 1;
      state.itemNamePage = 1;
      state.varianceNamePage = 1;
    },
    setCurrentSkip: (state, action: { payload: number }) => {
      state.currentSkip = action.payload;
    },
    setSearchParams: (state, action: { payload: SearchParams }) => {
      state.searchParams = action.payload;
    },
    setCategoryNameSearchTerm: (state, action: { payload: string }) => {
      state.categoryNameSearchTerm = action.payload;
    },
    setSubcategoryNameSearchTerm: (state, action: { payload: string }) => {
      state.subcategoryNameSearchTerm = action.payload;
    },
    setItemNameSearchTerm: (state, action: { payload: string }) => {
      state.itemNameSearchTerm = action.payload;
    },
    setVarianceNameSearchTerm: (state, action: { payload: string }) => {
      state.varianceNameSearchTerm = action.payload;
    },
    setIsLoadingMore: (state, action: { payload: boolean }) => {
      state.isLoadingMore = action.payload;
    },
    setIsFullScreen: (state, action: { payload: boolean }) => {
      state.isFullScreen = action.payload;
    },
    setOpenSnackbar: (state, action: { payload: boolean }) => {
      state.openSnackbar = action.payload;
    },
    setSnackbarMessage: (state, action: { payload: string }) => {
      state.snackbarMessage = action.payload;
    },
    setOpenAdjustmentDialog: (state, action: { payload: boolean }) => {
      state.openAdjustmentDialog = action.payload;
    },
    setOpenApproveDialog: (state, action: { payload: boolean }) => {
      state.openApproveDialog = action.payload;
    },
    setOpenDownloadDialog: (state, action: { payload: boolean }) => {
      state.openDownloadDialog = action.payload;
    },
    setSelectedItem: (state, action: { payload: RawMaterialStore | null }) => {
      state.selectedItem = action.payload;
    },
    setAdjustedPhysicalStock: (state, action: { payload: string }) => {
      state.adjustedPhysicalStock = action.payload;
    },
    setAdjustmentReason: (state, action: { payload: string }) => {
      state.adjustmentReason = action.payload;
    },
    setSelectedApproveItem: (state, action: { payload: RawMaterialStore | null }) => {
      state.selectedApproveItem = action.payload;
    },
    setApproveDescription: (state, action: { payload: string }) => {
      state.approveDescription = action.payload;
    },
    setVisibleColumns: (state, action: { payload: Record<string, boolean> }) => {
      state.visibleColumns = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPurchaseItems.pending, (state, action) => {
        const { skip = 0, limit = 0 } = action.meta.arg;
        if (limit > 0 && skip === 0) {
          state.status = "loading";
        }
      })
      .addCase(fetchPurchaseItems.fulfilled, (state, action) => {
        const payload = action.payload;
        const { skip = 0, limit = 0 } = action.meta.arg;
        console.log(
    "WAREHOUSE API RESPONSE",
    payload.items?.find((i: any) => i.randomId === "PI001")
  );
        // Handle main items only if limit > 0 and items exist
        if (limit > 0 && Array.isArray(payload.items)) {
          if (skip === 0) {
            // state.rawmaterialItems = payload.items;
            // repalce the part 7 8 1
            state.rawmaterialItems = payload.items.map((item: any) => ({
              ...item,
              PhysicalStock: item.PhysicalStock ?? item.physicalStock,
              SystemStock: item.SystemStock ?? item.systemStock,
            }));
            state.currentSkip = payload.items.length;
          } else {

            const newItems = payload.items.filter(
              (newItem) =>
                !state.rawmaterialItems.some(
                  (existing) => existing.randomId === newItem.randomId
                )
            );

            state.rawmaterialItems = [...state.rawmaterialItems, ...newItems];
            state.currentSkip = state.rawmaterialItems.length;
          }

          state.totalItems = payload.totalItems || 0;
          state.hasMore = state.rawmaterialItems.length < state.totalItems;
          state.status = "succeeded";
        }

        // Dropdown update logic (unchanged)
        const updateDropdown = (
          dropdownData: { items: string[]; total: number; page: number; limit: number } | undefined,
          optionsField: keyof Pick<PurchaseItemState, "categoryNameOptions" | "subcategoryNameOptions" | "itemNameOptions" | "varianceNameOptions">,
          totalField: keyof Pick<PurchaseItemState, "categoryNameTotal" | "subcategoryNameTotal" | "itemNameTotal" | "varianceNameTotal">,
          pageField: keyof Pick<PurchaseItemState, "categoryNamePage" | "subcategoryNamePage" | "itemNamePage" | "varianceNamePage">
        ) => {
          if (!dropdownData || !Array.isArray(dropdownData.items)) return;

          const newOptions = dropdownData.items.map((item) => ({ value: item, label: item }));
          const requestedPage = dropdownData.page;

          if (requestedPage > 1) {
            const existingValues = new Set(
              (state[optionsField] as OptionType[]).map(opt => opt.value)
            );
            const uniqueNewOptions = newOptions.filter(
              opt => !existingValues.has(opt.value)
            );
            state[optionsField] = [
              ...(state[optionsField] as OptionType[]),
              ...uniqueNewOptions
            ];
          } else {
            state[optionsField] = newOptions;
          }

          state[totalField] = dropdownData.total;
          state[pageField] = dropdownData.page;
        };

        if (payload.dropdowns) {
          if (payload.dropdowns.category) {
            updateDropdown(
              payload.dropdowns.category,
              "categoryNameOptions",
              "categoryNameTotal",
              "categoryNamePage"
            );
          }

          if (payload.dropdowns.subcategory) {
            updateDropdown(
              payload.dropdowns.subcategory,
              "subcategoryNameOptions",
              "subcategoryNameTotal",
              "subcategoryNamePage"
            );
          }

          if (payload.dropdowns.itemName) {
            updateDropdown(
              payload.dropdowns.itemName,
              "itemNameOptions",
              "itemNameTotal",
              "itemNamePage"
            );
          }

          if (payload.dropdowns.varianceName) {
            updateDropdown(
              payload.dropdowns.varianceName,
              "varianceNameOptions",
              "varianceNameTotal",
              "varianceNamePage"
            );
          }
        }
      })
      .addCase(fetchPurchaseItems.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
        state.hasMore = false;
      })
      .addCase(fetchWarehouses.pending, (state) => {
        state.warehouseStatus = "loading";
      })
      .addCase(fetchWarehouses.fulfilled, (state, action) => {
        state.warehouseStatus = "succeeded";
        state.warehouses = action.payload;
      })
      .addCase(fetchWarehouses.rejected, (state, action) => {
        state.warehouseStatus = "failed";
        state.warehouseError = action.payload as string;
      })
      .addCase(approveItem.pending, (state) => {
        state.status = "loading";
      })
      .addCase(approveItem.fulfilled, (state, action) => {
        state.status = "succeeded";

        const { randomId, updatedItem } = action.payload;

        const index = state.rawmaterialItems.findIndex(
          (item) => item.randomId === randomId
        );

        if (index !== -1) {
          state.rawmaterialItems[index] = {
            ...state.rawmaterialItems[index],
            ...updatedItem,
            approvalStatus: "Approved",
            approvalButton: false,
          };
        }
      })
      .addCase(approveItem.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })
      .addCase(fetchApprovedItems.pending, (state, action) => {
        const { page = 1, limit = 0 } = action.meta.arg;
        if (limit > 0 && page === 1) {
          state.approvedItemsStatus = "loading";
        }
        if (limit > 0 && page > 1) {
          state.isLoadingMore = true;
        }
      })
      .addCase(fetchApprovedItems.fulfilled, (state, action) => {
        const { items, total } = action.payload;

        if (items.length > 0) {
          const newItems = items.filter(
            (n) => !state.approvedItems.some((e) => e.id === n.id)
          );
          state.approvedItems.push(...newItems);
        }

        state.approvedItemsTotal = total;
        state.approvedItemsStatus = "succeeded";
        state.isLoadingMore = false;
      })
      .addCase(fetchApprovedItems.rejected, (state, action) => {
        state.approvedItemsStatus = "failed";
        state.approvedItemsError = action.payload as string;
        state.isLoadingMore = false;
      })
      .addCase(approveAllWarehouseBranch.pending, (state) => {
        state.approveAllBranchLoading = true;
      })
      .addCase(approveAllWarehouseBranch.fulfilled, (state) => {
        state.approveAllBranchLoading = false;
      })
      .addCase(approveAllWarehouseBranch.rejected, (state) => {
        state.approveAllBranchLoading = false;
      })
      .addCase(fetchWarehousePendingCodes.pending, (state) => {
        state.loadingPendingCodes = true;
      })
      .addCase(fetchWarehousePendingCodes.fulfilled, (state) => {
        state.loadingPendingCodes = false;
      })
      .addCase(fetchWarehousePendingCodes.rejected, (state) => {
        state.loadingPendingCodes = false;
      });
  }
});

export const {
  clearError,
  resetStatus,
  resetPurchaseItems,
  resetDropdownPagesSelectively,
  resetApprovedItems,
  incrementDropdownPage,
  resetDropdownPages,
  setCurrentSkip,
  setSearchParams,
  setCategoryNameSearchTerm,
  setSubcategoryNameSearchTerm,
  setItemNameSearchTerm,
  setVarianceNameSearchTerm,
  setIsLoadingMore,
  setIsFullScreen,
  setOpenSnackbar,
  setSnackbarMessage,
  setOpenAdjustmentDialog,
  setOpenApproveDialog,
  setOpenDownloadDialog,
  setSelectedItem,
  setAdjustedPhysicalStock,
  setAdjustmentReason,
  setSelectedApproveItem,
  setApproveDescription,
  setVisibleColumns,
} = purchaseItemSlice.actions;

export default purchaseItemSlice.reducer;
