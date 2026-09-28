
import axios, { AxiosError } from "axios";
import { RootState } from "@/redux/store";
import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
} from "@reduxjs/toolkit";

import { API_BASE_URL } from "./OuletePhysicalStockSlice";
import { getApiErrorMessage } from "@/components/Inventory/shared/apiError";
import {
  downloadBlobSafely,
  getFilenameFromContentDisposition,
} from "@/components/Inventory/shared/downloadFile";
/* ---------- HELPERS ---------- */


interface FilterOption {
  values: string[];
  total: number;
  page: number;
  limit: number;
  count: number;
  searchFilter: string | null;
  hasMore: boolean;
  loading: boolean;
}

export interface Warehouse {
  locationId: string;
  locationName: string;
  aliasName: string;
}

export interface RawMaterial {
  randomId: string;
  category: string;
  subcategory: string;
  itemName: string;
  varianceName?: string;
  itemCode?: string;
  stockQuantity: number;
  systemStockSo: number;
  physicalStock: number;
  previousSystemStock: number;
}

interface FilterOptionsResponse {
  categories: FilterOption;
  subcategories: FilterOption;
  itemNames: FilterOption;
  varianceNames: FilterOption;
}

interface SearchRawMaterialsResponse {
  results: RawMaterial[];
  total: number;
  page: number;
  limit: number;
  dropdown_values: FilterOptionsResponse;
}

export interface UpdateStockRequestPayload {
  randomId: string;
  warehouseId: string;
  physicalStock: number;
  updatedBy: string;
  description: string;
}

interface ImportStockResponse {
  message: string;
  locationId: string;
  totalRows: number;
  updated: number;
  skipped: number;
}

/* ---------- STATE ---------- */
export interface RawMaterialsState {
  filterOptions: FilterOptionsResponse;
  filteredRawMaterials: {
    total: number;
    page: number;
    limit: number;
    count: number;
    items: RawMaterial[];
    hasMore: boolean;
  } | null;
  accumulatedRawMaterials: RawMaterial[];
  warehouses: Warehouse[];
  warehousesLoading: boolean;
  loading: boolean;
  error: string | null;
  filters: {
    page: number;
    limit: number;
    locationId: string;
    aliasName: string;
    purchasecategoryName?: string | string[];
    purchasesubcategoryName?: string | string[];
    itemName?: string | string[];
    varianceName?: string | string[];
    createdDate?: string;
    categorySearch?: string;
    subCategorySearch?: string;
    itemNameSearch?: string;
    varianceNameSearch?: string;
    categoryPage: number;
    categoryLimit: number;

    subCategoryPage: number;
    subCategoryLimit: number;
    itemNamePage: number;
    itemNameLimit: number;
    varianceNamePage: number;
    varianceNameLimit: number;
    includeDropdowns: boolean;
  };
  lastFetchParams: string;
  visibleColumns: Record<string, boolean>;
  openSnackbar: boolean;
  openDownloadDialog: boolean;
  editMessage: string;
  openDialog: boolean;
  openModal: boolean;
  updatedStocks: {
    itemName: string;
    newValue: number;
    varianceName?: string;
    randomId: string;
    systemStock: number;
    locationId: string;
  }[];
  changes: {
    itemName: string;
    newValue: number;
    varianceName: string;
    randomId: string;
    systemStock: number;
    locationId: string;
  }[];
  changedRows: Record<string, boolean>;
}

/* ---------- INITIAL STATE ---------- */
const initialFilterOption: FilterOption = {
  values: [],
  total: 0,
  page: 1,
  limit: 50,
  count: 0,
  searchFilter: null,
  hasMore: true,
  loading: false,
};

