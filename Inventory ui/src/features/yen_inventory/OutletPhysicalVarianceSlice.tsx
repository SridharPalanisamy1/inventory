import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { API_BASE_URL } from "./OuletePhysicalStockSlice";
import { outletVarianceBase, setOutletStockType } from "./outletStockTypeSlice";
// ================== Interfaces ==================
export interface UpdateResponse {
  varianceName: string;
  branchAlias: string;
  updatedPhysicalStock: number;
  updatedSystemStock: number;
  error: string | null;
}

export interface FilterOption {
  id: string;
  name: string;
}

export interface UpdateStockPayload {
  varianceNames: string[];
  branchAliases: string[];
  newPhysicalStocks: number[];
}

export interface Branch {
  locationId: string;
  locationName: string;
  aliasName: string;
}

export type ApprovalStatus =
  | "approved"
  | "pendingApproval"
  | "noVariance"
  | "notAvailable"
  | "error"
  | "invalid"
  | string;

export interface ApproveItemParams {
  itemCode: string;
  locationId: string;
  queryDate?: string;
  approvedBy?: string;
  description?: string;
  adjustmentMode?: "ADJUST_SYSTEM" | "KEEP_SYSTEM";
}

export interface BulkApproveItemsParams {
  itemCodes: string[];
  locationId: string;
  queryDate?: string;
  approvedBy?: string;
  description?: string;
  adjustmentMode?: "ADJUST_SYSTEM" | "KEEP_SYSTEM";
}

export interface ApproveApiResult {
  itemCode?: string;
  locationId?: string;
  success?: boolean;
  message?: string;
  approvalStatus?: ApprovalStatus;
  approvalButton?: boolean;
  status?: string;
  updatedSystemStock?: number;
  varianceAfterApproval?: number;
  data?: unknown;
  [key: string]: unknown;
}

export interface BulkApproveApiResult {
  message: string;
  locationId: string;
  queryDate: string;
  totalRequested: number;
  approvedCount: number;
  alreadyApprovedCount: number;
  noVarianceCount: number;
  notAvailableCount: number;
  errorCount: number;
  results: ApproveApiResult[];
}

export interface ApproveAllBranchParams {
  locationId: string;
  queryDate?: string;
  approvedBy?: string;
  description?: string;
  adjustmentMode?: "ADJUST_SYSTEM" | "KEEP_SYSTEM";
  varianceThresholdPct?: number;
  varianceThresholdUnits?: number;
}

export interface ApproveAllVerificationItem {
  itemCode: string;
  verified: boolean;
  inventoryUpdated: boolean;
  approvalCreated: boolean;
  pendingCleared: boolean;
}

export interface ApproveAllBranchResult {
  success: boolean;
  dbVerified: boolean;
  message: string;

  locationId: string;
  closingDocId?: string;

  totalInClosing: number;

  approved: number;
  verified: number;

  alreadyApproved?: number;
  autoVerified: number;
  skipped: number;
  flagged: number;
  failed: number;

  // Failed items only: exact reason + what to do
  failedReasons?: Array<{ itemCode: string; reason: string; action: string }>;

  flaggedItems: Array<{
    itemCode: string;
    variance: number;
    systemQty: number;
    reason: string;
  }>;

  failedItems: Array<{
    itemCode: string;
    error?: string;
    message?: string;
  }>;

  verificationResults: ApproveAllVerificationItem[];
  verificationFailedItems: ApproveAllVerificationItem[];
}

export interface PendingCodesResult {
  locationId: string;
  itemCodes: string[];
  total: number;
  totalInClosing?: number;
  alreadyApproved?: number;
  closingDocId?: string | null;
  closingDate?: string;
  message?: string;
}

export interface SearchFilters {
  page: number;
  limit: number;
  categoryPage?: number;
  categoryLimit?: number;
  subCategoryPage?: number;
  subCategoryLimit?: number;
  itemNamePage?: number;
  itemNameLimit?: number;
  varianceNamePage?: number;
  varianceNameLimit?: number;
  includeSalesReturn: boolean;
  includeWastageReturn: boolean;
  includeStockTransfer: boolean;
  locationId?: string;
  itemName?: string[];
  varianceName?: string[];
  category?: string[];
  subCategory?: string[];
  queryDate?: string;
  categorySearch?: string;
  subCategorySearch?: string;
  itemNameSearch?: string;
  varianceNameSearch?: string;
  include_filter_options?: boolean;
  only_filter_options?: boolean;
  // newly add this 14 8 1
  sortField?: string;
  sortOrder?: "asc" | "desc";
}

export interface Branchitem {
  id: string;
  category: string;
  subCategory: string;
  itemName: string;
  varianceName: string;
  itemCode: string;

  closingStockQty: string;
  openingStockQty: string;
  stockStatus: "available" | "out_of_stock" | "unknown";
  received: string;
  dispatchedQty: string;
  salesQty: string;
  salesReturn: string;
  wastageReturnQty: string;
  warehouseReturnQty: string;
  stockTransferInQty: string;
  stockTransferOutQty: string;

  // Existing UI compatibility fields
  currentSystemQty: string;
  stockVariance: string;
  physicalVariance: string;
  updatedCurrentSystemQty: string;
  physicalClosingQty: string;

  // New backend fields
  approvalStatus: ApprovalStatus;
  status?: string;
  approveButton?: boolean;
  canApprove?: boolean;
  stockSource?: string;

  currentInventorySystemStock?: string | number;
  currentInventoryPhysicalStock?: string | number;
  systemStock?: string | number | null;
  physicalStock?: string | number | null;
  updatedCurrentSystem?: string | number | null;
  physicalClosing?: string | number | null;
  variance?: string | number | null;
  systemStockAfter?: string | number | null;

  adjustedDate?: string;
  adjustedTime?: string;
  approvedBy?: string;
  description?: string;

  receivedQty?: string | number;
  salesReturnQty?: string | number;
  // newly add this line 13 8 2
  hasEditHistory?: boolean;

  [key: string]: string | number | boolean | null | undefined;
}

interface Change {
  itemName: string;
  varianceName: string;
  locationName: string;
  field: string;
  newValue: string;
}

export interface EditableRow {
  isEditing?: boolean;
  physicalClosingQty?: string;
  [key: string]: boolean | string | undefined;
}

interface FilterFieldState {
  values: FilterOption[];
  page: number;
  total: number;
  loading: boolean;
  searchFilter?: string;
  search?: string;
  hasMore?: boolean;
}

export interface FilterOptionsState {
  location: string[];
  category: FilterFieldState;
  subCategory: FilterFieldState;
  itemName: FilterFieldState;
  varianceName: FilterFieldState;
}

