import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import axios, { AxiosError } from "axios";
import { RootState } from "@/redux/store";
import { getApiErrorMessage } from "@/components/Inventory/shared/apiError";
import {
  downloadBlobSafely,
  getFilenameFromContentDisposition,
} from "@/components/Inventory/shared/downloadFile";

export type ItemsSliceState = ItemsState;

// Uses the production URL for production builds, local URL otherwise —
// previously always used NEXT_PUBLIC_LOCAL_URL regardless of environment.
export const API_BASE_URL =
  (process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_PRODUCTION_URL
    : process.env.NEXT_PUBLIC_LOCAL_URL) || "";

interface UpdateStockResponse {
  itemCode: string;
  varianceName: string;
  previousSystemStock: number;
  updatedSystemStock: number;
  locationId: string;
  updatedBy: string;
  adjustedDate: string;
  adjustedTime: string;
}

interface FilterOption {
  values: IdName[];
  total: number;
  page: number;
  limit: number;
  count: number;
  searchFilter: string | null;
  hasMore: boolean;
  loading: boolean;
}

interface IdName {
  id: string;
  name?: string;
}

export interface Item {
  id: string;
  itemCode: string;
  category: IdName;
  subCategory: IdName;
  itemName: IdName;
  varianceName: IdName;
  closingQty?: string;
  systemStock: number;
  systemStockSo?: number;
  physicalStock: number;
  previousSystemStock: number;
  branch?: string;
  branchWiseStocks?: {
    aliasName: string;
    branchName: string;
    branchAlias: string;
    systemStock: number;
    physicalStock: number;
    previousSystemStock: number;
  }[];
}

interface FilterOptionsResponse {
  category: FilterOption;
  subCategory: FilterOption;
  itemName: FilterOption;
  varianceName: FilterOption;
}

interface FilteredItemsResponse {
  total: number;
  page: number;
  limit: number;
  count: number;
  items: Item[];
  hasMore?: boolean;
  message?: string;
}

export interface Branch {
  locationId: string;
  locationName: string;
  aliasName: string;
}

export interface UpdateStockArg {
  itemCode: string;
  locationId: string;
  physicalStock: number;
  queryDate?: string;
  updatedBy?: string;
  description?: string;
}

interface ItemsState {
  branches: Branch[];
  queryDate: string | null;
  filterOptions: FilterOptionsResponse;
  filteredItems: FilteredItemsResponse | null;
  accumulatedItems: Item[];
  loading: boolean;
  error: string | null;
  filters: {
    page: number;
    limit: number;
    branch: string;
    category?: string;
    subCategory?: string;
    itemName?: string;
    varianceName?: string;
    date?: string;
  };
  lastFetchParams: string;
  visibleColumns: Record<string, boolean>;
}

interface BranchResponse {
  locationId: string;
  locationName: string;
  aliasName: string;
}

interface FetchItemsResponse {
  filterOptions?: FilterOptionsResponse;
  filteredItems?: FilteredItemsResponse;
  queryDate?: string;
}

const initialVisibleColumnsState = {
  sno: true,
  itemCode: true,
  category: false,
  subCategory: false,
  itemName: true,
  varianceName: true,
  previousSystemStock: true,
  systemStock: true,
  physicalStock: true,
};

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

const initialState: ItemsState = {
  branches: [],
  queryDate: null,
  filterOptions: {
    category: initialFilterOption,
    subCategory: initialFilterOption,
    itemName: initialFilterOption,
    varianceName: initialFilterOption,
  },
  filteredItems: null,
  accumulatedItems: [],
  loading: false,
  error: null,
  filters: {
    page: 1,
    limit: 30,
    branch: "",
  },
  lastFetchParams: "",
  visibleColumns: initialVisibleColumnsState,
};

export interface FetchItemsArg {
  params?: Partial<ItemsState["filters"]> & { include_filter_options?: boolean };
  field?: keyof FilterOptionsResponse;
  append?: boolean;
  page?: number;
  skipCache?: boolean;
}

type AxiosErrorPayload = {
  message: string;
  status: number | null;
  raw?: unknown;
};

export const parseAxiosError = (err: AxiosError): AxiosErrorPayload => ({
  message: getApiErrorMessage(err, "Unknown error occurred"),
  status: err.response?.status ?? null,
  raw: err.response?.data ?? null,
});