const initialState: RawMaterialsState = {
  filterOptions: {
    categories: initialFilterOption,
    subcategories: initialFilterOption,
    itemNames: initialFilterOption,
    varianceNames: initialFilterOption,
  },
  filteredRawMaterials: null,
  accumulatedRawMaterials: [],
  warehouses: [],
  warehousesLoading: false,
  loading: false,
  error: null,
  filters: {
    page: 1,
    limit: 30,
    locationId: "",
    aliasName: '',
    createdDate: '',
    categoryPage: 1,
    categoryLimit: 50,
    subCategoryPage: 1,
    subCategoryLimit: 50,
    itemNamePage: 1,
    itemNameLimit: 50,
    varianceNamePage: 1,
    varianceNameLimit: 50,
    includeDropdowns: true,
  },
  lastFetchParams: "",
  visibleColumns: {
    "S.No": true,
    "Item Code": true,
    "Category": false,
    "Sub Category": false,
    "Item Group": true,
    "Item Name": true,
    "SO Stock": true,
    "Prev System": true,
    "System Stock": true,
    "Physical": true,
  },
  openSnackbar: false,
  openDownloadDialog: false,
  editMessage: "",
  openDialog: false,
  openModal: false,
  updatedStocks: [],
  changes: [],
  changedRows: {},
};

interface AxiosErrorResponseData {
  detail?: string | Array<{ type: string; loc: string[]; msg: string; input: unknown }>;
  message?: string;
  [key: string]: unknown;
}

interface AxiosErrorPayload {
  message: string;
  status: number | null;
  raw?: unknown;
}

export const parseAxiosError = (err: AxiosError): AxiosErrorPayload => ({
  message: getApiErrorMessage(err, "Unknown error"),
  status: err.response?.status ?? null,
  raw: err.response?.data ?? null,
});

/* ---------- HELPER: Validate and convert to valid integer ---------- */
const toValidInteger = (value: unknown, defaultValue: number): number => {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  const num = Number(value);

  // Check if it's NaN or not a finite number
  if (isNaN(num) || !isFinite(num)) {
    return defaultValue;
  }

  // Return integer
  return Math.floor(num);
};

/* ---------- THUNKS ---------- */
export const fetchWarehouses = createAsyncThunk<
  Warehouse[],
  { page?: number; limit?: number; search?: string },
  { rejectValue: AxiosErrorPayload }
>("rawMaterials/fetchWarehouses", async ({ page = 1, limit = 30, search }, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    if (search) params.append("search", search);

    const { data } = await axios.get<Warehouse[]>(`${API_BASE_URL}/warehouseinventory/warehouses`, {
      params,
      timeout: 15000,
    });
    return data;
  } catch (e) {
    const err = e as AxiosError;
    if (err.code === "ECONNABORTED")
      return rejectWithValue({ message: "Request timeout", status: 408 });
    return rejectWithValue(parseAxiosError(err));
  }
});

export interface FetchRawMaterialsArg {
  params?: Partial<RawMaterialsState["filters"]>;
  field?: keyof FilterOptionsResponse;
  append?: boolean;
  page?: number;
  skipCache?: boolean;
  isFilterRequest?: boolean;
}

export const fetchRawMaterials = createAsyncThunk<
  {
    data: SearchRawMaterialsResponse;
    field?: keyof FilterOptionsResponse;
    append?: boolean;
    params: string;
    isFilterRequest?: boolean;
  },
  FetchRawMaterialsArg,
  { state: RootState; rejectValue: AxiosErrorPayload }