export interface StockAdjustment {
  _id: number;
  itemId: string;
  itemName: string;
  varianceName: string;
  category: string;
  subCategory: string;
  currentSystemQty: string;
  physicalClosingQty: string;
  updatedCurrentSystemQty: string;
  stockVariance: string;
  approvalStatus: string;
  description: string | null;
  adjustedDate: string;
  adjustedTime: string;
  approvedBy: string;
  branch: string;
  date: string;
}

export interface SearchParams {
  itemName: string[];
  varianceName: string[];
  category: string[];
  subCategory: string[];
  location?: string[];
  queryDate?: string;
}

// export interface FetchParams {
//   page?: number;
//   limit?: number;
//   locationId: string;
//   category?: string[];
//   subCategory?: string[];
//   itemName?: string[];
//   varianceName?: string[];
//   queryDate?: string;
//   include_filter_options?: boolean;
//   only_filter_options?: boolean;
//   categoryPage?: number;
//   subCategoryPage?: number;
//   itemNamePage?: number;
//   varianceNamePage?: number;
//   categoryLimit?: number;
//   subCategoryLimit?: number;
//   itemNameLimit?: number;
//   varianceNameLimit?: number;
//   categorySearch?: string;
//   subCategorySearch?: string;
//   itemNameSearch?: string;
//   varianceNameSearch?: string;
//   currentCategory?: string[];
//   currentSubCategory?: string[];
//   currentItemName?: string[];
//   currentVarianceName?: string[];
//   resetFilterOptions?: boolean;
// }
// replace the part 14 8 1
export interface FetchParams {
  page?: number;
  limit?: number;
  locationId: string;
  category?: string[];
  subCategory?: string[];
  itemName?: string[];
  varianceName?: string[];
  queryDate?: string;
  include_filter_options?: boolean;
  only_filter_options?: boolean;

  categoryPage?: number;
  subCategoryPage?: number;
  itemNamePage?: number;
  varianceNamePage?: number;

  categoryLimit?: number;
  subCategoryLimit?: number;
  itemNameLimit?: number;
  varianceNameLimit?: number;

  categorySearch?: string;
  subCategorySearch?: string;
  itemNameSearch?: string;
  varianceNameSearch?: string;

  currentCategory?: string[];
  currentSubCategory?: string[];
  currentItemName?: string[];
  currentVarianceName?: string[];

  resetFilterOptions?: boolean;

  // Backend sorting
  sortField?: string;
  sortOrder?: "asc" | "desc";
}
export interface ApprovedItem {
  _id: string;
  itemCode: string;
  itemName: string;
  locationId: string;
  systemStockBefore: number;
  physicalClosing: number;
  actualVariance: number;
  systemStockAfter: number;
  // approvedBy: string;
  // description: string;
  // approvedAt: string;
  // [key: string]: string | number | undefined;
  // replace the part 11 8 2
  approvedBy?: string | null;
  description?: string;
  approvedAt: string;
  status?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface ApprovedItemsResponse {
  data: ApprovedItem[];
  page: number;
  limit: number;
  total: number;
  isLoadMore: boolean;
}

interface DataState {
  // newly add this 11 8 2
  showOnlyPending: boolean;
  branches: Branch[];
  branchwise: Branchitem[];
  updatedStocks: UpdateResponse[];
  stockAdjustments: StockAdjustment[];
  loading: boolean;
  approving: boolean;
  bulkApproving: boolean;
  approveAllBranchLoading: boolean;
  loadingPendingCodes: boolean;
  error: string | null;
  total: number;
  page: number;
  limit: number;
  selectedLocation: string;
  editableRows: Record<string, EditableRow>;
  changes: Change[];
  filterOptions: FilterOptionsState;
  visibleColumns: Record<string, boolean>;
  totalCurrentSystemQty: number;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  adjustmentHistory: StockAdjustment[];
  openFirstDialog: boolean;
  openAdjustmentDialog: boolean;
  openApproveDialog: boolean;
  selectedItem: Branchitem | null;
  selectedApproveItem: Branchitem | null;
  adjustmentReason: string;
  adjustedPhysicalStock: string;
  approveDescription: string;
  openSnackbar: boolean;
  snackbarMessage: string;
  currentPage: number;
  hasMoreData: boolean;
  allItems: Branchitem[];
  totalItems: number;
  totalPages: number;
  isLoadingMore: boolean;
  isFullScreen: boolean;
  tableView: "Stock" | "Approved";
  searchParams: SearchParams;
  lastApproveResult: ApproveApiResult | null;
  lastBulkApproveResult: BulkApproveApiResult | null;
  approvedItems: {
    items: ApprovedItem[];
    page: number;
    limit: number;
    total: number;
    loading: boolean;
    error: string | null;
    filters: { branch: string; date: string };
    hasMore: boolean;
    isLoadingMore: boolean;
  };
}

export interface FetchError {
  message: string;
  status?: number;
  raw?: unknown;
}

// ================== Helpers ==================
const toStringValue = (value: unknown, fallback = "0") => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
};

const toBool = (value: unknown) => value === true || value === "true" || value === 1 || value === "1";