export const fetchBranches = createAsyncThunk<Branch[], void, { rejectValue: AxiosErrorPayload }>(
  "items/fetchBranches",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get<BranchResponse[]>(`${API_BASE_URL}/outletinventory/locations/all`);
      return response.data.map(({ locationId, locationName, aliasName }) => ({ locationId, locationName, aliasName }));
    } catch (error) {
      return rejectWithValue(parseAxiosError(error as AxiosError));
    }
  }
);

export const fetchItems = createAsyncThunk<
  { data: FetchItemsResponse; field?: keyof FilterOptionsResponse; append?: boolean; params: string },
  FetchItemsArg | void,
  { state: RootState; rejectValue: AxiosErrorPayload }
>("items/fetchItems", async (arg, { getState, rejectWithValue }) => {
  try {
    const state = getState();
    let params = { ...state.items.filters };
    let field: keyof FilterOptionsResponse | undefined;
    let append = false;
    let skipCache = false;
    let includeFilterOptions = false;

    if (arg) {
      const {
        params: overrideParams,
        field: argField,
        append: argAppend,
        page,
        skipCache: argSkipCache
      } = arg;

      field = argField;
      append = argAppend || false;
      skipCache = argSkipCache || false;

      if (overrideParams) {
        params = { ...params, ...overrideParams };
        if ('include_filter_options' in overrideParams) {
          includeFilterOptions = Boolean(overrideParams.include_filter_options);
        }
      }
      if (page !== undefined) params.page = page;
      else if (append) params.page = state.items.filters.page + 1;
    }

    if (!params.branch)
      return rejectWithValue({ message: "Branch parameter is required", status: 400, raw: null });

    const paramsKey = JSON.stringify({ ...params, field, append });
    if (!skipCache && state.items.lastFetchParams === paramsKey && !field) {
      return rejectWithValue({ message: "Duplicate request", status: 409, raw: null });
    }

    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    );

    const shouldIncludeFilters = includeFilterOptions || field !== undefined;

    // const apiParams = {
    //   ...cleanParams,
    //   date: state.items.queryDate,
    //   include_filter_options: shouldIncludeFilters,
    // };
    // repalce the part 10 8 1
const requestDate = cleanParams.date || state.items.queryDate;

const apiParams = {
  ...cleanParams,
  queryDate: requestDate,
  include_filter_options: shouldIncludeFilters,
};

console.log("REQUEST_DATE:", requestDate);
console.log("STATE_QUERY_DATE:", state.items.queryDate);
console.log("API_PARAMS:", apiParams);

    const response = await axios.get<FetchItemsResponse>(
      `${API_BASE_URL}/outletinventory/`,
      {
        params: apiParams,
        timeout: 30000,
      }
    );

    return { data: response.data, field, append, params: paramsKey };
  } catch (error) {
    const err = error as AxiosError;
    if (err.code === "ECONNABORTED")
      return rejectWithValue({
        message: "Request timeout - please try again",
        status: 408,
      });
    return rejectWithValue(parseAxiosError(err));
  }
});

export const updateStock = createAsyncThunk<
  { data: UpdateStockResponse; itemCode: string; locationId: string },
  UpdateStockArg,
  { state: RootState; rejectValue: AxiosErrorPayload }
>(
  "items/updateStock",
  async (arg, { rejectWithValue }) => {
    try {
      const { itemCode, locationId, physicalStock, queryDate, updatedBy, description } = arg;

      if (!itemCode || !locationId || physicalStock < 0) {
        return rejectWithValue({
          message: "itemCode and locationId are mandatory, physicalStock must be >= 0",
          status: 400,
        });
      }

      const params: Record<string, string | number> = {
        locationId,
        physical_stock: physicalStock,
      };

      if (queryDate) params.query_date = queryDate;
      if (updatedBy) params.updated_by = updatedBy;
      if (description) params.description = description;

      const response = await axios.patch<UpdateStockResponse>(
        `${API_BASE_URL}/outletinventory/${itemCode}/update-stock`,
        {},
        { params, timeout: 30000 }
      );

      return { data: response.data, itemCode, locationId };
    } catch (error) {
      const err = error as AxiosError;
      if (err.code === "ECONNABORTED") {
        return rejectWithValue({ message: "Request timeout", status: 408 });
      }
      return rejectWithValue(parseAxiosError(err));
    }
  }
);

export interface UpdateStockBulkArg {
  updates: {
    itemCode: string;
    locationId: string;
    physical_stock: number;
  }[];
  updatedBy?: string;
  description?: string;
}

export const updateStockBulk = createAsyncThunk<
  { updated: number; data: UpdateStockResponse[] },
  UpdateStockBulkArg,
  { state: RootState; rejectValue: AxiosErrorPayload }
