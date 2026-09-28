"use client";

import React, { useEffect, useCallback, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  DialogContent,
  TextField,
  Typography,
  IconButton,
  Divider,
  Chip,
  CircularProgress,
  Tooltip,
  Paper,
} from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchPurchaseItems,
  fetchWarehouses,
  approveItem,
  fetchApprovedItems,
  
  resetApprovedItems,
  resetPurchaseItems,
  clearError,
  RawMaterialStore,
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
  FetchPurchaseItemsParams,
  fetchWarehousePendingCodes,
  approveAllWarehouseBranch,
} from "../../../../features/yen_inventory/wharehoueStoreSlice";
import FilterBar from "../../../../components/Inventory/storestockvarience/filterBar";
import DataTable from "../../../../components/Inventory/storestockvarience/dataTable";
import FeedbackSnackbar from "../../../../components/Inventory/physcialstockvarience/feedbackSnakbar";
import { AppDispatch, RootState } from "@/redux/store";
import { throttle, debounce } from "lodash";
import axios from "axios";
import WarehouseInventoryManagementPage from "../page";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { useTodayDate } from "@/components/Hooks/useTodayDate";
import { API_BASE_URL } from "@/features/yen_inventory/OuletePhysicalStockSlice";
import { ApprovalModal } from "@/components/Inventory/shared/ApprovalModal";
import { getApiErrorMessage } from "@/components/Inventory/shared/apiError";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import TableRowsRoundedIcon from "@mui/icons-material/TableRowsRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import { formatInventoryQty } from "@/components/Inventory/shared/numberFormat";

export interface SearchParams {
  itemName: string[];
  category: string[];
  subcategory: string[];
  varianceName: string[];
  locationName: string;
  createdDate?: string;
}

const ITEMS_PER_PAGE = 30;
const DROPDOWN_LIMIT = 50;

const UI = {
  pageBg: "#f6f9fd",
  surface: "#ffffff",
  surfaceSoft: "#fbfdff",
  border: "#e8eef6",
  borderStrong: "rgba(203,213,225,0.62)",
  accent: "#1976d2",
  accentDark: "#1258a8",
  accentBg: "#eef6ff",
  success: "#16a34a",
  successBg: "#ecfdf5",
  successBorder: "#bbf7d0",
  warning: "#d97706",
  warningBg: "#fff7ed",
  warningBorder: "#fdba74",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
};