const getErrorMessage = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "message" in value) {
    const msg = (value as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
};

// In: features/yen_inventory/OutletPhysicalVarianceSlice.ts
// Find the mapApiItemToBranchItem function and update these specific lines:

const mapApiItemToBranchItem = (item: any): Branchitem => {
  const approvalButton = toBool(item.approvalButton ?? item.canApprove ?? false);
  const approvalStatus = String(item.approvalStatus ?? "notAvailable") as ApprovalStatus;

  const updatedCurrentSystem = item.updatedCurrentSystem ?? item.systemStock ?? null;
  const physicalClosing = item.physicalClosing ?? item.physicalStock ?? null;

  // FIX: Ensure variance falls back correctly from the backend payload
  const variance = item.variance ?? item.stockVariance ?? null;

  return {
    id: item.id || item._id || item.itemCode || "",
    category: typeof item.category === "object" ? item.category?.name ?? "" : item.category ?? "",
    subCategory: typeof item.subCategory === "object" ? item.subCategory?.name ?? "" : item.subCategory ?? "",
    itemName: typeof item.itemName === "object" ? item.itemName?.name ?? "" : item.itemName ?? "",
    varianceName: typeof item.varianceName === "object" ? item.varianceName?.name ?? "" : item.varianceName ?? "",
    itemCode: item.itemCode ?? "",

    closingStockQty: toStringValue(item.closingStockQty),
    openingStockQty: toStringValue(item.openingStockQty),
    stockStatus: item.stockStatus ?? "unknown",
    received: toStringValue(item.receivedQty),
    dispatchedQty: toStringValue(item.dispatchedQty),
    salesQty: toStringValue(item.salesQty),
    salesReturn: toStringValue(item.salesReturnQty),

    // FIX: Change wastageReceivedQty to wastageReturnQty to match the backend
    wastageReturnQty: toStringValue(item.wastageReturnQty),

    warehouseReturnQty: toStringValue(item.warehouseReturnQty),
    stockTransferInQty: toStringValue(item.stockTransferInQty),
    stockTransferOutQty: toStringValue(item.stockTransferOutQty),

    currentSystemQty: toStringValue(
      item.currentInventorySystemStock ?? item.currentSystemQty ?? item.systemStock
    ),
    stockVariance: toStringValue(variance ?? item.stockVariance),
    physicalVariance: toStringValue(variance ?? item.physicalVariance),
    updatedCurrentSystemQty: toStringValue(updatedCurrentSystem),
    physicalClosingQty: toStringValue(physicalClosing),

    approvalStatus,
    status: String(item.status ?? ""),
    approvalButton,
    canApprove: toBool(item.canApprove ?? approvalButton),
    stockSource: String(item.stockSource ?? ""),

    currentInventorySystemStock: item.currentInventorySystemStock ?? 0,
    currentInventoryPhysicalStock: item.currentInventoryPhysicalStock ?? 0,
    systemStock: item.systemStock ?? null,
    physicalStock: item.physicalStock ?? null,
    updatedCurrentSystem,
    physicalClosing,
    variance,
    systemStockAfter: item.systemStockAfter ?? null,

    approvedBy: item.approvedBy,
    description: item.description,
    // newly add this line 13 8 2
    hasEditHistory: Boolean(item.hasEditHistory),
  };
};

const updateApprovedRowInList = (
  items: Branchitem[],
  result: ApproveApiResult
): Branchitem[] => {
  const itemCode = String(result.itemCode || "");
  if (!itemCode) return items;

  return items.map((item) => {
    if (item.itemCode !== itemCode) return item;

    const nextPhysical =
      result.updatedSystemStock ??
      (result.data as any)?.systemStockAfter ??
      item.physicalClosing ??
      item.physicalClosingQty;

    return {
      ...item,
      approvalStatus: String(result.approvalStatus ?? "approved"),
      status: String(result.status ?? "approved"),
      approveButton: false,
      canApprove: false,
      systemStockAfter: nextPhysical as any,
    };
  });
};

// ================== Initial State ==================
const initialFilterField: FilterFieldState = {
  values: [],
  page: 1,
  total: 0,
  loading: false,
  searchFilter: undefined,
  hasMore: true,
};

export const initialState: DataState = {
  // newly add this 11 8 2
  showOnlyPending: false,
  branches: [],
  branchwise: [],
  updatedStocks: [],
  stockAdjustments: [],
  loading: false,
  approving: false,
  bulkApproving: false,
  approveAllBranchLoading: false,
  loadingPendingCodes: false,
  error: null,
  total: 0,
  page: 1,
  limit: 30,
  selectedLocation: "",
  editableRows: {},
  changes: [],
  filterOptions: {
    location: [],
    category: { ...initialFilterField },
    subCategory: { ...initialFilterField },
    itemName: { ...initialFilterField },
    varianceName: { ...initialFilterField },
  },
  visibleColumns: {
    "S.No": true,
    Select: true,
    "Item Name": true,
    "Variance Name": true,
    itemCode: true,
    Category: false,
    Subcategory: false,
    "Sales Return": true,
    Wastages: true,
    "Warehouse Return": true,
    "Opening-Stock": true,
    "Receiving-Stock": true,
    "Stock IN": true,
    "Stock OUT": true,
    Sales: true,
    "Calc System": true,
    "System Stock": true,
    "Physical Stock": true,
    Action: true,
    Variance: true,
    Status: true,
  },
  totalCurrentSystemQty: 0,
  sortField: undefined,
  sortOrder: undefined,
  adjustmentHistory: [],
  openFirstDialog: false,
  openAdjustmentDialog: false,
  openApproveDialog: false,
  selectedItem: null,
  selectedApproveItem: null,
  adjustmentReason: "",
  adjustedPhysicalStock: "",
  approveDescription: "",
  openSnackbar: false,
  snackbarMessage: "",
  currentPage: 1,
  hasMoreData: true,
  allItems: [],
  totalItems: 0,
  totalPages: 1,
  isLoadingMore: false,
  isFullScreen: false,
  tableView: "Stock",
  searchParams: {
    itemName: [],
    varianceName: [],
    category: [],
    subCategory: [],
    queryDate: "",
  },
  lastApproveResult: null,
  lastBulkApproveResult: null,
  approvedItems: {
    items: [],
    page: 1,
    limit: 30,
    total: 0,
    loading: false,
    error: null,
    filters: { branch: "", date: "" },
    hasMore: true,
    isLoadingMore: false,
  },
};

// ================== Async Thunks ==================
export const fetchBranches = createAsyncThunk<Branch[], void, { rejectValue: FetchError }>(
  "data/fetchBranches",
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/outletinventory/locations`);
      if (!response.ok) {
        const text = await response.text();
        return rejectWithValue({
          message: text || "Failed to fetch branches",
          status: response.status,
        });
      }

      const data: { locationId: string; locationName: string; aliasName?: string }[] =
        await response.json();

      return data.map(({ locationId, locationName, aliasName }) => ({
        locationId,
        locationName,
        aliasName: aliasName || locationName,
      }));
    } catch (error) {
      return rejectWithValue({
        message: error instanceof Error ? error.message : "Unknown fetch error",
      });
    }
  }
);

export const fetchItems = createAsyncThunk<
  {
    branchwise: Branchitem[];
    total: number;
    page: number;
    limit: number;
    totalCurrentSystemQty: number;
    filterOptions?: {
      category: FilterFieldState;
      subCategory: FilterFieldState;
      itemName: FilterFieldState;
      varianceName: FilterFieldState;
    };
    stockInfo: { date: string | null; branch: string };
    dispatchInfo: { date: string | null; branch: string };
    salesInfo: { totalSalesQty: number; branch: string };
    salesReturnInfo: { totalReturnQty: number; branch: string };
    wastageReturnInfo: { totalReturnQty: number; branch: string };
    stockTransferInfo: { totalInQty: number; totalOutQty: number; branch: string };
    isFilterOnlyFetch: boolean;
  },
  FetchParams,
  { rejectValue: FetchError }
>("data/fetchItems", async (params, { rejectWithValue }) => {
  try {
    const queryParams = new URLSearchParams();

    if (!params.only_filter_options) {
      if (params.page !== undefined) queryParams.set("page", String(params.page));
      if (params.limit !== undefined) queryParams.set("limit", String(params.limit));
    }

    queryParams.set("branch", params.locationId);
    queryParams.set(
      "include_filter_options",
      String(params.include_filter_options ?? true)
    );

    if (params.only_filter_options) queryParams.set("only_filter_options", "true");

    if (params.category?.length) queryParams.set("category", params.category.join(","));
    if (params.subCategory?.length)
      queryParams.set("subCategory", params.subCategory.join(","));
    if (params.itemName?.length) queryParams.set("itemName", params.itemName.join(","));
    // newly add this part 14 8 1
    if (params.varianceName?.length)
      queryParams.set("varianceName", params.varianceName.join(","));

    if (params.queryDate) queryParams.set("queryDate", params.queryDate);

    if (params.sortField) {
      queryParams.set("sortField", params.sortField);
    }

    if (params.sortOrder) {
      queryParams.set("sortOrder", params.sortOrder);
    }
    if (params.categoryPage !== undefined) {
      queryParams.set("categoryPage", String(params.categoryPage));
      queryParams.set("categoryLimit", String(params.categoryLimit ?? 50));
      if (params.categorySearch) queryParams.set("categorySearch", params.categorySearch);
    }

    if (params.subCategoryPage !== undefined) {
      queryParams.set("subCategoryPage", String(params.subCategoryPage));
      queryParams.set("subCategoryLimit", String(params.subCategoryLimit ?? 50));
      if (params.subCategorySearch)
        queryParams.set("subCategorySearch", params.subCategorySearch);
    }

    if (params.itemNamePage !== undefined) {
      queryParams.set("itemNamePage", String(params.itemNamePage));
      queryParams.set("itemNameLimit", String(params.itemNameLimit ?? 50));
      if (params.itemNameSearch) queryParams.set("itemNameSearch", params.itemNameSearch);
    }

    if (params.varianceNamePage !== undefined) {
      queryParams.set("varianceNamePage", String(params.varianceNamePage));
      queryParams.set("varianceNameLimit", String(params.varianceNameLimit ?? 50));
      if (params.varianceNameSearch)
        queryParams.set("varianceNameSearch", params.varianceNameSearch);
    }

    const url = `${API_BASE_URL}/${outletVarianceBase()}/?${queryParams.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      return rejectWithValue({
        message: text || "Failed to fetch items",
        status: response.status,
      });
    }

    const data = await response.json();

    const branchwise: Branchitem[] = params.only_filter_options
      ? []
      : (data.filteredItems?.items || []).map(mapApiItemToBranchItem);

    let filterOptions:
      | {
        category: FilterFieldState;
        subCategory: FilterFieldState;
        itemName: FilterFieldState;
        varianceName: FilterFieldState;
      }
      | undefined;

    if (data.filterOptions) {
      filterOptions = {
        category: {
          values: (data.filterOptions?.category?.values ?? []).map(
            (v: { id: string; name: string }) => ({ id: v.id, name: v.name })
          ),
          page: data.filterOptions?.category?.page || params.categoryPage || 1,
          total: data.filterOptions?.category?.total || 0,
          loading: false,
          searchFilter: data.filterOptions?.category?.searchFilter || params.categorySearch,
          hasMore: data.filterOptions?.category?.hasMore ?? true,
        },
        subCategory: {
          values: data.filterOptions?.subCategory?.values || [],
          page: data.filterOptions?.subCategory?.page || params.subCategoryPage || 1,
          total: data.filterOptions?.subCategory?.total || 0,
          loading: false,
          searchFilter:
            data.filterOptions?.subCategory?.searchFilter || params.subCategorySearch,
          hasMore: data.filterOptions?.subCategory?.hasMore ?? true,
        },
        itemName: {
          values: data.filterOptions?.itemName?.values || [],
          page: data.filterOptions?.itemName?.page || params.itemNamePage || 1,
          total: data.filterOptions?.itemName?.total || 0,
          loading: false,
          searchFilter: data.filterOptions?.itemName?.searchFilter || params.itemNameSearch,
          hasMore: data.filterOptions?.itemName?.hasMore ?? true,
        },
        varianceName: {
          values: data.filterOptions?.varianceName?.values || [],
          page: data.filterOptions?.varianceName?.page || params.varianceNamePage || 1,
          total: data.filterOptions?.varianceName?.total || 0,
          loading: false,
          searchFilter:
            data.filterOptions?.varianceName?.searchFilter || params.varianceNameSearch,
          hasMore: data.filterOptions?.varianceName?.hasMore ?? true,
        },
      };
    }

    return {
      branchwise,
      total: data.filteredItems?.total || 0,
      page: data.filteredItems?.page || params.page || 1,
      limit: data.filteredItems?.limit || params.limit || 50,
      totalCurrentSystemQty: data.filteredItems?.totalCurrentSystemQty || 0,
      filterOptions,
      stockInfo: data.stockInfo || { date: null, branch: params.locationId },
      dispatchInfo: data.dispatchInfo || { date: null, branch: params.locationId },
      salesInfo: data.salesInfo || { totalSalesQty: 0, branch: params.locationId },
      salesReturnInfo: data.salesReturnInfo || {
        totalReturnQty: 0,
        branch: params.locationId,
      },
      wastageReturnInfo: data.wastageReturnInfo || {
        totalReturnQty: 0,
        branch: params.locationId,
      },
      stockTransferInfo: data.stockTransferInfo || {
        totalInQty: 0,
        totalOutQty: 0,
        branch: params.locationId,
      },
      isFilterOnlyFetch: !!params.only_filter_options,
    };
  } catch (err) {
    return rejectWithValue({
      message: err instanceof Error ? err.message : "Unknown fetch error",
    });
  }
});