>(
  "rawMaterials/fetchRawMaterials",
  async (arg, { getState, rejectWithValue }) => {
    const state = getState() as { rawMaterials: RawMaterialsState };
    let params = { ...state.rawMaterials.filters };
    let field: keyof FilterOptionsResponse | undefined;
    let append = false;
    let skipCache = false;
    let isFilterRequest = false;

    if (arg) {
      const {
        params: p,
        field: f,
        append: a,
        page,
        skipCache: sc,
        isFilterRequest: ifr,
      } = arg;
      field = f;
      append = a ?? false;
      skipCache = sc ?? false;
      isFilterRequest = ifr ?? false;
      if (p) params = { ...params, ...p };
      if (page !== undefined) params.page = page;
    }

    const paramsKey = JSON.stringify({ ...params, field });
    if (
      !isFilterRequest &&
      !skipCache &&
      state.rawMaterials.lastFetchParams === paramsKey &&
      !field
    ) {
      return rejectWithValue({ message: "Duplicate request", status: 409 });
    }


    const clean: Record<string, string | number | boolean | string[]> = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;

      // Handle includeDropdowns as boolean
      if (k === "includeDropdowns") {
        clean[k] = Boolean(v);
        return;
      }

      // Only join arrays for main filters
      if (
        [
          "purchasecategoryName",
          "purchasesubcategoryName",
          "itemName",
          "varianceName",
          "locationId",
          "createdDate",
        ].includes(k)
      ) {
        if (Array.isArray(v) && v.length) clean[k] = v.join(",");
        else if (typeof v === "string" && v.trim()) clean[k] = v;
      }
      // For pagination/search params, validate and ensure valid integers
      else if (
        [
          "categoryPage",
          "categoryLimit",
          "subCategoryPage",
          "subCategoryLimit",
          "itemNamePage",
          "itemNameLimit",
          "varianceNamePage",
          "varianceNameLimit",
          "page",
          "limit",
        ].includes(k)
      ) {
        const defaultValue = k.includes("Page") ? 1 : 10;
        clean[k] = toValidInteger(v, defaultValue);
      }
      // Include search parameters for dropdowns
      else if (
        [
          "categorySearch",
          "subCategorySearch",
          "itemNameSearch",
          "varianceNameSearch",
        ].includes(k)
      ) {
        if (typeof v === "string" && v.trim()) clean[k] = v.trim();
      }
      else {
        clean[k] = v;
      }
    });

    try {
      const { data } = await axios.get<SearchRawMaterialsResponse>(
        `${API_BASE_URL}/warehouseinventory/`,
        { params: clean, timeout: 30000 }
      );

      return { data, field, append, params: paramsKey, isFilterRequest };
    } catch (e) {
      const err = e as AxiosError;
      return rejectWithValue(parseAxiosError(err));
    }
  }
);


export const updateRawMaterialStock = createAsyncThunk<
  {
    randomId: string;
    physicalStock: number;
    systemStock: number;
    previousSystemStock: number;
  },
  UpdateStockRequestPayload,
  { state: RootState; rejectValue: AxiosErrorPayload }
>(
  "rawMaterials/updateRawMaterialStock",
  async (payload, { getState, rejectWithValue }) => {
    const { randomId, warehouseId, physicalStock, updatedBy, description } =
      payload;

    if (!randomId || typeof physicalStock !== "number" || physicalStock < 0)
      return rejectWithValue({
        message:
          "Invalid payload: randomId + non-negative physicalStock required",
        status: 400,
      });
    if (!warehouseId)
      return rejectWithValue({
        message: "warehouseId is required",
        status: 400,
      });
    try {
      const { data } = await axios.patch(
        `${API_BASE_URL}/warehouseinventory/inventory`,
        {
          randomId,
          warehouseId: warehouseId,
          physicalStock,
        },
        {
          params: {
            updated_by: updatedBy,
            description,
          },
          timeout: 15000,
        }
      );

      return {
        randomId,
        physicalStock: data?.physicalStock ?? physicalStock,
        systemStock: data?.systemStock ?? physicalStock,
        previousSystemStock: data?.previousSystemStock ?? 0,
      };
    } catch (e) {
      const err = e as AxiosError;
      return rejectWithValue(parseAxiosError(err));
    }
  }
);

export interface UpdateStockBulkPayload {
  warehouseId: string;
  updates: {
    randomId: string;
    physicalStock: number;
  }[];
}

export const updateRawMaterialsBulk = createAsyncThunk<
  { updated: number },
  UpdateStockBulkPayload,
  { rejectValue: AxiosErrorPayload }
>(
  "rawMaterials/updateRawMaterialsBulk",
  async (payload, { rejectWithValue }) => {
    const { warehouseId, updates } = payload;

    if (!warehouseId || !updates.length)
      return rejectWithValue({
        message: "locationId and updates are required",
        status: 400,
      });

    try {
      const { data } = await axios.patch(
        `${API_BASE_URL}/warehouseinventory/inventory/bulk`,
        {
          updates: updates.map((u) => ({
            randomId: u.randomId,
            warehouseId: warehouseId,
            physicalStock: u.physicalStock,
          })),
        },
        {
          params: {
            updated_by: "",
            description: "",
          },
          timeout: 30000,
        }
      );

      return { updated: data.updated || updates.length };
    } catch (e) {
      const err = e as AxiosError;
      return rejectWithValue(parseAxiosError(err));
    }
  }
);