>(
  "items/updateStockBulk",
  async (arg, { rejectWithValue }) => {
    try {
      const { updates, updatedBy, description } = arg;

      if (!updates || updates.length === 0) {
        return rejectWithValue({
          message: "No updates provided",
          status: 400,
        });
      }

      const response = await axios.patch(
        `${API_BASE_URL}/outletinventory/update-stock/bulk`,
        { updates },
        {
          params: {
            updated_by: updatedBy || "",
            description: description || "", // Removed hardcoded "B"
          },
          timeout: 30000,
        }
      );

      return {
        updated: response.data.updated,
        data: response.data.data,
      };
    } catch (error) {
      const err = error as AxiosError;
      if (err.code === "ECONNABORTED")
        return rejectWithValue({ message: "Request timeout", status: 408 });
      return rejectWithValue(parseAxiosError(err));
    }
  }
);

interface ImportItemsPayload {
  file: File;
  branchAlias: string;
}

export const importItems = createAsyncThunk<
  { message: string },
  ImportItemsPayload,
  { rejectValue: AxiosErrorPayload }
>(
  "items/importItems",
  async ({ file, branchAlias }, { rejectWithValue }) => {
    try {
      const updatedBy = "";
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post<{ message: string }>(
        `${API_BASE_URL}/outletinventory/importstock?locationId=${encodeURIComponent(
          branchAlias
        )}&updated_by=${encodeURIComponent(updatedBy)}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 }
      );

      return response.data;
    } catch (error) {
      return rejectWithValue(parseAxiosError(error as AxiosError));
    }
  }
);

interface DownloadCSVArgs {
  selectedBranches: string;
  searchParams: {
    category?: string[];
    subCategory?: string[];
    itemName?: string[];
    varianceName?: string[];
    queryDate?: string;
  };
}

interface DownloadCSVResult {
  success: boolean;
}

export const downloadCSV = createAsyncThunk<
  DownloadCSVResult,
  DownloadCSVArgs,
  { state: RootState; rejectValue: string }
>(
  "items/downloadCSV",
  async ({ selectedBranches, searchParams }, thunkAPI) => {
    try {
      if (!selectedBranches) {
        return thunkAPI.rejectWithValue("Please select a branch before downloading CSV.");
      }

      const state = thunkAPI.getState() as RootState;
      const branch = state.items.branches.find(b => b.locationId === selectedBranches);

      const aliasName = branch?.aliasName || "branch";
      const params = new URLSearchParams({ branch: selectedBranches });

      if (searchParams.category?.length)
        params.append("category", searchParams.category.join(","));
      if (searchParams.subCategory?.length)
        params.append("subCategory", searchParams.subCategory.join(","));
      if (searchParams.itemName?.length)
        params.append("itemName", searchParams.itemName.join(","));
      if (searchParams.varianceName?.length)
        params.append("varianceName", searchParams.varianceName.join(","));
      if (searchParams.queryDate)
        params.append("date", searchParams.queryDate);

      const url = `${API_BASE_URL}/outletinventory/exportstock-csv?${params.toString()}`;
      const response = await axios.get(url, { responseType: "blob" });

      const today = new Date();
      const dateString = `${today.getDate().toString().padStart(2, "0")}-${(today.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${today.getFullYear()}`;

      const fallbackName = `${aliasName}_Outletstock_${dateString}.csv`;
      const filename = getFilenameFromContentDisposition(
        response.headers["content-disposition"],
        fallbackName
      );
      await downloadBlobSafely(
        new Blob([response.data], { type: response.data?.type || "text/csv" }),
        filename
      );

      return { success: true };
    } catch (err) {
      return thunkAPI.rejectWithValue(getApiErrorMessage(err, "Export failed. Please try again."));
    }
  }
);

export const downloadSampleCSV = createAsyncThunk<void, void, { rejectValue: string }>(
  "items/downloadSampleCSV",
  async (_, { rejectWithValue }) => {
    try {
      const url = `${API_BASE_URL}/outletinventory/export/sample`;
      const response = await axios.get(url, { responseType: "blob" });
      const filename = getFilenameFromContentDisposition(
        response.headers["content-disposition"],
        "sample_outletstock.csv"
      );
      await downloadBlobSafely(new Blob([response.data], { type: response.data?.type || "text/csv" }), filename);
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, "Sample download failed. Please try again."));
    }
  }
);

const itemsSlice = createSlice({
  name: "items",
  initialState: initialState,
  reducers: {
    setFilter<K extends keyof ItemsState["filters"]>(
      state: ItemsState,
      action: PayloadAction<{ key: K; value: ItemsState["filters"][K] }>
    ) {
      const { key, value } = action.payload;

      if (key !== "page") {
        state.accumulatedItems = [];
        state.filteredItems = null;
        state.filters.page = 1;
        state.lastFetchParams = "";
      }

      state.filters[key] = value;
      if (key === "date") {
        state.queryDate = value as string;
      }
    },
    toggleColumn(state, action: PayloadAction<string>) {
      const col = action.payload;
      state.visibleColumns[col] = !state.visibleColumns[col];
    },
    setMultipleFilters(state, action: PayloadAction<Partial<ItemsState["filters"]>>) {
      state.accumulatedItems = [];
      state.filteredItems = null;
      state.filters = { ...state.filters, ...action.payload, page: 1 };
      state.lastFetchParams = "";
      if (action.payload.date) {
        state.queryDate = action.payload.date;
      }
    },
    resetFilters(state) {
      state.filters = { ...initialState.filters };
      state.accumulatedItems = [];
      state.filteredItems = null;
      state.lastFetchParams = "";
    },
    resetItems(state) {
      state.accumulatedItems = [];
      state.filteredItems = null;
      state.filters.page = 1;
      state.lastFetchParams = "";
    },
    setFilterSearch(state, action: PayloadAction<{ field: keyof FilterOptionsResponse; searchFilter: string }>) {
      const { field, searchFilter } = action.payload;
      state.filterOptions[field].searchFilter = searchFilter;
      state.filterOptions[field].page = 1;
      state.filterOptions[field].hasMore = true;
    },
    clearFilterSearch(state, action: PayloadAction<keyof FilterOptionsResponse>) {
      const field = action.payload;
      state.filterOptions[field].searchFilter = null;
      state.filterOptions[field].page = 1;
      state.filterOptions[field].hasMore = true;
    },
    clearError(state) {
      state.error = null;
    },
    resetVisibleColumns(state) {
      state.visibleColumns = initialVisibleColumnsState;
    },
    setVisibleColumns(state, action: PayloadAction<Record<string, boolean>>) {
      state.visibleColumns = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranches.pending, (state) => {
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
      })
      .addCase(fetchItems.pending, (state, action) => {
        const field = action.meta.arg?.field;
        if (!field) state.loading = true;
        state.error = null;
        if (field) state.filterOptions[field].loading = true;
      })
      .addCase(fetchItems.fulfilled, (state, action) => {
        const { data, field, append, params } = action.payload;

        if (data.queryDate) {
          state.queryDate = data.queryDate;
        }

        state.loading = false;
        state.lastFetchParams = params;

        if (data.filterOptions) {
          const filterKeys: (keyof FilterOptionsResponse)[] = [
            "category",
            "subCategory",
            "itemName",
            "varianceName",
          ];

          if (field) {
            const filterData = data.filterOptions[field];
            if (filterData) {
              const newValues = append
                ? [...state.filterOptions[field].values, ...filterData.values]
                : filterData.values;

              state.filterOptions[field] = {
                ...state.filterOptions[field],
                ...filterData,
                values: newValues,
                loading: false,
                hasMore: filterData.total > newValues.length,
              };
            }
          } else {
            filterKeys.forEach((key) => {
              const filterData = data.filterOptions![key];
              if (filterData) {
                state.filterOptions[key] = {
                  ...state.filterOptions[key],
                  ...filterData,
                  values: filterData.values,
                  loading: false,
                  hasMore: filterData.total > filterData.values.length,
                };
              }
            });
          }
        }

        if (!field && data.filteredItems) {
          const sourceItems = Array.isArray(data.filteredItems.items)
            ? data.filteredItems.items
            : [];

          const newItems = sourceItems.map((item) => ({
            ...item,
            systemStock: Number(item.systemStock) || 0,
            systemStockSo: Number(item.systemStockSo) || 0,
            physicalStock: Number(item.physicalStock) || 0,
            previousSystemStock: Number(item.previousSystemStock) || 0,
            closingQty: String(item.systemStock ?? "0"),
          }));

          if (append && newItems.length > 0) {
            const existingKeys = new Set(
              state.accumulatedItems.map((i) => `${i.itemCode}_${i.varianceName}`)
            );
            const uniqueItems = newItems.filter(
              (i) => !existingKeys.has(`${i.itemCode}_${i.varianceName}`)
            );
            if (uniqueItems.length > 0) {
              state.accumulatedItems.push(...uniqueItems);
            }
          } else {
            state.accumulatedItems = newItems;
          }

          const totalFetched = state.accumulatedItems.length;
          const totalAvailable = data.filteredItems.total ?? totalFetched;
          const hasMore = totalFetched < totalAvailable && newItems.length > 0;

          state.filteredItems = {
            total: totalAvailable,
            page: data.filteredItems.page || state.filters.page,
            limit: data.filteredItems.limit || state.filters.limit,
            count: totalFetched,
            items: state.accumulatedItems,
            hasMore,
            message: data.filteredItems.message,
          };

          state.filters.page = data.filteredItems.page || state.filters.page;
        }
      })
      .addCase(fetchItems.rejected, (state, action) => {
        state.loading = false;
        if ((action.payload as AxiosErrorPayload)?.status !== 409)
          state.error = (action.payload as AxiosErrorPayload)?.message || "Failed to fetch items";
        const field = action.meta.arg?.field;
        if (field) state.filterOptions[field].loading = false;
        else Object.keys(state.filterOptions).forEach((k) => {
          state.filterOptions[k as keyof FilterOptionsResponse].loading = false;
        });
      })
      .addCase(importItems.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(importItems.fulfilled, (state) => {
        state.loading = false;
        state.error = null;
      })
      .addCase(importItems.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || "Import failed";
      })
      .addCase(updateStock.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateStock.fulfilled, (state, action) => {
        state.loading = false;

        const updated = action.payload.data;
        const { itemCode, locationId } = action.payload;

        state.accumulatedItems = state.accumulatedItems.map((item) => {
          if (item.itemCode !== itemCode) return item;

          const updatedBranchStocks = item.branchWiseStocks?.map((b) =>
            b.aliasName === locationId
              ? {
                ...b,
                systemStock: updated.updatedSystemStock,
                physicalStock: updated.updatedSystemStock,
                previousSystemStock: updated.previousSystemStock,
              }
              : b
          );

          return {
            ...item,
            systemStock: updated.updatedSystemStock,
            physicalStock: updated.updatedSystemStock,
            previousSystemStock: updated.previousSystemStock,
            branchWiseStocks: updatedBranchStocks ?? item.branchWiseStocks,
          };
        });

        if (state.filteredItems) {
          state.filteredItems.items = state.accumulatedItems;
          state.filteredItems.count = state.accumulatedItems.length;
        }
      })
      .addCase(updateStock.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as AxiosErrorPayload)?.message || "Failed to update stock";
      })
      .addCase(updateStockBulk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateStockBulk.fulfilled, (state, action) => {
        state.loading = false;
        const updates = action.payload.data;

        updates.forEach((updated) => {
          const { itemCode, locationId } = updated;

          state.accumulatedItems = state.accumulatedItems.map((item) => {
            if (item.itemCode !== itemCode) return item;

            const updatedBranchStocks = item.branchWiseStocks?.map((b) =>
              b.aliasName === locationId
                ? {
                  ...b,
                  systemStock: updated.updatedSystemStock,
                  physicalStock: updated.updatedSystemStock,
                  previousSystemStock: updated.previousSystemStock,
                }
                : b
            );

            return {
              ...item,
              systemStock: updated.updatedSystemStock,
              physicalStock: updated.updatedSystemStock,
              previousSystemStock: updated.previousSystemStock,
              branchWiseStocks: updatedBranchStocks ?? item.branchWiseStocks,
            };
          });
        });

        if (state.filteredItems) {
          state.filteredItems.items = state.accumulatedItems;
          state.filteredItems.count = state.accumulatedItems.length;
        }
      })
      .addCase(updateStockBulk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || "Failed to update stock";
      });
  },
});

export const {
  setFilter,
  setMultipleFilters,
  resetFilters,
  resetItems,
  setFilterSearch,
  clearFilterSearch,
  clearError,
  toggleColumn,
  resetVisibleColumns,
  setVisibleColumns,
} = itemsSlice.actions;

export const selectBranches = (state: RootState) => state.items.branches;
export const selectItems = (state: RootState) => state.items.accumulatedItems || [];
export const selectDataLoading = (state: RootState) => state.items.loading;
export const selectFilters = (state: RootState) => state.items.filters;
export const selectFilterOptions = (state: RootState) => state.items.filterOptions;
export const selectFilteredItems = (state: RootState) => state.items.filteredItems;
export const selectError = (state: RootState) => state.items.error;
export const selectHasMore = (state: RootState) => state.items.filteredItems?.hasMore || false;
export const selectVisibleColumns = (state: RootState) => state.items.visibleColumns;

export default itemsSlice.reducer;