export const approveItem = createAsyncThunk<
  ApproveApiResult,
  ApproveItemParams,
  { rejectValue: FetchError }
>(
  "data/approveItem",
  async (
    { itemCode, locationId, queryDate, approvedBy, description, adjustmentMode },
    { rejectWithValue }
  ) => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("locationId", locationId);
      if (queryDate) queryParams.set("queryDate", queryDate);

      const response = await fetch(
        `${API_BASE_URL}/${outletVarianceBase()}/${encodeURIComponent(
          itemCode
        )}/approve?${queryParams.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approved_by: approvedBy || "Inventory",
            description: description || "",
            adjustmentMode: adjustmentMode || "ADJUST_SYSTEM",
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return rejectWithValue({
          message: text || "Failed to approve item",
          status: response.status,
        });
      }

      return await response.json();
    } catch (err) {
      return rejectWithValue({
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

export const approveBulkItems = createAsyncThunk<
  BulkApproveApiResult,
  BulkApproveItemsParams,
  { rejectValue: FetchError }
>(
  "data/approveBulkItems",
  async (
    { itemCodes, locationId, queryDate, approvedBy, description, adjustmentMode },
    { rejectWithValue }
  ) => {
    try {
      const cleanItemCodes = Array.from(
        new Set(itemCodes.map((x) => String(x || "").trim()).filter(Boolean))
      );

      if (cleanItemCodes.length === 0) {
        return rejectWithValue({
          message: "No variance items selected for approval",
          status: 400,
        });
      }

      const queryParams = new URLSearchParams();
      queryParams.set("locationId", locationId);
      if (queryDate) queryParams.set("queryDate", queryDate);

      const response = await fetch(
 `${API_BASE_URL}/${outletVarianceBase()}/approve/bulk?${queryParams.toString()}`,
                 {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemCodes: cleanItemCodes,
            approved_by: approvedBy || "Inventory",
            description: description || "",
            adjustmentMode: adjustmentMode || "ADJUST_SYSTEM",
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return rejectWithValue({
          message: text || "Failed to approve selected items",
          status: response.status,
        });
      }

      return await response.json();
    } catch (err) {
      return rejectWithValue({
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

// ─── Approve ALL items for a branch from its closing doc ──────────────────────
export const approveAllBranch = createAsyncThunk<
  ApproveAllBranchResult,
  ApproveAllBranchParams,
  { rejectValue: FetchError }
>(
  "data/approveAllBranch",
  async (
    { locationId, queryDate, approvedBy, description, adjustmentMode, varianceThresholdPct, varianceThresholdUnits },
    { rejectWithValue }
  ) => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("branch", locationId);
      if (queryDate) queryParams.set("queryDate", queryDate);

      const response = await fetch(
        `${API_BASE_URL}/${outletVarianceBase()}/approve/all?${queryParams.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approved_by: approvedBy || "Inventory",
            description: description || "Branch bulk approval",
            adjustmentMode: adjustmentMode || "ADJUST_SYSTEM",
            ...(varianceThresholdPct !== undefined && { varianceThresholdPct }),
            ...(varianceThresholdUnits !== undefined && { varianceThresholdUnits }),
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return rejectWithValue({ message: text || "Failed to approve branch", status: response.status });
      }

      return await response.json();
    } catch (err) {
      return rejectWithValue({ message: err instanceof Error ? err.message : "Unknown error" });
    }
  }
);