export interface ImportRawMaterialPayload {
  file: File;
  locationId: string;
}

export const importRawMaterialStock = createAsyncThunk<
  ImportStockResponse,
  ImportRawMaterialPayload,
  { rejectValue: AxiosErrorPayload }
>(
  "rawMaterials/importRawMaterialStock",
  async ({ file, locationId }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = `${API_BASE_URL}/warehouseinventory/importstocks?locationId=${encodeURIComponent(
        locationId
      )}&updated_by=`;
      const { data } = await axios.post<ImportStockResponse>(url, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000,
      });
      return data;
    } catch (e) {
      const err = e as AxiosError;
      return rejectWithValue(parseAxiosError(err));
    }
  }
);
// newly add this part 29 7 1
export interface DownloadExportCSVArgs {
  locationId: string;
  aliasName?: string;
  purchasecategoryName?: string;
  purchasesubcategoryName?: string;
  itemName?: string;
  varianceName?: string;
}
// export const downloadExportCSV = createAsyncThunk<
//   void,
//   void,
//   { state: RootState; rejectValue: AxiosErrorPayload }
// >(replace the part 29 7 1
export const downloadExportCSV = createAsyncThunk<
  void,
  DownloadExportCSVArgs,
  { rejectValue: AxiosErrorPayload }
>(

  "rawMaterials/downloadExportCSV",
  // async (_, { getState, rejectWithValue }) => {
  // replace the one line 29 7 1
  async (params, { rejectWithValue }) => {
    try {
      // const state = getState() as { rawMaterials: RawMaterialsState };
      // const params = { ...state.rawMaterials.filters };
      const clean: Record<string, string | number | boolean | string[]> = {};
      Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (["purchasecategoryName", "purchasesubcategoryName", "itemName", "varianceName", "locationId", "createdDate"].includes(k)) {
          if (Array.isArray(v) && v.length) clean[k] = v.join(",");
          else if (typeof v === "string" && v.trim()) clean[k] = v;
        } else if (k === "includeDropdowns") {
          clean[k] = Boolean(v);
        } else {
          clean[k] = v;
        }
      });

      const url = `${API_BASE_URL}/warehouseinventory/export`;
      const response = await axios.get(url, { params: clean, responseType: "blob" });
      const filename = getFilenameFromContentDisposition(
        response.headers["content-disposition"],
        "export.csv"
      );
      await downloadBlobSafely(new Blob([response.data], { type: response.data?.type || "text/csv" }), filename);
    } catch (e) {
      const err = e as AxiosError;
      return rejectWithValue(parseAxiosError(err));
    }
  }
);

export const downloadSampleCSV = createAsyncThunk<void, void, { rejectValue: AxiosErrorPayload }>(
  "rawMaterials/downloadSampleCSV",
  async (_, { rejectWithValue }) => {
    try {
      const url = `${API_BASE_URL}/warehouseinventory/export/sample`;
      const response = await axios.get(url, { responseType: "blob" });
      const filename = getFilenameFromContentDisposition(
        response.headers["content-disposition"],
        "sample_rmstock.csv"
      );
      await downloadBlobSafely(new Blob([response.data], { type: response.data?.type || "text/csv" }), filename);
    } catch (e) {
      const err = e as AxiosError;
      return rejectWithValue(parseAxiosError(err));
    }
  }
);