const WarehouseRawMaterialsStockModification: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  const {
    rawmaterialItems,
    totalItems,
    status,
    error,
    categoryNameOptions,
    subcategoryNameOptions,
    itemNameOptions,
    varianceNameOptions,
    categoryNameTotal,
    subcategoryNameTotal,
    itemNameTotal,
    varianceNameTotal,
    categoryNamePage,
    subcategoryNamePage,
    itemNamePage,
    varianceNamePage,
    warehouses,
    warehouseError,
    approvedItems,
    approvedItemsTotal,
    approvedItemsStatus,
    approvedItemsError,
    hasMore,
    searchParams,
    categoryNameSearchTerm,
    subcategoryNameSearchTerm,
    itemNameSearchTerm,
    varianceNameSearchTerm,
    isLoadingMore,
    isFullScreen,
    openSnackbar,
    snackbarMessage,
    openAdjustmentDialog,
    openApproveDialog,
    openDownloadDialog,
    selectedItem,
    adjustedPhysicalStock,
    adjustmentReason,
    selectedApproveItem,
    approveDescription,
    visibleColumns,
    approveAllBranchLoading,
    loadingPendingCodes,
  } = useSelector((state: RootState) => state.purchaseItems);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const approvedTableContainerRef = useRef<HTMLDivElement>(null);
  const activeFilterRequestRef = useRef<{ abort: () => void } | null>(null);
  const isApprovingRef = useRef(false);
  const previousFiltersRef = useRef<SearchParams>(searchParams);
  const hasInitializedLocationRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cascadeSourceKey, setCascadeSourceKey] = useState<string | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);

  const [isApproving, setIsApproving] = useState(false);
  const [tableView, setTableView] = useState<"stock" | "approved">("stock");
  // newly add this part 14 8 1
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | undefined>(undefined);

  // Bulk Approval Modal State
  const [bulkApprovalModalOpen, setBulkApprovalModalOpen] = useState(false);
  const [bulkApprovalType, setBulkApprovalType] = useState<"BRANCH" | "SELECTED">("BRANCH");

  // const [selectedApprovalItemCodes, setSelectedApprovalItemCodes] = useState<string[]>([]);
  // const selectedApprovalCount = selectedApprovalItemCodes.length;
  // repalce the part 11 8 1
  const [selectedApprovalItemCodes, setSelectedApprovalItemCodes] = useState<string[]>([]);
  const selectedApprovalCount = selectedApprovalItemCodes.length;

  // Display-only filter: when true, table shows ONLY the currently-selected
  // pending items. Does not touch fetch/approve logic — purely a view filter.
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  const todayDate = useTodayDate();
  // Keep a ref so debounced callbacks always read the latest date value
  // even when they were created before todayDate resolved.
  const todayDateRef = React.useRef<string | undefined>(todayDate);
  React.useEffect(() => {
    todayDateRef.current = todayDate;
  }, [todayDate]);

  const currentPage = Math.max(Math.ceil(rawmaterialItems.length / ITEMS_PER_PAGE), 1);
  const totalPages = Math.max(Math.ceil(totalItems / ITEMS_PER_PAGE), 1);

  const startItem =
    rawmaterialItems.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;

  const endItem = Math.min(rawmaterialItems.length, totalItems);

  // const staticColumns = useMemo(
  //   () => ["Select", "S.No", "Item Code", "Item Name", "Category", "Subcategory"],
  //   []
  // );
  // replace the part 11 8 1
  const staticColumns = useMemo(
    () => ["Select", "S.No", "Item Code", "Item Name", "Category", "Subcategory"],
    []
  );

  // // View-only filter: does not affect fetched data, redux state, or any
  // // approve/bulk-approve endpoint. Only changes what the table renders.
  // const displayedItems = useMemo(
  //   () =>
  //     showPendingOnly
  //       ? rawmaterialItems.filter((item) => selectedApprovalItemCodes.includes(item.itemCode))
  //       : rawmaterialItems,
  //   [showPendingOnly, rawmaterialItems, selectedApprovalItemCodes]
  // );
  // replace the part 11 8 1
  // Pending-only table filtering removed for stability — it required
  // preloading the entire branch (1000+ items) which was unreliable.
  // The table now always shows the normal paginated/scrolled data;
  // selection (checkboxes + Approve Selected count) still works fine
  // across pages since it's tracked independently by itemCode.
  // const displayedItems = rawmaterialItems;
  console.log("showPendingOnly", showPendingOnly);
  console.log("selectedApprovalItemCodes", selectedApprovalItemCodes.length);
  console.log("rawmaterialItems", rawmaterialItems.length);

  const displayedItems = rawmaterialItems;
  const fieldTypes = useMemo(
    () => [
      "Opening Stock",
      "Receiving Stock",
      "Returned Stock",
      "Dispatch Stock",
      "WH-Return",
      "Calc System",
      "SystemStock",
      "PhysicalStock",
      "Variance",
      "Action",
    ],
    []
  );

  const getFallbackCascadeSource = useCallback((params: SearchParams) => {
    const orderedKeys: Array<
      keyof Pick<SearchParams, "varianceName" | "itemName" | "subcategory" | "category">
    > = ["varianceName", "itemName", "subcategory", "category"];

    return orderedKeys.find((key) => params[key]?.length > 0) ?? null;
  }, []);
  const getLoggedInUsername = () =>
    (typeof window !== "undefined" && localStorage.getItem("username")) || "Inventory";

  useEffect(() => {
    dispatch(fetchWarehouses()).catch(() => {
      dispatch(setSnackbarMessage("Error fetching warehouses."));
      dispatch(setOpenSnackbar(true));
    });
  }, [dispatch]);

  useEffect(() => {
    // Run only once: wait until both warehouses and today's date are ready.
    // The ref guard prevents repeated dispatch when deps re-run.
    if (hasInitializedLocationRef.current) return;
    if (warehouses.length > 0 && todayDate) {
      const storedLocation = localStorage.getItem("globalSelectedWarehouseLocation");
      if (storedLocation && warehouses.some(w => w.locationId === storedLocation)) {
        hasInitializedLocationRef.current = true;
        dispatch(setSearchParams({
          itemName: [],
          category: [],
          subcategory: [],
          varianceName: [],
          locationName: storedLocation,
          createdDate: todayDate,
        }));
      }
    }
  }, [warehouses, todayDate, dispatch]);



  const debouncedFilterChange = useMemo(
    () =>
      debounce((filters: SearchParams) => {
        activeFilterRequestRef.current?.abort();
        setCascadeLoading(true);

        dispatch(resetPurchaseItems());

        // Always use the latest date via ref — avoids stale closure when
        // todayDate was undefined at the time this debounce was created.
        const currentDate = todayDateRef.current;

        // const request = dispatch(
        //   fetchPurchaseItems({
        //     skip: 0,
        //     limit: ITEMS_PER_PAGE,
        //     locationName: filters.locationName,
        //     itemName: filters.itemName.length > 0 ? filters.itemName : undefined,
        //     category: filters.category.length > 0 ? filters.category : undefined,
        //     subcategory: filters.subcategory.length > 0 ? filters.subcategory : undefined,
        //     varianceName: filters.varianceName.length > 0 ? filters.varianceName : undefined,
        //     createdDate: currentDate,
        //     fetchDropdowns: true,
        //   })
        // );
        // replace the part 14 8 1
        const request = dispatch(
          fetchPurchaseItems({
            skip: 0,
            limit: ITEMS_PER_PAGE,
            locationName: filters.locationName,
            itemName:
              filters.itemName.length > 0
                ? filters.itemName
                : undefined,
            category:
              filters.category.length > 0
                ? filters.category
                : undefined,
            subcategory:
              filters.subcategory.length > 0
                ? filters.subcategory
                : undefined,
            varianceName:
              filters.varianceName.length > 0
                ? filters.varianceName
                : undefined,
            createdDate: currentDate,
            fetchDropdowns: true,
            sortField,
            sortOrder,
            pendingOnly: showPendingOnly,
          })
        );

        activeFilterRequestRef.current = request;

        request
          .unwrap()
          .catch((err) => {
            if (err?.name !== "AbortError" && err?.name !== "CanceledError") {
              dispatch(setSnackbarMessage("Error fetching items."));
              dispatch(setOpenSnackbar(true));
            }
          })
          .finally(() => {
            if (activeFilterRequestRef.current === request) {
              activeFilterRequestRef.current = null;
            }
            setCascadeLoading(false);
          });
      }, 500),

    [dispatch, showPendingOnly, sortField, sortOrder]
  );
  // newly add this part 14 8 1
  const handleColumnSort = useCallback(
    async (field: string) => {
      if (field === "Select" || field === "S.No" || field === "Action") {
        return;
      }

      let nextField: string | undefined = field;
      let nextOrder: "asc" | "desc" | undefined = "asc";

      if (field === "Variance") {
        if (sortField !== "Variance" && sortField !== "editHistory") {
          // 1st click -> Variance ASC
          nextField = "Variance";
          nextOrder = "asc";
        } else if (sortField === "Variance" && sortOrder === "asc") {
          // 2nd click -> Variance DESC
          nextField = "Variance";
          nextOrder = "desc";
        } else if (sortField === "Variance" && sortOrder === "desc") {
          // 3rd click -> history icon TOP
          nextField = "editHistory";
          nextOrder = "asc";
        } else if (sortField === "editHistory" && sortOrder === "asc") {
          // 4th click -> history icon BOTTOM
          nextField = "editHistory";
          nextOrder = "desc";
        } else {
          // 5th click -> default order
          nextField = undefined;
          nextOrder = undefined;
        }
      } else {
        // Normal columns: ASC -> DESC -> ASC
        if (sortField === field && sortOrder === "asc") {
          nextOrder = "desc";
        } else {
          nextOrder = "asc";
        }
      }

      setSortField(nextField);
      setSortOrder(nextOrder);

      dispatch(resetPurchaseItems());

      await dispatch(
        fetchPurchaseItems({
          skip: 0,
          limit: ITEMS_PER_PAGE,
          locationName: searchParams.locationName,
          itemName:
            searchParams.itemName.length > 0
              ? searchParams.itemName
              : undefined,
          category:
            searchParams.category.length > 0
              ? searchParams.category
              : undefined,
          subcategory:
            searchParams.subcategory.length > 0
              ? searchParams.subcategory
              : undefined,
          varianceName:
            searchParams.varianceName.length > 0
              ? searchParams.varianceName
              : undefined,
          createdDate: todayDateRef.current,
          fetchDropdowns: true,
          pendingOnly: showPendingOnly,
          sortField: nextField,
          sortOrder: nextOrder,
        })
      ).unwrap();
    },
    [
      dispatch,
      searchParams,
      showPendingOnly,
      sortField,
      sortOrder,
    ]
  );
  useEffect(() => {
    if (!searchParams.locationName || tableView === "approved") return;

    const prev = previousFiltersRef.current;

    const locationChanged = prev.locationName !== searchParams.locationName;
    const dateChanged = prev.createdDate !== searchParams.createdDate;
    const selectionsChanged =
      JSON.stringify(prev.itemName) !== JSON.stringify(searchParams.itemName) ||
      JSON.stringify(prev.category) !== JSON.stringify(searchParams.category) ||
      JSON.stringify(prev.subcategory) !== JSON.stringify(searchParams.subcategory) ||
      JSON.stringify(prev.varianceName) !== JSON.stringify(searchParams.varianceName);

    const hasChanged = locationChanged || dateChanged || selectionsChanged;

    if (hasChanged) {
      previousFiltersRef.current = searchParams;
      debouncedFilterChange(searchParams);
    }

    return () => {
      debouncedFilterChange.cancel();
      activeFilterRequestRef.current?.abort();
    };
  }, [searchParams, debouncedFilterChange, tableView]);

  useEffect(() => {
    if (error || warehouseError || approvedItemsError) {
      dispatch(setSnackbarMessage(`Error: ${error || warehouseError || approvedItemsError}`));
      dispatch(setOpenSnackbar(true));
      dispatch(clearError());
    }
  }, [error, warehouseError, approvedItemsError, dispatch]);

  const loadMoreData = useCallback(() => {
    if (isLoadingMore || status === "loading" || !hasMore || !searchParams.locationName) {
      return;
    }

    const nextSkip = rawmaterialItems.length;
    dispatch(setIsLoadingMore(true));

    dispatch(

      fetchPurchaseItems({
        skip: nextSkip,
        limit: ITEMS_PER_PAGE,
        locationName: searchParams.locationName,
        itemName:
          searchParams.itemName.length > 0
            ? searchParams.itemName
            : undefined,
        category:
          searchParams.category.length > 0
            ? searchParams.category
            : undefined,
        subcategory:
          searchParams.subcategory.length > 0
            ? searchParams.subcategory
            : undefined,
        varianceName:
          searchParams.varianceName.length > 0
            ? searchParams.varianceName
            : undefined,
        createdDate: todayDateRef.current,
        fetchDropdowns: false,
        // newly add this 14 8 1
        sortField,
        sortOrder,
        pendingOnly: showPendingOnly,
      })
    )


      .unwrap()
      .catch(() => {
        dispatch(setSnackbarMessage("Error loading more items."));
        dispatch(setOpenSnackbar(true));
      })
      .finally(() => {
        dispatch(setIsLoadingMore(false));
      });
  },

    [
      dispatch,
      isLoadingMore,
      status,
      hasMore,
      rawmaterialItems.length,
      searchParams,
      showPendingOnly,
      sortField,
      sortOrder,
    ]
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (
        distanceFromBottom <= 150 &&
        !isLoadingMore &&
        status !== "loading" &&
        hasMore &&
        searchParams.locationName
      ) {
        loadMoreData();
      }
    },
    [isLoadingMore, status, hasMore, searchParams.locationName, loadMoreData]
  );

  const handleSearchChange = useCallback(
    (field: string, value: string[] | string) => {
      const currentValue = searchParams[field as keyof SearchParams];
      const newValue = value;

      if (JSON.stringify(currentValue) === JSON.stringify(newValue)) return;

      const nextArray = Array.isArray(value) ? value : value ? [value] : [];

      const nextParams = {
        ...searchParams,
        [field]: value,
        ...(field === "locationName" ? { createdDate: todayDate } : {}),
      };

      const isCascadeField = ["category", "subcategory", "itemName", "varianceName"].includes(field);

      if (!isCascadeField) {
        if (field === "locationName") {
          localStorage.setItem("globalSelectedWarehouseLocation", value as string);
        }
        setCascadeSourceKey(getFallbackCascadeSource(nextParams));
        setCascadeLoading(false);
      } else if (nextArray.length === 0) {
        if (cascadeSourceKey === field) {
          setCascadeSourceKey(getFallbackCascadeSource(nextParams));
          setCascadeLoading(false);
        }
      } else {
        setCascadeSourceKey(field);
      }

      dispatch(setSearchParams(nextParams));
    },
    [dispatch, searchParams, todayDate, cascadeSourceKey, getFallbackCascadeSource]
  );

  const getSearchTerm = useCallback(
    (field: string) => {
      if (field === "category") return categoryNameSearchTerm;
      if (field === "subcategory") return subcategoryNameSearchTerm;
      if (field === "itemName") return itemNameSearchTerm;
      if (field === "varianceName") return varianceNameSearchTerm;
      return "";
    },
    [
      categoryNameSearchTerm,
      subcategoryNameSearchTerm,
      itemNameSearchTerm,
      varianceNameSearchTerm,
    ]
  );

  const getCurrentPage = useCallback(
    (field: string) => {
      if (field === "category") return categoryNamePage;
      if (field === "subcategory") return subcategoryNamePage;
      if (field === "itemName") return itemNamePage;
      if (field === "varianceName") return varianceNamePage;
      return 1;
    },
    [categoryNamePage, subcategoryNamePage, itemNamePage, varianceNamePage]
  );

  const addOtherFilters = useCallback(
    (params: FetchPurchaseItemsParams, currentField: string) => {
      if (searchParams.category.length > 0 && currentField !== "category") {
        params.category = searchParams.category;
      }

      if (searchParams.subcategory.length > 0 && currentField !== "subcategory") {
        params.subcategory = searchParams.subcategory;
      }

      if (searchParams.itemName.length > 0 && currentField !== "itemName") {
        params.itemName = searchParams.itemName;
      }

      if (searchParams.varianceName.length > 0 && currentField !== "varianceName") {
        params.varianceName = searchParams.varianceName;
      }
    },
    [searchParams]
  );

  const setAllDropdownParams = useCallback(
    (
      params: FetchPurchaseItemsParams,
      targetField: string,
      targetPage: number,
      targetSearch: string | undefined
    ) => {
      const dropdownFields = ["category", "subcategory", "itemName", "varianceName"] as const;

      dropdownFields.forEach((ddField) => {
        const search = ddField === targetField ? targetSearch : getSearchTerm(ddField);
        const page = ddField === targetField ? targetPage : getCurrentPage(ddField);

        params[`${ddField}Search`] = search || undefined;
        params[`${ddField}Page`] = page;
        params[`${ddField}Limit`] = DROPDOWN_LIMIT;
      });
    },
    [getSearchTerm, getCurrentPage]
  );

  const handleFilterSearch = useMemo(
    () =>
      debounce((field: string, searchTerm: string) => {
        if (field === "locationName") return;

        if (field === "category") dispatch(setCategoryNameSearchTerm(searchTerm));
        if (field === "subcategory") dispatch(setSubcategoryNameSearchTerm(searchTerm));
        if (field === "itemName") dispatch(setItemNameSearchTerm(searchTerm));
        if (field === "varianceName") dispatch(setVarianceNameSearchTerm(searchTerm));

        if (searchTerm.length > 0 && searchTerm.length < 2) return;

        const dropdownParams: FetchPurchaseItemsParams = {
          skip: 0,
          limit: 0,
          fetchDropdowns: true,
          locationName: searchParams.locationName,
          createdDate: todayDate,
        };

        setAllDropdownParams(dropdownParams, field, 1, searchTerm);
        addOtherFilters(dropdownParams, field);

        dispatch(fetchPurchaseItems(dropdownParams));
      }, 150),
    [dispatch, searchParams.locationName, todayDate, setAllDropdownParams, addOtherFilters]
  );

  const handleFilterScrollBottom = useMemo(
    () =>
      throttle(
        (field: "category" | "subcategory" | "itemName" | "varianceName" | "locationName") => {
          if (field === "locationName") return;

          const total =
            field === "category"
              ? categoryNameTotal
              : field === "subcategory"
                ? subcategoryNameTotal
                : field === "itemName"
                  ? itemNameTotal
                  : varianceNameTotal;

          const currentFilterPage =
            field === "category"
              ? categoryNamePage
              : field === "subcategory"
                ? subcategoryNamePage
                : field === "itemName"
                  ? itemNamePage
                  : varianceNamePage;

          const loadedCount = currentFilterPage * DROPDOWN_LIMIT;
          if (loadedCount >= total) return;

          const dropdownParams: FetchPurchaseItemsParams = {
            skip: 0,
            limit: 0,
            fetchDropdowns: true,
            locationName: searchParams.locationName,
            createdDate: todayDate,
          };

          const targetSearch = getSearchTerm(field) || undefined;

          setAllDropdownParams(dropdownParams, field, currentFilterPage + 1, targetSearch);
          addOtherFilters(dropdownParams, field);

          dispatch(fetchPurchaseItems(dropdownParams));
        },
        200
      ),
    [
      dispatch,
      categoryNameTotal,
      subcategoryNameTotal,
      itemNameTotal,
      varianceNameTotal,
      categoryNamePage,
      subcategoryNamePage,
      itemNamePage,
      varianceNamePage,
      searchParams.locationName,
      todayDate,
      getSearchTerm,
      setAllDropdownParams,
      addOtherFilters,
    ]
  );

  const handleDownloadCSV = useCallback(async () => {
    if (!searchParams.locationName) {
      dispatch(setSnackbarMessage("Please select a Warehouse to download CSV."));
      dispatch(setOpenSnackbar(true));
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/warehouseinventoryvariance/export/csv`, {
        params: {
          locationName: searchParams.locationName,
          itemName: searchParams.itemName,
          category: searchParams.category,
          subcategory: searchParams.subcategory,
          createdDate: todayDate,
        },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute("download", `items_${searchParams.locationName}.csv`);

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      dispatch(setSnackbarMessage("CSV downloaded successfully."));
      dispatch(setOpenSnackbar(true));
    } catch {
      dispatch(setSnackbarMessage("Error downloading CSV."));
      dispatch(setOpenSnackbar(true));
    } finally {
      dispatch(setOpenDownloadDialog(false));
    }
  }, [dispatch, searchParams, todayDate]);

  const handleAdjustmentDialogClose = useCallback(
    async (confirm: boolean) => {
      if (confirm && selectedItem) {
        try {
          dispatch(setSnackbarMessage(`Stock adjusted for ${selectedItem.itemName}`));
          dispatch(setOpenSnackbar(true));
        } catch {
          dispatch(setSnackbarMessage("Error adjusting stock."));
          dispatch(setOpenSnackbar(true));
        }
      }

      dispatch(setOpenAdjustmentDialog(false));
      dispatch(setSelectedItem(null));
      dispatch(setAdjustedPhysicalStock(""));
      dispatch(setAdjustmentReason(""));
    },
    [dispatch, selectedItem]
  );

  const handleApproveConfirm = useCallback(async (mode: "ADJUST_SYSTEM" | "KEEP_SYSTEM", description: string) => {
    if (!selectedApproveItem || isApprovingRef.current) return;

    isApprovingRef.current = true;
    setIsApproving(true);

    try {
      await dispatch(
        approveItem({
          item_id: selectedApproveItem.randomId,
          locationId: selectedApproveItem.locationId,
          approved_by: getLoggedInUsername(),
          description: description || approveDescription,
          adjustmentMode: mode,
        })
      ).unwrap();

      await dispatch(
        fetchPurchaseItems({
          skip: 0,
          limit: ITEMS_PER_PAGE,
          locationName: searchParams.locationName,
          itemName: searchParams.itemName.length ? searchParams.itemName : undefined,
          category: searchParams.category.length ? searchParams.category : undefined,
          subcategory: searchParams.subcategory.length ? searchParams.subcategory : undefined,
          varianceName: searchParams.varianceName.length ? searchParams.varianceName : undefined,
          createdDate: todayDate,
          fetchDropdowns: true,
          // newly add this 14 8 1
          sortField,
          sortOrder,
        })
      ).unwrap();

      dispatch(setSnackbarMessage("Approved successfully."));
      dispatch(setOpenSnackbar(true));
    } catch (err) {
      console.error("Approve failed", err);
      dispatch(setSnackbarMessage("Error approving item."));
      dispatch(setOpenSnackbar(true));
    } finally {
      isApprovingRef.current = false;
      setIsApproving(false);
      dispatch(setOpenApproveDialog(false));
      dispatch(setSelectedApproveItem(null));
      dispatch(setApproveDescription(""));
    }
  }, [dispatch, selectedApproveItem, approveDescription, searchParams, todayDate]);

  const isApprovableRow = useCallback((row: RawMaterialStore): boolean => {
    const status = (row.approvalStatus || "").trim().toLowerCase();
    const hasButton = Boolean(row.approvalButton) || Boolean(row.canApprove);
    const isPending = status === "pendingapproval" || status === "pending";
    const variance = (row.variance ?? row.stockVariance);
    const hasVar = variance !== null && variance !== undefined;
    return (hasButton || isPending) && hasVar;
  }, []);

  const handleSelectAllClick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rows = rawmaterialItems || [];
      const visibleApprovableCodes = rows
        .filter(isApprovableRow)
        .map((item) => item.itemCode)
        .filter(Boolean);

      setSelectedApprovalItemCodes((prev) => {
        const allSelected =
          visibleApprovableCodes.length > 0 &&
          visibleApprovableCodes.every((code) => prev.includes(code));

        if (allSelected) {
          return prev.filter((code) => !visibleApprovableCodes.includes(code));
        }

        return Array.from(new Set([...prev, ...visibleApprovableCodes]));
      });
    },
    [rawmaterialItems, isApprovableRow]
  );

  // useEffect(() => {
  //   setSelectedApprovalItemCodes([]);
  // }, [searchParams.locationName]);
  // replace the part 11 8 1
  useEffect(() => {
    setSelectedApprovalItemCodes([]);
    setShowPendingOnly(false);
  }, [searchParams.locationName]);

  // const handleSelectAllPending = useCallback(async () => {
  //   if (!searchParams.locationName) return;
  //   try {
  //     const result = await dispatch(
  //       fetchWarehousePendingCodes({
  //         locationId: searchParams.locationName,
  //         queryDate: searchParams.createdDate,
  //       })
  //     ).unwrap();

  //     // const newCodes = result.itemCodes || [];
  //     // if (newCodes.length > 0) {
  //     //   setSelectedApprovalItemCodes((prev) => {
  //     //     const unique = new Set([...prev, ...newCodes]);
  //     //     return Array.from(unique);
  //     //   });
  //     //   dispatch(setSnackbarMessage(`Selected ${newCodes.length} pending items across all pages.`));
  //     // } else {
  //     //   dispatch(setSnackbarMessage(`No pending items found for branch on this date.`));
  //     // }
  //     // repalce the part 11 8 1
  //     const newCodes = result.itemCodes || [];
  //     if (newCodes.length > 0) {
  //       setSelectedApprovalItemCodes((prev) => {
  //         const unique = new Set([...prev, ...newCodes]);
  //         return Array.from(unique);
  //       });
  //       setShowPendingOnly(true); // switch table view to pending-only
  //       dispatch(setSnackbarMessage(`Selected ${newCodes.length} pending items across all pages.`));
  //     } else {
  //       dispatch(setSnackbarMessage(`No pending items found for branch on this date.`));
  //     }
  //     dispatch(setOpenSnackbar(true));
  //   } catch (err) {
  //     dispatch(setSnackbarMessage("Error fetching pending item codes"));
  //     dispatch(setOpenSnackbar(true));
  //   }
  // }, [dispatch, searchParams.locationName, searchParams.createdDate]);
  // replace the part 11 8 1
  const handleSelectAllPending = useCallback(async () => {
    if (!searchParams.locationName) return;

    try {
      const result = await dispatch(
        fetchWarehousePendingCodes({
          locationId: searchParams.locationName,
          queryDate: searchParams.createdDate,
        })
      ).unwrap();

      const newCodes = result.itemCodes || [];

      if (newCodes.length === 0) {
        dispatch(
          setSnackbarMessage(
            "No pending items found for branch on this date."
          )
        );
        dispatch(setOpenSnackbar(true));
        return;
      }

      setSelectedApprovalItemCodes((prev) => {
        const unique = new Set([...prev, ...newCodes]);
        return Array.from(unique);
      });

      setShowPendingOnly(true);

      dispatch(resetPurchaseItems());

      await dispatch(
        fetchPurchaseItems({
          skip: 0,
          limit: ITEMS_PER_PAGE,
          locationName: searchParams.locationName,
          itemName:
            searchParams.itemName.length > 0
              ? searchParams.itemName
              : undefined,
          category:
            searchParams.category.length > 0
              ? searchParams.category
              : undefined,
          subcategory:
            searchParams.subcategory.length > 0
              ? searchParams.subcategory
              : undefined,
          varianceName:
            searchParams.varianceName.length > 0
              ? searchParams.varianceName
              : undefined,
          createdDate: searchParams.createdDate || todayDate,
          fetchDropdowns: true,
          // replace the 2 line 14 8 1
          sortField,
          sortOrder,
          pendingOnly: true,
        })
      ).unwrap();

      dispatch(
        setSnackbarMessage(
          `Selected ${newCodes.length} pending items across all pages.`
        )
      );

      dispatch(setOpenSnackbar(true));

    } catch (err) {
      console.error("Select All Pending failed", err);

      dispatch(
        setSnackbarMessage(
          "Error fetching pending item codes"
        )
      );

      dispatch(setOpenSnackbar(true));
    }
  }, [
    dispatch,
    searchParams,
    todayDate,
    // replace the 2 line 14 8 1
    sortField,
    sortOrder,
  ]);

  const handleApproveAllBranch = useCallback(() => {
    if (!searchParams.locationName) return;
    setBulkApprovalType("BRANCH");
    setBulkApprovalModalOpen(true);
  }, [searchParams.locationName]);

  const executeApproveAllBranch = useCallback(async (mode: "ADJUST_SYSTEM" | "KEEP_SYSTEM", description: string) => {
    if (!searchParams.locationName) return;
    isApprovingRef.current = true;
    try {
      const result = await dispatch(
        approveAllWarehouseBranch({
          locationId: searchParams.locationName,
          queryDate: searchParams.createdDate,
          approved_by: getLoggedInUsername(),
          adjustmentMode: mode,
          description: description
        })
      ).unwrap();

      dispatch(resetPurchaseItems());
      await dispatch(
        fetchPurchaseItems({
          skip: 0,
          limit: ITEMS_PER_PAGE,
          locationName: searchParams.locationName,
          createdDate: searchParams.createdDate || todayDate,
          fetchDropdowns: true,
          // replace the 2 line 14 8 1
          sortField,
          sortOrder,
        })
      ).unwrap();

      const flagNote = result.flagged > 0 ? ` | ⚠ ${result.flagged} items flagged for manual review` : "";
      dispatch(setSnackbarMessage(
        `Branch approval complete. Approved: ${result.approved}, Auto-verified: ${result.autoVerified}, Skipped: ${result.skipped}${flagNote}`
      ));
      dispatch(setOpenSnackbar(true));
    } catch (error) {
      dispatch(setSnackbarMessage(getApiErrorMessage(error, "Branch approval failed")));
      dispatch(setOpenSnackbar(true));
    } finally {
      isApprovingRef.current = false;
    }
    // }, [dispatch, searchParams.locationName, searchParams.createdDate, todayDate]);
    // replace the part 14 8 1
  }, [
    dispatch,
    searchParams.locationName,
    searchParams.createdDate,
    todayDate,
    sortField,
    sortOrder,
  ]);

  const handleBulkApproveSelected = useCallback(() => {
    if (selectedApprovalItemCodes.length === 0) return;
    setBulkApprovalType("SELECTED");
    setBulkApprovalModalOpen(true);
  }, [selectedApprovalItemCodes]);


  const executeBulkApproveSelected = useCallback(async (mode: "ADJUST_SYSTEM" | "KEEP_SYSTEM", description: string) => {
    if (selectedApprovalItemCodes.length === 0) return;
    setBulkApproving(true);

    try {
      for (const code of selectedApprovalItemCodes) {

        const matchedItem = rawmaterialItems.find(
          (r) => r.randomId === code || r.itemCode === code
        );
        const itemIdToApprove = matchedItem ? matchedItem.randomId : code;

        await dispatch(
          approveItem({
            item_id: itemIdToApprove,
            locationId: searchParams.locationName,
            approved_by: getLoggedInUsername(),
            description: description || "Bulk approved",
            adjustmentMode: mode,
          })
        ).unwrap();
      }

      await dispatch(
        fetchPurchaseItems({
          skip: 0,
          limit: ITEMS_PER_PAGE,
          locationName: searchParams.locationName,
          createdDate: todayDate,
          fetchDropdowns: true,
          // replace the 2 line 14 8 1
          sortField,
          sortOrder,
        })
      ).unwrap();

      setSelectedApprovalItemCodes([]);
      setShowPendingOnly(false);
      dispatch(setSnackbarMessage("Bulk approved successfully."));
      dispatch(setOpenSnackbar(true));
    } catch (err) {
      console.error("Bulk approve failed", err);
      dispatch(setSnackbarMessage("Error in bulk approve."));
      dispatch(setOpenSnackbar(true));
    } finally {
      setBulkApproving(false);
    }
    // }, [dispatch, selectedApprovalItemCodes, rawmaterialItems, searchParams.locationName, todayDate]);
    // repalce the part 14 8 1
  }, [
    dispatch,
    selectedApprovalItemCodes,
    rawmaterialItems,
    searchParams.locationName,
    todayDate,
    sortField,
    sortOrder,
  ]);

  const formattedFilterOptions = useMemo(
    () => ({
      category: (categoryNameOptions || []).map((opt) => opt.value),
      subcategory: (subcategoryNameOptions || []).map((opt) => opt.value),
      itemName: (itemNameOptions || []).map((opt) => opt.value),
      varianceName: (varianceNameOptions || []).map((opt) => opt.value),
      warehouses: (warehouses || []).map((w) => ({
        name: w.locationName,
        aliasName: w.aliasName,
        locationId: w.locationId,
      })),
    }),
    [categoryNameOptions, subcategoryNameOptions, itemNameOptions, varianceNameOptions, warehouses]
  );

  const toggleTableView = useCallback(() => {
    setTableView((prev) => {
      const newView = prev === "stock" ? "approved" : "stock";

      if (newView === "approved") {
        dispatch(resetPurchaseItems());

        if (searchParams.locationName) {
          dispatch(
            fetchApprovedItems({
              page: 1,
              limit: ITEMS_PER_PAGE,
              locationName: searchParams.locationName,
              date: searchParams.createdDate || undefined,
            })
          ).catch(() => {
            dispatch(setSnackbarMessage("Error fetching approved items."));
            dispatch(setOpenSnackbar(true));
          });
        }
      } else if (newView === "stock" && searchParams.locationName) {
        dispatch(resetApprovedItems());

        dispatch(
          fetchPurchaseItems({
            skip: 0,
            limit: ITEMS_PER_PAGE,
            locationName: searchParams.locationName,
            itemName: searchParams.itemName.length > 0 ? searchParams.itemName : undefined,
            category: searchParams.category.length > 0 ? searchParams.category : undefined,
            subcategory: searchParams.subcategory.length > 0 ? searchParams.subcategory : undefined,
            varianceName: searchParams.varianceName.length > 0 ? searchParams.varianceName : undefined,
            createdDate: todayDate,
            fetchDropdowns: true,
            // newly add this 2 line 14 8 1
            sortField,
            sortOrder,
          })
        )
          .unwrap()
          .catch((err) => {
            if (err.name !== "AbortError") {
              dispatch(setSnackbarMessage("Error re-fetching stock items."));
              dispatch(setOpenSnackbar(true));
            }
          });
      }

      return newView;
    });
  }, [dispatch, searchParams, todayDate]);

  const handleRefreshData = useCallback(() => {
    if (!searchParams.locationName) return;

    setIsRefreshing(true);

    if (tableView === "approved") {
      dispatch(
        fetchApprovedItems({
          page: 1,
          limit: ITEMS_PER_PAGE,
          locationName: searchParams.locationName,
          date: searchParams.createdDate || todayDate,
        })
      )
        .unwrap()
        .then(() => {
          dispatch(setSnackbarMessage("Approved data refreshed"));
          dispatch(setOpenSnackbar(true));
        })
        .catch(() => {
          dispatch(setSnackbarMessage("Error refreshing approved data."));
          dispatch(setOpenSnackbar(true));
        })
        .finally(() => {
          setIsRefreshing(false);
        });

      return;
    }

    dispatch(
      fetchPurchaseItems({
        skip: 0,
        limit: ITEMS_PER_PAGE,
        locationName: searchParams.locationName,
        itemName: searchParams.itemName.length > 0 ? searchParams.itemName : undefined,
        category: searchParams.category.length > 0 ? searchParams.category : undefined,
        subcategory: searchParams.subcategory.length > 0 ? searchParams.subcategory : undefined,
        varianceName: searchParams.varianceName.length > 0 ? searchParams.varianceName : undefined,
        createdDate: searchParams.createdDate || todayDate,
        fetchDropdowns: true,
        // newly add this 2 line  14 8 1
        sortField,
        sortOrder,
      })
    )
      .unwrap()
      .then(() => {
        dispatch(setSnackbarMessage("Data refreshed"));
        dispatch(setOpenSnackbar(true));
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          dispatch(setSnackbarMessage("Error refreshing data."));
          dispatch(setOpenSnackbar(true));
        }
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [dispatch, searchParams, todayDate, tableView, sortField, sortOrder]);

  const handleClearFilters = useCallback(() => {
    setCascadeSourceKey(null);
    setCascadeLoading(false);

    dispatch(
      setSearchParams({
        ...searchParams,
        category: [],
        subcategory: [],
        itemName: [],
        varianceName: [],
      })
    );

    dispatch(setCategoryNameSearchTerm(""));
    dispatch(setSubcategoryNameSearchTerm(""));
    dispatch(setItemNameSearchTerm(""));
    dispatch(setVarianceNameSearchTerm(""));

    dispatch(resetPurchaseItems());

    if (searchParams.locationName) {
      dispatch(
        fetchPurchaseItems({
          skip: 0,
          limit: ITEMS_PER_PAGE,
          locationName: searchParams.locationName,
          createdDate: todayDate,
          fetchDropdowns: true,
          // newly add this 14 8 1
          sortField,
          sortOrder,
        })
      ).catch((err) => {
        if (err.name !== "AbortError") {
          dispatch(setSnackbarMessage("Error fetching items after clearing filters."));
          dispatch(setOpenSnackbar(true));
        }
      });
    }
  }, [dispatch, searchParams, todayDate, sortField, sortOrder]);

  const selectedWarehouseLabel = useMemo(() => {
    const warehouse = warehouses.find(
      (w) =>
        w.locationId === searchParams.locationName ||
        w.aliasName === searchParams.locationName ||
        w.locationName === searchParams.locationName
    );

    return warehouse?.aliasName || warehouse?.locationName || searchParams.locationName || "";
  }, [warehouses, searchParams.locationName]);

  return (
    <Box
      sx={{
        width: "100%",
        backgroundColor: UI.pageBg,
        display: "flex",
        flexDirection: "column",
        height: isFullScreen
          ? "100dvh"
          : "calc(100dvh - var(--app-topbar-height, 64px))",
        minHeight: 0,
        position: isFullScreen ? "fixed" : "relative",
        top: isFullScreen ? 0 : "auto",
        left: isFullScreen ? 0 : "auto",
        right: isFullScreen ? 0 : "auto",
        bottom: isFullScreen ? 0 : "auto",
        zIndex: isFullScreen ? 1200 : "auto",
        overflow: "hidden",
        pt: "env(safe-area-inset-top)",
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      {!isFullScreen && <WarehouseInventoryManagementPage />}

      <Paper
        elevation={0}
        sx={{
          flexShrink: 0,
          borderRadius: 0,
          borderBottom: `1px solid ${UI.border}`,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(248,251,255,0.86) 100%)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          position: "relative",
          zIndex: 100,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.55,
            px: { xs: 0.75, md: 1 },
            py: 0.55,
            minWidth: 0,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <FilterBar
              searchParams={searchParams}
              onSearchChange={handleSearchChange}
              setOpenDownloadDialog={() => dispatch(setOpenDownloadDialog(true))}
              filterOptions={formattedFilterOptions}
              visibleColumns={visibleColumns}
              onColumnVisibilityChange={(columns) => dispatch(setVisibleColumns(columns))}
              onFilterSearch={handleFilterSearch}
              onFilterScrollBottom={handleFilterScrollBottom}
              getWarehouseName={(id: string) => {
                const warehouse = warehouses.find(
                  (w) => w.aliasName === id || w.locationName === id || w.locationId === id
                );
                return warehouse?.locationName || id;
              }}
              isFullScreen={isFullScreen}
              onToggleFullScreen={() => dispatch(setIsFullScreen(!isFullScreen))}
              onClearAllFilters={handleClearFilters}
              onRefresh={handleRefreshData}
              isRefreshing={isRefreshing}
              cascadeSourceKey={cascadeSourceKey}
              cascadeLoading={cascadeLoading}
              onCascadeReset={() => {
                setCascadeSourceKey(null);
                setCascadeLoading(false);
              }}
            />
          </Box>

          <Tooltip title={isFullScreen ? "Exit fullscreen" : "Fullscreen"} arrow>
            <IconButton
              onClick={() => dispatch(setIsFullScreen(!isFullScreen))}
              size="small"
              aria-label={isFullScreen ? "Exit fullscreen" : "Fullscreen"}
              sx={{
                width: 34,
                height: 34,
                borderRadius: "9px",
                border: `1px solid ${UI.border}`,
                color: UI.accent,
                bgcolor: UI.surface,
                "&:hover": {
                  bgcolor: UI.accentBg,
                  borderColor: UI.borderStrong,
                },
              }}
            >
              {isFullScreen ? (
                <FullscreenExitIcon sx={{ fontSize: 18 }} />
              ) : (
                <FullscreenIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
          px: { xs: 0.75, md: 1 },
          pt: 0.6,
          pb: 0.55,
        }}
      >
        {searchParams.locationName ? (
          <>
            <Box
              ref={tableContainerRef}
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                borderRadius: "12px",
                display: "flex",
                flexDirection: "column",
                bgcolor: UI.surface,
                border: `1px solid ${UI.border}`,
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1,
                  px: 1.25,
                  py: 0.75,
                  borderBottom: `1px solid ${UI.border}`,
                  bgcolor: UI.surface,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flexWrap: "wrap" }}>
                  {selectedApprovalCount > 0 && (
                    <Chip
                      size="small"
                      label={`${selectedApprovalCount} selected`}
                      sx={{
                        height: 24,
                        fontWeight: 900,
                        bgcolor: UI.accentBg,
                        color: UI.accentDark,
                        border: `1px solid ${UI.border}`,
                      }}
                    />
                  )}
                  <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: UI.textMuted, whiteSpace: "nowrap" }}>
                    {selectedApprovalCount > 0 ? "Ready to approve" : "Select items or use quick actions →"}
                  </Typography>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Tooltip title="Fetch ALL pending item codes for this branch (not just visible rows)" arrow>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={bulkApproving || approveAllBranchLoading || status === "loading"}
                      onClick={handleSelectAllPending}
                      sx={{
                        height: 30,
                        borderRadius: "9px",
                        textTransform: "none",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        borderColor: UI.border,
                        color: UI.textSecondary,
                        "&:hover": { borderColor: UI.accent, color: UI.accent },
                      }}
                    >
                      {loadingPendingCodes ? "Selecting..." : "Select All Pending"}
                    </Button>
                  </Tooltip>


                  {selectedApprovalCount > 0 && (
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={bulkApproving || status === "loading"}
                      onClick={() => {
                        setSelectedApprovalItemCodes([]);
                        setShowPendingOnly(false);
                        dispatch(resetPurchaseItems());
                        dispatch(
                          fetchPurchaseItems({
                            skip: 0,
                            limit: ITEMS_PER_PAGE,
                            locationName: searchParams.locationName,
                            createdDate: searchParams.createdDate || todayDate,
                            fetchDropdowns: true,
                            // newly add this 2 line 14 8 1
                            sortField,
                            sortOrder,
                          })
                        );
                      }}
                      sx={{
                        height: 30,
                        borderRadius: "9px",
                        textTransform: "none",
                        fontSize: "0.72rem",
                        fontWeight: 850,
                      }}
                    >
                      Clear
                    </Button>
                  )}
                  {selectedApprovalCount > 0 && (
                    <Button
                      variant="contained"
                      disabled={bulkApproving || status === "loading"}
                      onClick={handleBulkApproveSelected}
                      sx={{
                        height: 30,
                        borderRadius: "9px",
                        textTransform: "none",
                        fontSize: "0.72rem",
                        fontWeight: 900,
                        bgcolor: UI.accent,
                        "&:hover": { bgcolor: UI.accentDark },
                      }}
                    >
                      {bulkApproving ? "Approving..." : `Approve Selected (${selectedApprovalCount})`}
                    </Button>
                  )}

                  <Tooltip
                    title="Approve ALL pending items for this branch in one call — reads closing doc once, processes 500 at a time"
                    arrow
                  >
                    <Button
                      variant="contained"
                      size="small"
                      disabled={bulkApproving || approveAllBranchLoading || status === "loading" || !searchParams.locationName}
                      onClick={handleApproveAllBranch}
                      sx={{
                        height: 30,
                        borderRadius: "9px",
                        textTransform: "none",
                        fontSize: "0.72rem",
                        fontWeight: 900,
                        bgcolor: UI.success,
                        "&:hover": { bgcolor: "#15803d" },
                        "&:disabled": { opacity: 0.5 },
                      }}
                    >
                      {approveAllBranchLoading ? "Approving Branch..." : "✓ Approve All"}
                    </Button>
                  </Tooltip>
                </Box>
              </Box>

              <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                {/* <DataTable
                filteredItems={rawmaterialItems}
                visibleColumns={visibleColumns} */}
                {/* replace the part 11 8 1 */}
                <DataTable
                  filteredItems={displayedItems}
                  onSortChange={handleColumnSort}
                  visibleColumns={visibleColumns}
                  staticColumns={staticColumns}
                  fieldTypes={fieldTypes}
                  totalColspan={Object.keys(visibleColumns).filter((key) => visibleColumns[key]).length}
                  hasMoreData={hasMore}
                  isLoadingMore={isLoadingMore}
                  loading={status === "loading"}
                  isFullScreen={isFullScreen}
                  handleTableScroll={handleScroll}
                  handleApproveClick={(item: RawMaterialStore) => {
                    dispatch(
                      setSelectedApproveItem({
                        ...item,
                        locationId: searchParams.locationName,
                      })
                    );
                    dispatch(setOpenApproveDialog(true));
                  }}
                  scrollContainerRef={tableContainerRef}
                  selectedApprovalItemCodes={selectedApprovalItemCodes}
                  onToggleSelectRow={(code) => {
                    setSelectedApprovalItemCodes((prev) =>
                      prev.includes(code)
                        ? prev.filter((c) => c !== code)
                        : [...prev, code]
                    );
                  }}
                  onSelectAll={handleSelectAllClick}
                />
              </Box>
            </Box>

            <Box
              sx={{
                width: "100%",
                minHeight: 42,
                mt: 0.55,
                px: 1,
                py: 0.45,
                border: `1px solid ${UI.border}`,
                borderRadius: "10px",
                bgcolor: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                flexWrap: "wrap",
                flexShrink: 0,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.7, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "8px",
                    bgcolor: UI.accentBg,
                    color: UI.accent,
                    border: "1px solid #bfdbfe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Inventory2OutlinedIcon sx={{ fontSize: 15 }} />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      fontWeight: 900,
                      color: UI.textPrimary,
                      lineHeight: 1.15,
                    }}
                  >
                    Showing {startItem}–{endItem} of {totalItems} items

                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.1,
                      fontSize: "0.6rem",
                      fontWeight: 750,
                      color: UI.textMuted,
                    }}
                  >
                    Page {currentPage} of {totalPages}
                    {hasMore ? " · Scroll for more" : ""}
                  </Typography>
                </Box>
              </Box>

              <Chip
                size="small"
                label={selectedWarehouseLabel || searchParams.locationName}
                sx={{
                  height: 26,
                  borderRadius: "8px",
                  maxWidth: 240,
                  fontSize: "0.66rem",
                  fontWeight: 850,
                  color: UI.accentDark,
                  bgcolor: UI.accentBg,
                  border: "1px solid #bfdbfe",
                  "& .MuiChip-label": {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                }}
              />
            </Box>
          </>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              placeItems: "center",
              px: 3,
              textAlign: "center",
            }}
          >
            <Box>
              <Box
                sx={{
                  width: 58,
                  height: 58,
                  mx: "auto",
                  borderRadius: "50%",
                  bgcolor: UI.accentBg,
                  color: UI.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 1.2,
                  boxShadow: "0 12px 30px rgba(25,118,210,0.10)",
                }}
              >
                <Inventory2OutlinedIcon sx={{ fontSize: 28 }} />
              </Box>

              <Typography
                sx={{
                  fontWeight: 950,
                  fontSize: "1rem",
                  color: UI.textPrimary,
                  mb: 0.35,
                }}
              >
                Select a warehouse
              </Typography>

              <Typography
                sx={{
                  fontSize: "0.76rem",
                  color: UI.textMuted,
                  maxWidth: 360,
                  lineHeight: 1.6,
                  fontWeight: 650,
                }}
              >
                Choose a warehouse from the filter bar to view stock approval data.
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <Dialog
        open={openAdjustmentDialog}
        onClose={() => handleAdjustmentDialogClose(false)}
        PaperProps={{
          sx: {
            width: "min(420px, calc(100vw - 32px))",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "calc(100dvh - 32px)",
            borderRadius: "14px",
          },
        }}
      >
        <DialogTitle>Adjust Stock: {selectedItem?.itemName}</DialogTitle>

        <DialogContent sx={{ overflow: "auto" }}>
          <TextField
            label="Physical Stock"
            value={adjustedPhysicalStock}
            onChange={(e) => dispatch(setAdjustedPhysicalStock(e.target.value))}
            fullWidth
            sx={{ mt: 2 }}
          />

          <TextField
            label="Adjustment Reason"
            value={adjustmentReason}
            onChange={(e) => dispatch(setAdjustmentReason(e.target.value))}
            fullWidth
            multiline
            rows={4}
            sx={{ mt: 2 }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => handleAdjustmentDialogClose(false)}>Cancel</Button>
          <Button onClick={() => handleAdjustmentDialogClose(true)} variant="contained">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <ApprovalModal
        isOpen={openApproveDialog}
        onClose={() => dispatch(setOpenApproveDialog(false))}
        onConfirm={handleApproveConfirm}
        itemName={selectedApproveItem?.itemName ?? "N/A"}
        systemStock={Number(selectedApproveItem?.updatedCurrentSystem ?? 0)}
        physicalStock={Number(selectedApproveItem?.physicalClosing ?? 0)}
        variance={Number(selectedApproveItem?.variance ?? 0)}
        isLoading={isApproving || isApprovingRef.current || !selectedApproveItem}
      />

      <Dialog
        open={openDownloadDialog}
        onClose={() => dispatch(setOpenDownloadDialog(false))}
        PaperProps={{
          sx: {
            width: "min(360px, calc(100vw - 32px))",
            maxWidth: "calc(100vw - 32px)",
            borderRadius: "14px",
          },
        }}
      >
        <DialogTitle>Download CSV</DialogTitle>

        <DialogContent>
          <Typography>
            Download items data for location: {searchParams.locationName}
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => dispatch(setOpenDownloadDialog(false))}>
            Cancel
          </Button>

          <Button
            onClick={handleDownloadCSV}
            variant="contained"
            disabled={!searchParams.locationName}
          >
            Download
          </Button>
        </DialogActions>
      </Dialog>

      <FeedbackSnackbar
        open={openSnackbar}
        message={snackbarMessage}
        onClose={() => dispatch(setOpenSnackbar(false))}
      />

      <ApprovalModal
        isOpen={bulkApprovalModalOpen}
        onClose={() => setBulkApprovalModalOpen(false)}
        itemName={bulkApprovalType === "BRANCH" ? "All Pending Items in Branch" : `Selected Pending Items (${selectedApprovalItemCodes.length})`}
        systemStock={"Multiple"}
        physicalStock={"Multiple"}
        variance={"-"}
        isLoading={bulkApprovalType === "BRANCH" ? approveAllBranchLoading : bulkApproving}
        onConfirm={async (mode, desc) => {
          if (bulkApprovalType === "BRANCH") {
            await executeApproveAllBranch(mode, desc);
          } else {
            await executeBulkApproveSelected(mode, desc);
          }
          setBulkApprovalModalOpen(false);
        }}
      />
    </Box>
  );
};

export default WarehouseRawMaterialsStockModification;