// ─── Fetch pending item codes for a branch (for Select All Pending) ──────────
export const fetchPendingCodes = createAsyncThunk<
  PendingCodesResult,
  { locationId: string; queryDate?: string },
  { rejectValue: FetchError }
>(
  "data/fetchPendingCodes",
  async ({ locationId, queryDate }, { rejectWithValue }) => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("branch", locationId);
      if (queryDate) queryParams.set("queryDate", queryDate);

      const response = await fetch(
       `${API_BASE_URL}/${outletVarianceBase()}/pending-codes?${queryParams.toString()}`
      );

      if (!response.ok) {
        const text = await response.text();
        return rejectWithValue({ message: text || "Failed to fetch pending codes", status: response.status });
      }

      return await response.json();
    } catch (err) {
      return rejectWithValue({ message: err instanceof Error ? err.message : "Unknown error" });
    }
  }
);

export const fetchApprovedItems = createAsyncThunk<
  ApprovedItemsResponse,
  // { page?: number; limit?: number; branch?: string; date?: string; isLoadMore?: boolean },
  // replace the line 11 8 2
  { page?: number; limit?: number; branch?: string; date?: string; status?: string; itemName?: string; approvedBy?: string; fromDate?: string; toDate?: string; isLoadMore?: boolean },
  { rejectValue: FetchError }