const rawMaterialsSlice = createSlice({
  name: "rawMaterials",
  initialState,
  reducers: {
    resetRawMaterials(state) {
      state.accumulatedRawMaterials = [];
      state.filteredRawMaterials = null;
      state.filters.page = 1;
      state.lastFetchParams = "";
    },
    toggleColumn(state, action: PayloadAction<string>) {
      const col = action.payload;
      state.visibleColumns[col] = !state.visibleColumns[col];
    },
    clearAllFilters(state) {
      state.filters = { ...initialState.filters };
      state.accumulatedRawMaterials = [];
      state.filteredRawMaterials = null;
      state.lastFetchParams = "";
    },
 
    setFilter<K extends keyof RawMaterialsState["filters"]>(
      state: RawMaterialsState,
      action: PayloadAction<{
        field: K;
        value: RawMaterialsState["filters"][K];
      }>
    ) {
      const { field, value } = action.payload;
 
      if (field === "page") {
        state.filters.page = action.payload.value as RawMaterialsState["filters"]["page"];
        return;
      }
      state.filters[field] = value;
      state.accumulatedRawMaterials = [];
      state.filteredRawMaterials = null;
      state.filters.page = 1;
      state.lastFetchParams = "";
    },
    /** Update only the page cursor — does NOT wipe accumulated rows. */
    setPageOnly(state, action: PayloadAction<number>) {
      state.filters.page = action.payload;
    },
    setOpenSnackbar(state, action: PayloadAction<boolean>) {
      state.openSnackbar = action.payload;
    },
    setOpenDownloadDialog(state, action: PayloadAction<boolean>) {
      state.openDownloadDialog = action.payload;
    },
    setEditMessage(state, action: PayloadAction<string>) {
      state.editMessage = action.payload;
    },
    setOpenDialog(state, action: PayloadAction<boolean>) {
      state.openDialog = action.payload;
    },
    setOpenModal(state, action: PayloadAction<boolean>) {
      state.openModal = action.payload;
    },
    setUpdatedStocks(
      state,
      action: PayloadAction<RawMaterialsState["updatedStocks"]>
    ) {
      state.updatedStocks = action.payload;
    },
    setChanges(state, action: PayloadAction<RawMaterialsState["changes"]>) {
      state.changes = action.payload;
    },
    setChangedRows(
      state,
      action: PayloadAction<RawMaterialsState["changedRows"]>
    ) {
      state.changedRows = action.payload;
    },
  },
  extraReducers: (builder) => {
    // fetchWarehouses
    builder.addCase(fetchWarehouses.pending, (state) => {
      state.warehousesLoading = true;
    });
    builder.addCase(fetchWarehouses.fulfilled, (state, action) => {
      state.warehousesLoading = false;
      state.warehouses = action.payload;
    });
    builder.addCase(fetchWarehouses.rejected, (state, action) => {
      state.warehousesLoading = false;
      state.error = action.payload?.message || "Failed to fetch warehouses";
    });

    // fetchRawMaterials
    builder.addCase(fetchRawMaterials.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchRawMaterials.fulfilled, (state, action) => {
      state.loading = false;
      const { data, field, append, params, isFilterRequest } = action.payload;
      if (!isFilterRequest) state.lastFetchParams = params;

      if (field) {
        state.filterOptions[field] = {
          ...state.filterOptions[field],
          values: append
            ? [...state.filterOptions[field].values, ...data.dropdown_values[field].values]
            : data.dropdown_values[field].values,
          hasMore: data.dropdown_values[field].hasMore,
          total: data.dropdown_values[field].total,
          count: data.dropdown_values[field].count,
          page: data.dropdown_values[field].page,
          limit: data.dropdown_values[field].limit,
        };
      } else {
        if (!append) {
          state.accumulatedRawMaterials = data.results || [];
          if (data.dropdown_values) {
            state.filterOptions = data.dropdown_values;
          }
        } else {
          const newItems = (data.results || []).filter(
            (newItem) => !state.accumulatedRawMaterials.some((item) => item.randomId === newItem.randomId)
          );
          state.accumulatedRawMaterials = [...state.accumulatedRawMaterials, ...newItems];
        }
        state.filteredRawMaterials = {
          total: data.total,
          page: data.page,
          limit: data.limit,
          // count: data.count,
          // replace the part 29 7 1
          count: state.accumulatedRawMaterials.length,
          items: state.accumulatedRawMaterials,
          hasMore: data.total > state.accumulatedRawMaterials.length,
        };
      }
    });
    builder.addCase(fetchRawMaterials.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload?.message || "Failed to fetch data";
    });

    // importRawMaterialStock
    builder.addCase(importRawMaterialStock.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(importRawMaterialStock.fulfilled, (state, action) => {
      state.loading = false;
      state.openSnackbar = true;
      state.editMessage = action.payload.message;
    });
    builder.addCase(importRawMaterialStock.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload?.message || "Failed to import stock";
    });

    // updateRawMaterialStock
    builder.addCase(updateRawMaterialStock.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(updateRawMaterialStock.fulfilled, (state, action) => {
      state.loading = false;
      state.openSnackbar = true;
      state.editMessage = "Stock updated successfully";
      const { randomId, physicalStock, systemStock, previousSystemStock } = action.payload;

      if (state.filteredRawMaterials) {
        // Create a new array mapping to ensure React detects the state change
        state.filteredRawMaterials.items = state.filteredRawMaterials.items.map((i) =>
          i.randomId === randomId
            ? {
              ...i,
              physicalStock: physicalStock,
              stockQuantity: systemStock,
              previousSystemStock: previousSystemStock,
            }
            : i
        );
      }

      // Create a new array mapping for accumulatedRawMaterials as well
      state.accumulatedRawMaterials = state.accumulatedRawMaterials.map((i) =>
        i.randomId === randomId
          ? {
            ...i,
            physicalStock: physicalStock,
            stockQuantity: systemStock,
            previousSystemStock: previousSystemStock,
          }
          : i
      );
    });
    builder.addCase(updateRawMaterialStock.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload?.message || "Failed to update stock";
    });

    // updateRawMaterialsBulk
    builder.addCase(updateRawMaterialsBulk.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(updateRawMaterialsBulk.fulfilled, (state, action) => {
      state.loading = false;
      state.openSnackbar = true;
      state.editMessage = "Bulk stock updated successfully";
    });
    builder.addCase(updateRawMaterialsBulk.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload?.message || "Failed to bulk update stock";
    });
  },
});

export const {
  resetRawMaterials,
  clearAllFilters,
  toggleColumn,
  setFilter,
  setPageOnly,
  setOpenSnackbar,
  setOpenDownloadDialog,
  setEditMessage,
  setOpenDialog,
  setOpenModal,
  setUpdatedStocks,
  setChanges,
  setChangedRows,
} = rawMaterialsSlice.actions;

export const selectLoading = (state: RootState) => state.rawMaterials.loading;
export const selectFilters = (state: RootState) => state.rawMaterials.filters;
export const selectFilterOptions = (state: RootState) =>
  state.rawMaterials.filterOptions;
export const selectFilteredRawMaterials = (state: RootState) =>
  state.rawMaterials.filteredRawMaterials;
export const selectError = (state: RootState) => state.rawMaterials.error;
export const selectHasMore = (state: RootState) =>
  state.rawMaterials.filteredRawMaterials?.hasMore ?? false;
export const selectWarehouses = (state: RootState) =>
  state.rawMaterials.warehouses;
export const selectWarehousesLoading = (state: RootState) =>
  state.rawMaterials.warehousesLoading;
export const selectOpenSnackbar = (state: RootState) =>
  state.rawMaterials.openSnackbar;
export const selectOpenDownloadDialog = (state: RootState) =>
  state.rawMaterials.openDownloadDialog;
export const selectEditMessage = (state: RootState) =>
  state.rawMaterials.editMessage;
export const selectOpenDialog = (state: RootState) =>
  state.rawMaterials.openDialog;
export const selectOpenModal = (state: RootState) =>
  state.rawMaterials.openModal;
export const selectUpdatedStocks = (state: RootState) =>
  state.rawMaterials.updatedStocks;
export const selectChanges = (state: RootState) => state.rawMaterials.changes;
export const selectChangedRows = (state: RootState) =>
  state.rawMaterials.changedRows;
export const selectVisibleColumns = (state: RootState) => state.rawMaterials.visibleColumns;

export default rawMaterialsSlice.reducer;