>(
  "data/fetchApprovedItems",
  // async ({ page = 1, limit = 30, branch, date, isLoadMore = false }, { rejectWithValue }) => {
  //   try {
  //     const queryParams = new URLSearchParams();
  //     queryParams.set("page", String(page));
  //     queryParams.set("limit", String(limit));
  //     if (branch && branch.trim() !== "") queryParams.set("branch", branch);
  //     if (date && date.trim() !== "") queryParams.set("date", date);

  //     const url = `${API_BASE_URL}/outletinventoryvariance/approved?${queryParams.toString()}`;
  // replace the part 11 8 2
  async ({ page = 1, limit = 30, branch, date, status, itemName, approvedBy, fromDate, toDate, isLoadMore = false }, { rejectWithValue }) => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("page", String(page));
      queryParams.set("limit", String(limit));
      if (branch && branch.trim() !== "") queryParams.set("branch", branch);
      if (date && date.trim() !== "") queryParams.set("date", date);
      if (status) queryParams.set("status", status);
      if (itemName && itemName.trim() !== "") queryParams.set("itemName", itemName);
      if (approvedBy && approvedBy.trim() !== "") queryParams.set("approvedBy", approvedBy);
      if (fromDate) queryParams.set("fromDate", fromDate);
      if (toDate) queryParams.set("toDate", toDate);

 const url = `${API_BASE_URL}/${outletVarianceBase()}/approved?${queryParams.toString()}`;
       const response = await fetch(url);

      if (!response.ok) {
        const text = await response.text();
        return rejectWithValue({
          message: text || "Failed to fetch approved items",
          status: response.status,
        });
      }

      const result = await response.json();

      return {
        data: result.data || [],
        page: result.page || page,
        limit: result.limit || limit,
        total: result.total || 0,
        isLoadMore,
      };
    } catch (err) {
      return rejectWithValue({
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

// ================== Slice ==================
const dataSlice = createSlice({
  name: "data",
  initialState,
  reducers: {
    resetData: (state) => {
      Object.assign(state, initialState);
      state.filterOptions.category.page = 1;
      state.filterOptions.subCategory.page = 1;
      state.filterOptions.itemName.page = 1;
      state.filterOptions.varianceName.page = 1;
      state.currentPage = 1;
      state.page = 1;
      state.totalPages = 1;
    },
    // newly add this 11 8 2
    setShowOnlyPending: (state, action: PayloadAction<boolean>) => {
      state.showOnlyPending = action.payload;
    },
    setSelectedLocation: (state, action: PayloadAction<string>) => {
      state.selectedLocation = action.payload;
    },
    setEditableRows: (state, action: PayloadAction<Record<string, EditableRow>>) => {
      state.editableRows = action.payload;
    },
    setChanges: (state, action: PayloadAction<Change[]>) => {
      state.changes = action.payload;
    },
    setVisibleColumns: (
      state,
      action: PayloadAction<
        Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
      >
    ) => {
      if (typeof action.payload === "function") {
        state.visibleColumns = action.payload(state.visibleColumns);
      } else {
        state.visibleColumns = action.payload;
      }
    },
    toggleColumn: (state, action: PayloadAction<string>) => {
      state.visibleColumns[action.payload] = !state.visibleColumns[action.payload];
    },
    setFilterSearch: (
      state,
      action: PayloadAction<{ field: keyof FilterOptionsState; searchFilter: string }>
    ) => {
      const { field, searchFilter } = action.payload;
      if (field !== "location") {
        state.filterOptions[field].searchFilter = searchFilter;
        state.filterOptions[field].hasMore = true;
      }
    },
    clearFilterSearch: (state, action: PayloadAction<keyof FilterOptionsState>) => {
      const field = action.payload;
      if (field !== "location") {
        state.filterOptions[field].searchFilter = undefined;
        state.filterOptions[field].hasMore = true;
      }
    },
    setSort: (state, action: PayloadAction<{ field: string; order: "asc" | "desc" }>) => {
      state.sortField = action.payload.field;
      state.sortOrder = action.payload.order;
    },
    clearSort: (state) => {
      state.sortField = undefined;
      state.sortOrder = undefined;
    },
    setOpenFirstDialog: (state, action: PayloadAction<boolean>) => {
      state.openFirstDialog = action.payload;
    },
    setOpenAdjustmentDialog: (state, action: PayloadAction<boolean>) => {
      state.openAdjustmentDialog = action.payload;
    },
    setOpenApproveDialog: (state, action: PayloadAction<boolean>) => {
      state.openApproveDialog = action.payload;
    },
    setSelectedItem: (state, action: PayloadAction<Branchitem | null>) => {
      state.selectedItem = action.payload;
    },
    setSelectedApproveItem: (state, action: PayloadAction<Branchitem | null>) => {
      state.selectedApproveItem = action.payload;
    },
    setAdjustmentReason: (state, action: PayloadAction<string>) => {
      state.adjustmentReason = action.payload;
    },
    setAdjustedPhysicalStock: (state, action: PayloadAction<string>) => {
      state.adjustedPhysicalStock = action.payload;
    },
    setApproveDescription: (state, action: PayloadAction<string>) => {
      state.approveDescription = action.payload;
    },
    setOpenSnackbar: (state, action: PayloadAction<boolean>) => {
      state.openSnackbar = action.payload;
    },
    setSnackbarMessage: (state, action: PayloadAction<string>) => {
      state.snackbarMessage = action.payload;
    },
    setCurrentPage: (state, action: PayloadAction<number>) => {
      state.currentPage = action.payload;
    },
    setHasMoreData: (state, action: PayloadAction<boolean>) => {
      state.hasMoreData = action.payload;
    },
    setAllItems: (state, action: PayloadAction<Branchitem[]>) => {
      state.allItems = action.payload;
    },
    setTotalItems: (state, action: PayloadAction<number>) => {
      state.totalItems = action.payload;
    },
    setTotalPages: (state, action: PayloadAction<number>) => {
      state.totalPages = action.payload;
    },
    setIsLoadingMore: (state, action: PayloadAction<boolean>) => {
      state.isLoadingMore = action.payload;
    },
    setIsFullScreen: (state, action: PayloadAction<boolean>) => {
      state.isFullScreen = action.payload;
    },
    setTableView: (state, action: PayloadAction<"Stock" | "Approved">) => {
      state.tableView = action.payload;
    },
    setSearchParams: (state, action: PayloadAction<SearchParams>) => {
      state.searchParams = action.payload;
    },
    setApprovedItemsFilters: (
      state,
      action: PayloadAction<{ branch?: string; date?: string }>
    ) => {
      state.approvedItems.filters.branch = action.payload.branch ?? "";
      state.approvedItems.filters.date = action.payload.date ?? "";
    },
    setApprovedItemsPage: (state, action: PayloadAction<number>) => {
      state.approvedItems.page = action.payload;
    },
    resetApprovedItems: (state) => {
      state.approvedItems = {
        items: [],
        page: 1,
        limit: 30,
        total: 0,
        loading: false,
        error: null,
        filters: { branch: "", date: "" },
        hasMore: true,
        isLoadingMore: false,
      };
    },
    setApprovedItemsHasMore: (state, action: PayloadAction<boolean>) => {
      state.approvedItems.hasMore = action.payload;
    },
    setApprovedItemsIsLoadingMore: (state, action: PayloadAction<boolean>) => {
      state.approvedItems.isLoadingMore = action.payload;
    },
    appendApprovedItems: (state, action: PayloadAction<ApprovedItem[]>) => {
      state.approvedItems.items = [...state.approvedItems.items, ...action.payload];
    },
    resetApprovedItemsPagination: (state) => {
      state.approvedItems.items = [];
      state.approvedItems.page = 1;
      state.approvedItems.hasMore = true;
      state.approvedItems.isLoadingMore = false;
    },
    setDataLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    clearApprovalResults: (state) => {
      state.lastApproveResult = null;
      state.lastBulkApproveResult = null;
    },
  },
  extraReducers: (builder) => {
    builder
          // FG <-> RM switch: clear rows / filters / approved list of the other type
      // (branch list and the selected outlet are kept)
.addCase(setOutletStockType, (state) => {
  // Keep outlet/branch information when switching FG <-> RM
  const branches = [...state.branches];
  const selectedLocation = state.selectedLocation;

  // IMPORTANT:
  // Don't use Object.assign(state, initialState) here.
  // Create fresh nested objects so Redux/Immer does not receive
  // frozen references from initialState.

  state.showOnlyPending = false;

  state.branchwise = [];
  state.updatedStocks = [];
  state.stockAdjustments = [];

  state.loading = false;
  state.approving = false;
  state.bulkApproving = false;
  state.approveAllBranchLoading = false;
  state.loadingPendingCodes = false;
  state.error = null;

  state.total = 0;
  state.page = 1;
  state.limit = 30;

  // Keep current outlet
  state.branches = branches;
  state.selectedLocation = selectedLocation;

  state.editableRows = {};
  state.changes = [];

  // IMPORTANT FIX:
  // Create completely new filter objects
  state.filterOptions = {
    location: [],
    category: {
      ...initialFilterField,
      values: [],
      page: 1,
    },
    subCategory: {
      ...initialFilterField,
      values: [],
      page: 1,
    },
    itemName: {
      ...initialFilterField,
      values: [],
      page: 1,
    },
    varianceName: {
      ...initialFilterField,
      values: [],
      page: 1,
    },
  };

  state.totalCurrentSystemQty = 0;

  state.sortField = undefined;
  state.sortOrder = undefined;

  state.adjustmentHistory = [];

  state.openFirstDialog = false;
  state.openAdjustmentDialog = false;
  state.openApproveDialog = false;

  state.selectedItem = null;
  state.selectedApproveItem = null;

  state.adjustmentReason = "";
  state.adjustedPhysicalStock = "";
  state.approveDescription = "";

  state.currentPage = 1;
  state.hasMoreData = true;
  state.allItems = [];
  state.totalItems = 0;
  state.totalPages = 1;
  state.isLoadingMore = false;

  state.tableView = "Stock";

  state.searchParams = {
    itemName: [],
    varianceName: [],
    category: [],
    subCategory: [],
    queryDate: "",
  };

  state.lastApproveResult = null;
  state.lastBulkApproveResult = null;

  state.approvedItems = {
    items: [],
    page: 1,
    limit: 30,
    total: 0,
    loading: false,
    error: null,
    filters: {
      branch: "",
      date: "",
    },
    hasMore: true,
    isLoadingMore: false,
  };
})
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
        state.error =
          action.payload?.message || action.error.message || "Failed to fetch branches";
      })

      .addCase(fetchItems.pending, (state, action) => {
        const params = action.meta.arg;
        const isFilterOnly = !!params.only_filter_options;

        if (!isFilterOnly) {
          if (params.page === 1) {
            state.loading = true;
            state.error = null;
          } else if (params.page && params.page > 1) {
            state.isLoadingMore = true;
          }
        }

        if (params.categoryPage !== undefined) state.filterOptions.category.loading = true;
        if (params.subCategoryPage !== undefined) state.filterOptions.subCategory.loading = true;
        if (params.itemNamePage !== undefined) state.filterOptions.itemName.loading = true;
        if (params.varianceNamePage !== undefined)
          state.filterOptions.varianceName.loading = true;
      })
      .addCase(fetchItems.fulfilled, (state, action) => {
        const params = action.meta.arg;
        const response = action.payload;
        const isFilterOnly = response.isFilterOnlyFetch;

        if (response.filterOptions) {
          const handleFilterField = (
            field: "category" | "subCategory" | "itemName" | "varianceName",
            pageParam?: number,
            searchParam?: string
          ) => {
            if (pageParam === undefined) return;

            const incoming = response.filterOptions![field];
            const isSearch = !!searchParam;
            const requestedPage = pageParam;
            const currentPage = state.filterOptions[field]?.page || 1;

            if (isSearch) {
              state.filterOptions[field] = {
                ...incoming,
                values: incoming.values,
                loading: false,
                hasMore: incoming.values.length > 0,
                page: 1,
              };
              return;
            }

            if (requestedPage > 1) {
              const existingIds = new Set(
                state.filterOptions[field].values.map((v: any) =>
                  typeof v === "object" ? v.id : v
                )
              );

              const newValues = incoming.values.filter((v: any) =>
                typeof v === "object" ? !existingIds.has(v.id) : !existingIds.has(v)
              );

              state.filterOptions[field] = {
                ...incoming,
                values: [...state.filterOptions[field].values, ...newValues],
                loading: false,
                page: requestedPage,
                hasMore: newValues.length > 0,
              };
            } else if (params.resetFilterOptions) {
              state.filterOptions[field] = {
                ...incoming,
                values: incoming.values,
                loading: false,
                page: 1,
                hasMore: incoming.values.length > 0,
              };
            } else {
              state.filterOptions[field] = {
                ...state.filterOptions[field],
                values: incoming.values,
                loading: false,
                hasMore: incoming.values.length > 0,
                page: currentPage,
              };
            }
          };

          handleFilterField("category", params.categoryPage, params.categorySearch);
          handleFilterField("subCategory", params.subCategoryPage, params.subCategorySearch);
          handleFilterField("itemName", params.itemNamePage, params.itemNameSearch);
          handleFilterField(
            "varianceName",
            params.varianceNamePage,
            params.varianceNameSearch
          );
        }

        if (!isFilterOnly && params.page !== undefined) {
          if (params.page === 1) {
            state.branchwise = response.branchwise;
            state.allItems = response.branchwise;
          } else {
            state.branchwise = [...state.branchwise, ...response.branchwise];
            state.allItems = [...state.allItems, ...response.branchwise];
          }

          state.total = response.total;
          state.totalItems = response.total;
          state.page = response.page;
          state.currentPage = response.page;
          state.limit = response.limit;
          state.totalPages = Math.ceil(response.total / response.limit);
          state.totalCurrentSystemQty = response.totalCurrentSystemQty;
          state.hasMoreData = state.allItems.length < response.total;
          state.loading = false;
          state.isLoadingMore = false;
        } else if (isFilterOnly) {
          state.filterOptions.category.loading = false;
          state.filterOptions.subCategory.loading = false;
          state.filterOptions.itemName.loading = false;
          state.filterOptions.varianceName.loading = false;
        }
      })
      .addCase(fetchItems.rejected, (state, action) => {
        const params = action.meta.arg;
        const isFilterOnly = !!params.only_filter_options;

        if (!isFilterOnly) {
          if (params.page === 1) state.loading = false;
          else if (params.page && params.page > 1) state.isLoadingMore = false;
        }

        state.error =
          action.payload?.message || action.error.message || "Failed to fetch items";

        state.filterOptions.category.loading = false;
        state.filterOptions.subCategory.loading = false;
        state.filterOptions.itemName.loading = false;
        state.filterOptions.varianceName.loading = false;

        if (params.categoryPage) state.filterOptions.category.hasMore = false;
        if (params.subCategoryPage) state.filterOptions.subCategory.hasMore = false;
        if (params.itemNamePage) state.filterOptions.itemName.hasMore = false;
        if (params.varianceNamePage) state.filterOptions.varianceName.hasMore = false;
      })

      .addCase(approveItem.pending, (state) => {
        state.approving = true;
        state.error = null;
      })
      .addCase(approveItem.fulfilled, (state, action) => {
        state.approving = false;
        state.lastApproveResult = action.payload;

        if (action.payload.approvalStatus === "approved") {
          state.allItems = updateApprovedRowInList(state.allItems, action.payload);
          state.branchwise = updateApprovedRowInList(state.branchwise, action.payload);
        }
      })
      .addCase(approveItem.rejected, (state, action) => {
        state.approving = false;
        state.error = action.payload?.message || "Failed to approve item";
      })

      .addCase(approveBulkItems.pending, (state) => {
        state.bulkApproving = true;
        state.error = null;
      })
      .addCase(approveBulkItems.fulfilled, (state, action) => {
        state.bulkApproving = false;
        state.lastBulkApproveResult = action.payload;

        const approvedResults = action.payload.results.filter(
          (r) => r.success === true && r.approvalStatus === "approved"
        );

        for (const result of approvedResults) {
          state.allItems = updateApprovedRowInList(state.allItems, result);
          state.branchwise = updateApprovedRowInList(state.branchwise, result);
        }
      })
      .addCase(approveBulkItems.rejected, (state, action) => {
        state.bulkApproving = false;
        state.error = action.payload?.message || "Failed to approve selected items";
      })

      .addCase(approveAllBranch.pending, (state) => {
        state.approveAllBranchLoading = true;
        state.error = null;
      })
      .addCase(approveAllBranch.fulfilled, (state) => {
        state.approveAllBranchLoading = false;
      })
      .addCase(approveAllBranch.rejected, (state, action) => {
        state.approveAllBranchLoading = false;
        state.error = action.payload?.message || "Failed to approve branch";
      })

      .addCase(fetchPendingCodes.pending, (state) => {
        state.loadingPendingCodes = true;
      })
      .addCase(fetchPendingCodes.fulfilled, (state) => {
        state.loadingPendingCodes = false;
      })
      .addCase(fetchPendingCodes.rejected, (state) => {
        state.loadingPendingCodes = false;
      })

      .addCase(fetchApprovedItems.pending, (state, action) => {
        const { isLoadMore } = action.meta.arg;
        if (isLoadMore) state.approvedItems.isLoadingMore = true;
        else state.approvedItems.loading = true;
        state.approvedItems.error = null;
      })
      .addCase(fetchApprovedItems.fulfilled, (state, action) => {
        const { data, page, limit, total } = action.payload;
        const { isLoadMore } = action.meta.arg;

        if (isLoadMore) {
          state.approvedItems.items = [...state.approvedItems.items, ...data];
          state.approvedItems.isLoadingMore = false;
        } else {
          state.approvedItems.items = data;
          state.approvedItems.loading = false;
        }

        state.approvedItems.page = page;
        state.approvedItems.limit = limit;
        state.approvedItems.total = total;
        state.approvedItems.hasMore = data.length >= limit;
      })
      .addCase(fetchApprovedItems.rejected, (state, action) => {
        const { isLoadMore } = action.meta.arg;
        if (isLoadMore) state.approvedItems.isLoadingMore = false;
        else state.approvedItems.loading = false;
        state.approvedItems.error =
          action.payload?.message || "Failed to load approved items";
      });
  },
});

// ================== Export Actions ==================
export const {
  resetData,
  setSelectedLocation,
  setEditableRows,
  setChanges,
  setVisibleColumns,
  toggleColumn,
  setFilterSearch,
  clearFilterSearch,
  setSort,
  clearSort,
  setOpenFirstDialog,
  setOpenAdjustmentDialog,
  setOpenApproveDialog,
  setSelectedItem,
  setSelectedApproveItem,
  setAdjustmentReason,
  setAdjustedPhysicalStock,
  setApproveDescription,
  setOpenSnackbar,
  setSnackbarMessage,
  setCurrentPage,
  setHasMoreData,
  setAllItems,
  setTotalItems,
  setTotalPages,
  setIsLoadingMore,
  setIsFullScreen,
  setTableView,
  setSearchParams,
  setApprovedItemsFilters,
  setApprovedItemsPage,
  resetApprovedItems,
  setApprovedItemsHasMore,
  setApprovedItemsIsLoadingMore,
  appendApprovedItems,
  resetApprovedItemsPagination,
  setDataLoading,
  clearApprovalResults,
  // newly add this 11 8 2
  setShowOnlyPending,
} = dataSlice.actions;

// ================== Selectors ==================
export const selectBranches = (state: { data: DataState }) => state.data.branches;
export const selectItems = (state: { data: DataState }) => state.data.branchwise;
export const selectUpdatedStocks = (state: { data: DataState }) => state.data.updatedStocks;
export const selectStockAdjustments = (state: { data: DataState }) =>
  state.data.stockAdjustments;
export const selectDataLoading = (state: { data: DataState }) => state.data.loading;
export const selectDataError = (state: { data: DataState }) => state.data.error;
export const selectApproving = (state: { data: DataState }) => state.data.approving;
export const selectBulkApproving = (state: { data: DataState }) =>
  state.data.bulkApproving;
export const selectEditableRows = (state: { data: DataState }) =>
  state.data.editableRows;
export const selectChanges = (state: { data: DataState }) => state.data.changes;
export const selectSelectedLocation = (state: { data: DataState }) =>
  state.data.selectedLocation;
export const selectFilterOptions = (state: { data: DataState }) =>
  state.data.filterOptions;
export const selectVisibleColumns = (state: { data: DataState }) =>
  state.data.visibleColumns;
export const selectTotalCurrentSystemQty = (state: { data: DataState }) =>
  state.data.totalCurrentSystemQty;
export const selectSortField = (state: { data: DataState }) => state.data.sortField;
export const selectSortOrder = (state: { data: DataState }) => state.data.sortOrder;
export const selectOpenFirstDialog = (state: { data: DataState }) =>
  state.data.openFirstDialog;
export const selectOpenAdjustmentDialog = (state: { data: DataState }) =>
  state.data.openAdjustmentDialog;
export const selectOpenApproveDialog = (state: { data: DataState }) =>
  state.data.openApproveDialog;
export const selectSelectedItem = (state: { data: DataState }) => state.data.selectedItem;
export const selectSelectedApproveItem = (state: { data: DataState }) =>
  state.data.selectedApproveItem;
export const selectAdjustmentReason = (state: { data: DataState }) =>
  state.data.adjustmentReason;
export const selectAdjustedPhysicalStock = (state: { data: DataState }) =>
  state.data.adjustedPhysicalStock;
export const selectApproveDescription = (state: { data: DataState }) =>
  state.data.approveDescription;
export const selectOpenSnackbar = (state: { data: DataState }) =>
  state.data.openSnackbar;
export const selectSnackbarMessage = (state: { data: DataState }) =>
  state.data.snackbarMessage;
export const selectCurrentPage = (state: { data: DataState }) => state.data.currentPage;
export const selectHasMoreData = (state: { data: DataState }) => state.data.hasMoreData;
export const selectAllItems = (state: { data: DataState }) => state.data.allItems;
export const selectTotalItems = (state: { data: DataState }) => state.data.totalItems;
export const selectTotalPages = (state: { data: DataState }) => state.data.totalPages;
export const selectIsLoadingMore = (state: { data: DataState }) =>
  state.data.isLoadingMore;
export const selectIsFullScreen = (state: { data: DataState }) =>
  state.data.isFullScreen;
export const selectTableView = (state: { data: DataState }) => state.data.tableView;
export const selectSearchParams = (state: { data: DataState }) =>
  state.data.searchParams;
export const selectLastApproveResult = (state: { data: DataState }) =>
  state.data.lastApproveResult;
export const selectLastBulkApproveResult = (state: { data: DataState }) =>
  state.data.lastBulkApproveResult;

export const selectApprovedItems = (state: { data: DataState }) =>
  state.data.approvedItems.items;
export const selectApprovedItemsPage = (state: { data: DataState }) =>
  state.data.approvedItems.page;
export const selectApprovedItemsLimit = (state: { data: DataState }) =>
  state.data.approvedItems.limit;
export const selectApprovedItemsTotal = (state: { data: DataState }) =>
  state.data.approvedItems.total;
export const selectApprovedItemsLoading = (state: { data: DataState }) =>
  state.data.approvedItems.loading;
export const selectApprovedItemsError = (state: { data: DataState }) =>
  state.data.approvedItems.error;
export const selectApprovedItemsFilters = (state: { data: DataState }) =>
  state.data.approvedItems.filters;
export const selectApprovedItemsHasMore = (state: { data: DataState }) =>
  state.data.approvedItems.hasMore;
export const selectApprovedItemsIsLoadingMore = (state: { data: DataState }) =>
  state.data.approvedItems.isLoadingMore;
export const selectApproveAllBranchLoading = (state: { data: DataState }) =>
  state.data.approveAllBranchLoading;
export const selectLoadingPendingCodes = (state: { data: DataState }) =>
  state.data.loadingPendingCodes;
// newly add this 11 8 2

export default dataSlice.reducer;