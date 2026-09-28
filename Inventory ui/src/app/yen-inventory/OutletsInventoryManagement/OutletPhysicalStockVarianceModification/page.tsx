"use client";

import React, {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  Box,
  IconButton,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  TextField,
  Typography,
  DialogTitle,
  Divider,
  Paper,
  Tooltip,
  Chip,
} from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchBranches,
  fetchItems,
  selectBranches,
  selectDataLoading,
  selectDataError,
  approveItem,
  approveBulkItems,
  approveAllBranch,
  fetchPendingCodes,
  selectBulkApproving,
  selectApproveAllBranchLoading,
  Branchitem,
  selectSelectedLocation,
  setSelectedLocation,
  selectEditableRows,
  setEditableRows,
  selectChanges,
  setChanges,
  selectVisibleColumns,
  toggleColumn,
  SearchFilters,
  selectOpenFirstDialog,
  setOpenFirstDialog,
  selectOpenAdjustmentDialog,
  setOpenAdjustmentDialog,
  selectOpenApproveDialog,
  setOpenApproveDialog,
  selectSelectedItem,
  setSelectedItem,
  selectSelectedApproveItem,
  setSelectedApproveItem,
  selectAdjustmentReason,
  setAdjustmentReason,
  selectAdjustedPhysicalStock,
  setAdjustedPhysicalStock,
  selectApproveDescription,
  setApproveDescription,
  selectOpenSnackbar,
  setOpenSnackbar,
  selectSnackbarMessage,
  setSnackbarMessage,
  selectCurrentPage,
  setCurrentPage,
  selectHasMoreData,
  setHasMoreData,
  selectAllItems,
  setAllItems,
  selectTotalItems,
  setTotalItems,
  selectTotalPages,
  setTotalPages,
  selectIsLoadingMore,
  setIsLoadingMore,
  selectIsFullScreen,
  setIsFullScreen,

  selectSearchParams,
  setSearchParams,
  setApprovedItemsFilters,
  FetchParams,
  selectFilterOptions,
  setDataLoading,
} from "../../../../features/yen_inventory/OutletPhysicalVarianceSlice";
import {
  selectOutletStockType,
  useOutletStockType,
} from "../../../../features/yen_inventory/outletStockTypeSlice";
import OutletsInventoryManagementPage from "../page";
import FilterBar from "../../../../components/Inventory/physcialstockvarience/filterBar";
import DataTable from "../../../../components/Inventory/physcialstockvarience/dataTable";
import PaginationControls from "../../../../components/Inventory/physcialstockvarience/paginationcontrol";
import ConfirmDialog from "../../../../components/Inventory/physcialstockvarience/confirmDailog";
import FeedbackSnackbar from "../../../../components/Inventory/physcialstockvarience/feedbackSnakbar";
import { ApprovalModal, ApprovalFailedReason } from "@/components/Inventory/shared/ApprovalModal";
import { getApiErrorMessage } from "@/components/Inventory/shared/apiError";

import { AppDispatch } from "@/redux/store";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";

import { StockAdjustmentDialog } from "@/components/Inventory/physicalstockmodifcation/stockadjustmentDialog";
import { useTodayDate } from "@/components/Hooks/useTodayDate";

export interface SearchParams {
  itemName: string[];
  varianceName: string[];
  category: string[];
  subCategory: string[];
  location?: string[];
  queryDate?: string;
}

const ITEMS_PER_PAGE = 30;

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
  successDark: "#15803d",
  successBg: "#ecfdf5",
  successBorder: "#bbf7d0",
  warning: "#d97706",
  warningBg: "#fff7ed",
  warningBorder: "#fdba74",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
};

const OutletPhysicalStockVarianceModification: React.FC = () => {
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  const dispatch = useDispatch<AppDispatch>();

  const branches = useSelector(selectBranches);
  const loading = useSelector(selectDataLoading);
  const bulkApproving = useSelector(selectBulkApproving);
  const approveAllBranchLoading = useSelector(selectApproveAllBranchLoading);
  const selectedLocation = useSelector(selectSelectedLocation);
  const error = useSelector(selectDataError);
  const editableRows = useSelector(selectEditableRows);
  const changes = useSelector(selectChanges);
  const visibleColumns = useSelector(selectVisibleColumns);
  const openFirstDialog = useSelector(selectOpenFirstDialog);
  const openAdjustmentDialog = useSelector(selectOpenAdjustmentDialog);
  const filterOptions = useSelector(selectFilterOptions);
  const openApproveDialog = useSelector(selectOpenApproveDialog);
  const selectedItem = useSelector(selectSelectedItem);
  const selectedApproveItem = useSelector(selectSelectedApproveItem);
  const adjustmentReason = useSelector(selectAdjustmentReason);
  const adjustedPhysicalStock = useSelector(selectAdjustedPhysicalStock);
  const approveDescription = useSelector(selectApproveDescription);
  const openSnackbar = useSelector(selectOpenSnackbar);
  const snackbarMessage = useSelector(selectSnackbarMessage);
  const currentPage = useSelector(selectCurrentPage);
  const hasMoreData = useSelector(selectHasMoreData);
  const allItems = useSelector(selectAllItems);
  const totalItems = useSelector(selectTotalItems);
  const totalPages = useSelector(selectTotalPages);
  const isLoadingMore = useSelector(selectIsLoadingMore);
  const isFullScreen = useSelector(selectIsFullScreen);

  const searchParams = useSelector(selectSearchParams);

  const isApprovingRef = useRef(false);
  // newly add this 14 8 2
  const isPendingSelectionRef = useRef(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fullScreenContainerRef = useRef<HTMLDivElement | null>(null);
  const filterMenuAnchorEl = useRef<(() => void) | null>(null);
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const prevTriggersRef = useRef({ location: "", searchStr: "" });
  const filterOptionsRef = useRef(filterOptions);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cascadeSourceKey, setCascadeSourceKey] = useState<string | null>(null);
  const [tableView, setTableView] = useState<"stock" | "approved">("stock");
  // replace the part 14 8 1
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | undefined>(undefined);

  // Bulk Approval Modal State
  const [bulkApprovalModalOpen, setBulkApprovalModalOpen] = useState(false);
  const [approvalStage, setApprovalStage] = useState<
  "PREVIEW" | "APPROVING" | "VERIFYING" | "SUCCESS" | "FAILED"
>("PREVIEW");
const [approvalPreviewItems, setApprovalPreviewItems] = useState<Branchitem[]>([]);
// Failed items from backend: exact reason + what to do
const [approvalFailedReasons, setApprovalFailedReasons] = useState<ApprovalFailedReason[]>([]);
const [loadingApprovalPreview, setLoadingApprovalPreview] = useState(false);
const [approvalProgress, setApprovalProgress] = useState(0);

const [approvalResult, setApprovalResult] = useState<{
  total: number;
  verified: number;
  failed: number;
}>({
  total: 0,
  verified: 0,
  failed: 0,
});
  const [bulkApprovalType, setBulkApprovalType] = useState<"BRANCH" | "SELECTED">("BRANCH");
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [selectedApprovalItemCodes, setSelectedApprovalItemCodes] = useState<
    string[]
  >([]);
// NEW - Approve All enable / disable
const [hasPendingApprovals, setHasPendingApprovals] = useState(false);
const [checkingPendingApprovals, setCheckingPendingApprovals] = useState(false);
  const apiDate = useTodayDate();

  // newly add this 10 8 1
  useEffect(() => {
    if (apiDate) {
      console.log("API_DATE:", apiDate);

    }
  }, [apiDate]);
  console.log("API_DATE:", apiDate);
// Check whether current RM / FG has pending approval items
useEffect(() => {
  let active = true;

  const checkPendingApprovals = async () => {
    if (!selectedLocation || !apiDate) {
      setHasPendingApprovals(false);
      return;
    }

    const branch = branches.find(
      (b) =>
        b.locationId === selectedLocation ||
        b.locationName === selectedLocation ||
        b.aliasName === selectedLocation
    );

    const locationId = branch?.locationId || selectedLocation;

    try {
      setCheckingPendingApprovals(true);

      const result = await dispatch(
        fetchPendingCodes({
          locationId,
          queryDate: apiDate,
        })
      ).unwrap();

      if (!active) return;

      const pendingCodes = Array.isArray(result?.itemCodes)
        ? result.itemCodes
            .map((code: unknown) => String(code ?? "").trim())
            .filter(Boolean)
        : [];

      setHasPendingApprovals(pendingCodes.length > 0);
    } catch (error) {
      console.error("Pending approval check failed:", error);

      if (active) {
        setHasPendingApprovals(false);
      }
    } finally {
      if (active) {
        setCheckingPendingApprovals(false);
      }
    }
  };

  checkPendingApprovals();

  return () => {
    active = false;
  };
}, [selectedLocation, apiDate, branches, dispatch]);
  const currentPageSafe = Math.max(currentPage || 1, 1);
  const totalPagesSafe = Math.max(totalPages || 1, 1);

  const selectedBranchLabel = useMemo(() => {
    const branch = branches.find(
      (b) =>
        b.locationId === selectedLocation ||
        b.locationName === selectedLocation ||
        b.aliasName === selectedLocation
    );

    return branch?.aliasName || branch?.locationName || selectedLocation || "";
  }, [branches, selectedLocation]);

  const getFallbackCascadeSource = useCallback((params: SearchParams) => {
    const orderedKeys: Array<
      keyof Pick<
        SearchParams,
        "varianceName" | "itemName" | "subCategory" | "category"
      >
    > = ["varianceName", "itemName", "subCategory", "category"];

    return orderedKeys.find((key) => params[key]?.length > 0) ?? null;
  }, []);

  useEffect(() => {
    filterOptionsRef.current = filterOptions;
  }, [filterOptions]);

  useEffect(() => {
    if (branches.length === 0) dispatch(fetchBranches());
  }, [dispatch, branches.length]);

  useEffect(() => {
    if (branches.length > 0 && !selectedLocation) {
      const storedLocation = localStorage.getItem("globalSelectedOutletLocation");
      let defaultBranch = branches[0].locationId;
      if (storedLocation && branches.some(b => b.locationId === storedLocation)) {
        defaultBranch = storedLocation;
      }
      dispatch(setSelectedLocation(defaultBranch));
    }
  }, [branches, selectedLocation, dispatch]);



  useEffect(() => {
    if (error) {
      dispatch(setSnackbarMessage(`Error: ${error}`));
      dispatch(setOpenSnackbar(true));
    }
  }, [error, dispatch]);

  // Full transaction flow shown in table. Status column is intentionally hidden.
  // RM has no movement columns (receiving / stock in-out / sales / wastage)
  const isRm = useSelector(selectOutletStockType) === "RM";
  const fieldTypes = useMemo(
() =>
      isRm
        ? ["System Stock", "Physical Stock", "Variance", "Action"]
        : [
            "Opening-Stock",
            "Receiving-Stock",
            "Stock IN",
            "Stock OUT",
            "Sales",
            "Sales Return",
            "Wastages",
            "Warehouse Return",
            "Calc System",
            "System Stock",
            "Physical Stock",
            "Variance",
            "Action",
          ],
    [isRm]
  );

  const staticColumns = useMemo(
    () => ["itemCode", "Item Name", "Variance Name", "Category", "Subcategory"],
    []
  );

  // const loadPage = useCallback(
  //   async (page: number, isReset = false, includeFilters = true) => {
  // replace the part 14 8 1
  const loadPage = useCallback(
    async (
      page: number,
      isReset = false,
      includeFilters = true,
      sortFieldOverride: string | undefined = sortField,
      sortOrderOverride: "asc" | "desc" | undefined = sortOrder
    ) => {
      if (isFetchingRef.current) return;
      if (loading && !isReset) return;

      isFetchingRef.current = true;
      setCascadeLoading(true);

      try {
        if (page > 1) dispatch(setIsLoadingMore(true));
        if (page === 1) dispatch(setDataLoading(true));

        const searchFilters: Partial<SearchFilters> = {
          page,
          limit: ITEMS_PER_PAGE,
          includeSalesReturn: true,
          includeWastageReturn: true,
          includeStockTransfer: true,
          include_filter_options: includeFilters,
          // newly add this 14 8 1
          sortField: sortFieldOverride,
          sortOrder: sortOrderOverride,
        };

        if (selectedLocation) searchFilters.locationId = selectedLocation;

        const dynamicFilters: Partial<SearchFilters> = {
          ...(searchParams.itemName?.length && {
            itemName: searchParams.itemName,
          }),
          ...(searchParams.varianceName?.length && {
            varianceName: searchParams.varianceName,
          }),
          ...(searchParams.category?.length && {
            category: searchParams.category,
          }),
          ...(searchParams.subCategory?.length && {
            subCategory: searchParams.subCategory,
          }),
          queryDate: apiDate,
        };

        Object.assign(searchFilters, dynamicFilters);

        if (includeFilters) {
          const fo = filterOptionsRef.current;

          searchFilters.categoryPage = isReset ? 1 : fo.category.page;
          searchFilters.categoryLimit = 50;
          searchFilters.subCategoryPage = isReset ? 1 : fo.subCategory.page;
          searchFilters.subCategoryLimit = 50;
          searchFilters.itemNamePage = isReset ? 1 : fo.itemName.page;
          searchFilters.itemNameLimit = 50;
          searchFilters.varianceNamePage = isReset ? 1 : fo.varianceName.page;
          searchFilters.varianceNameLimit = 50;
        }

        const result = await dispatch(
          fetchItems({
            ...searchFilters,
            locationId: searchFilters.locationId || "",
            resetFilterOptions: isReset,
          } as FetchParams)
        ).unwrap();

        const newItems =
          page === 1
            ? result.branchwise || []
            : [...allItems, ...(result.branchwise || [])];

        dispatch(setAllItems(newItems));
        dispatch(
          setHasMoreData((result.branchwise || []).length >= ITEMS_PER_PAGE)
        );
        dispatch(setTotalItems(result.total || 0));
        dispatch(
          setTotalPages(Math.ceil((result.total || 0) / ITEMS_PER_PAGE))
        );
      } catch {
        dispatch(setSnackbarMessage("Error fetching data."));
        dispatch(setOpenSnackbar(true));
      } finally {
        dispatch(setIsLoadingMore(false));
        dispatch(setDataLoading(false));
        isFetchingRef.current = false;
        setCascadeLoading(false);
      }
    },
    [loading, selectedLocation, searchParams, dispatch, allItems, apiDate, sortField, sortOrder]
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
          // 1st click
          nextField = "Variance";
          nextOrder = "asc";
        } else if (sortField === "Variance" && sortOrder === "asc") {
          // 2nd click
          nextField = "Variance";
          nextOrder = "desc";
        } else if (sortField === "Variance" && sortOrder === "desc") {
          // 3rd click
          nextField = "editHistory";
          nextOrder = "asc";
        } else if (sortField === "editHistory" && sortOrder === "asc") {
          // 4th click
          nextField = "editHistory";
          nextOrder = "desc";
        } else {
          // 5th click -> original order
          nextField = undefined;
          nextOrder = undefined;
        }
      } else {
        // Normal column cycle: ASC -> DESC -> ASC
        if (sortField === field && sortOrder === "asc") {
          nextOrder = "desc";
        } else {
          nextOrder = "asc";
        }
      }

      setSortField(nextField);
      setSortOrder(nextOrder);

      dispatch(setCurrentPage(1));
      dispatch(setAllItems([]));

      await loadPage(1, true, false, nextField, nextOrder);
    },
    [dispatch, loadPage, sortField, sortOrder]
  );

  const loadFilterOptions = useCallback(
    async (
      field: "category" | "subCategory" | "itemName" | "varianceName",
      page: number,
      search?: string
    ) => {
      if (!selectedLocation) return;

      const params: FetchParams = {
        locationId: selectedLocation,
        include_filter_options: true,
        only_filter_options: true,
        queryDate: apiDate,
        ...(searchParams.category?.length && {
          category: searchParams.category,
        }),
        ...(searchParams.subCategory?.length && {
          subCategory: searchParams.subCategory,
        }),
        ...(searchParams.itemName?.length && {
          itemName: searchParams.itemName,
        }),
        ...(searchParams.varianceName?.length && {
          varianceName: searchParams.varianceName,
        }),
        ...(field === "category" && {
          categoryPage: page,
          categoryLimit: 50,
          ...(search !== undefined && { categorySearch: search }),
        }),
        ...(field === "subCategory" && {
          subCategoryPage: page,
          subCategoryLimit: 50,
          ...(search !== undefined && { subCategorySearch: search }),
        }),
        ...(field === "itemName" && {
          itemNamePage: page,
          itemNameLimit: 50,
          ...(search !== undefined && { itemNameSearch: search }),
        }),
        ...(field === "varianceName" && {
          varianceNamePage: page,
          varianceNameLimit: 50,
          ...(search !== undefined && { varianceNameSearch: search }),
        }),
      };

      await dispatch(fetchItems(params));
    },
    [dispatch, selectedLocation, apiDate, searchParams]
  );

  const loadMoreData = useCallback(async () => {
    if (isLoadingMore || !hasMoreData || loading || isFetchingRef.current) {
      return;
    }

    const nextPage = currentPage + 1;

    dispatch(setCurrentPage(nextPage));
    await loadPage(nextPage, false, false);
  }, [isLoadingMore, hasMoreData, loading, currentPage, loadPage, dispatch]);

  useEffect(() => {
    if (!selectedLocation) return;

    const searchStr = JSON.stringify(searchParams);
    const locationChanged =
      selectedLocation !== prevTriggersRef.current.location;
    const searchChanged = searchStr !== prevTriggersRef.current.searchStr;

    if (!locationChanged && !searchChanged) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      prevTriggersRef.current = { location: selectedLocation, searchStr };

      dispatch(setCurrentPage(1));
      dispatch(setAllItems([]));

      if (locationChanged) {
        loadPage(1, true, true);
      } else {
        loadPage(1, false, true);
      }
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [selectedLocation, searchParams, loadPage, dispatch]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const scrollPosition = (scrollTop + clientHeight) / scrollHeight;

      if (
        scrollPosition >= 0.8 &&
        !loading &&
        !isLoadingMore &&
        hasMoreData &&
        selectedLocation &&
        !isFetchingRef.current
      ) {
        loadMoreData();
      }
    },
    [loading, isLoadingMore, hasMoreData, selectedLocation, loadMoreData]
  );

  const handleLocationChange = useCallback(
    (value: string | string[]) => {
      const selectedValue = Array.isArray(value) ? value[0] : value;

      if (selectedValue !== selectedLocation) {
        localStorage.setItem("globalSelectedOutletLocation", selectedValue);
        setCascadeSourceKey(getFallbackCascadeSource(searchParams));
        setCascadeLoading(false);
        dispatch(setSelectedLocation(selectedValue));
      }
    },
    [dispatch, selectedLocation, getFallbackCascadeSource, searchParams]
  );

  const handleSearchChange = useCallback(
    (field: keyof SearchParams, value: string[] | string) => {
      const nextValue = Array.isArray(value) ? value : value ? [value] : [];
      const nextParams = { ...searchParams, [field]: nextValue };

      if (nextValue.length === 0) {
        if (cascadeSourceKey === String(field)) {
          setCascadeSourceKey(getFallbackCascadeSource(nextParams));
          setCascadeLoading(false);
        }
      } else {
        setCascadeSourceKey(String(field));
      }

      dispatch(setSearchParams({ ...searchParams, [field]: value }));
    },
    [dispatch, searchParams, cascadeSourceKey, getFallbackCascadeSource]
  );

  const handleCellEdit = useCallback(
    (
      id: string,
      field: string,
      value: string,
      itemName: string,
      varianceName: string
    ) => {
      dispatch(
        setEditableRows({
          ...editableRows,
          [id]: {
            ...editableRows[id],
            [field]: value === "" ? "" : value,
          },
        })
      );

      const newChanges = changes.some(
        (change) =>
          change.itemName === itemName &&
          change.varianceName === varianceName &&
          change.locationName === selectedLocation &&
          change.field === field
      )
        ? changes.map((change) =>
          change.itemName === itemName &&
            change.varianceName === varianceName &&
            change.locationName === selectedLocation &&
            change.field === field
            ? { ...change, newValue: value }
            : change
        )
        : [
          ...changes,
          {
            itemName,
            varianceName,
            locationName: selectedLocation!,
            field,
            newValue: value,
          },
        ];

      dispatch(setChanges(newChanges));
    },
    [dispatch, editableRows, changes, selectedLocation]
  );

  const handleToggleColumn = useCallback(
    (column: string) => dispatch(toggleColumn(column)),
    [dispatch]
  );

  const handleApproveClick = useCallback(
    (item: Branchitem) => {
      dispatch(setSelectedApproveItem(item));
      dispatch(setOpenApproveDialog(true));
      dispatch(setApproveDescription(""));
    },
    [dispatch]
  );

  const isApprovableRow = useCallback((item: Branchitem) => {
    return (
      Boolean(item.approvalButton) ||
      Boolean(item.canApprove) ||
      item.approvalStatus === "pendingApproval"
    );
  }, []);

  const selectedApprovalCount = selectedApprovalItemCodes.length;

  const handleToggleApprovalItem = useCallback(
    (item: Branchitem) => {
      if (!isApprovableRow(item) || !item.itemCode) return;

      setSelectedApprovalItemCodes((prev) =>
        prev.includes(item.itemCode)
          ? prev.filter((code) => code !== item.itemCode)
          : [...prev, item.itemCode]
      );
    },
    [isApprovableRow]
  );



  useEffect(() => {
    // Do not clear pending selection while Select All Pending
    // is actively showing the selected pending rows.
    if (isPendingSelectionRef.current) {
      return;
    }

    setSelectedApprovalItemCodes([]);
    setShowPendingOnly(false);
  }, [selectedLocation, apiDate, searchParams]);

  const handleApproveConfirm = useCallback(async (mode: "ADJUST_SYSTEM" | "KEEP_SYSTEM", description: string) => {
    if (!selectedApproveItem || !selectedLocation || isApprovingRef.current) {
      return;
    }

    if (!isApprovableRow(selectedApproveItem)) {
      dispatch(setSnackbarMessage("This item is not available for approval."));
      dispatch(setOpenSnackbar(true));
      dispatch(setOpenApproveDialog(false));
      return;
    }

    isApprovingRef.current = true;

    try {
      const branch = branches.find(
        (branch) =>
          branch.locationId === selectedLocation ||
          branch.locationName === selectedLocation ||
          branch.aliasName === selectedLocation
      );

      await dispatch(
        approveItem({
          itemCode: selectedApproveItem.itemCode,
          locationId: branch?.locationId || selectedLocation,
          queryDate: apiDate,
          approvedBy: "Inventory",
          description: description || adjustmentReason || "",
          adjustmentMode: mode,
        })
      ).unwrap();

      setSelectedApprovalItemCodes((prev) =>
        prev.filter((code) => code !== selectedApproveItem.itemCode)
      );

      // dispatch(setCurrentPage(1));
      // dispatch(setAllItems([]));
      // await loadPage(1, false, true);
      // replace the line 14 8 2 
      dispatch(setCurrentPage(1));
      dispatch(setAllItems([]));
      await loadPage(1, false, false);

      dispatch(
        setSnackbarMessage(
          `Item "${selectedApproveItem.varianceName || selectedApproveItem.itemCode
          }" approved successfully`
        )
      );
      dispatch(setOpenSnackbar(true));
    } catch (error) {
      dispatch(setSnackbarMessage(getApiErrorMessage(error, "Failed to approve item")));
      dispatch(setOpenSnackbar(true));
    } finally {
      dispatch(setOpenApproveDialog(false));
      dispatch(setSelectedApproveItem(null));
      dispatch(setApproveDescription(""));
      isApprovingRef.current = false;
    }
  }, [
    dispatch,
    branches,
    selectedLocation,
    selectedApproveItem,
    approveDescription,
    adjustmentReason,
    loadPage,
    apiDate,
    isApprovableRow,
  ]);

  const handleBulkApproveSelected = useCallback(() => {
    if (
      !selectedLocation ||
      selectedApprovalItemCodes.length === 0 ||
      bulkApproving ||
      isApprovingRef.current
    ) {
      return;
    }
    setBulkApprovalType("SELECTED");
    setBulkApprovalModalOpen(true);
  }, [selectedLocation, selectedApprovalItemCodes, bulkApproving]);

  const executeBulkApproveSelected = useCallback(async (mode: "ADJUST_SYSTEM" | "KEEP_SYSTEM", description: string) => {
    if (!selectedLocation || selectedApprovalItemCodes.length === 0) return;
    isApprovingRef.current = true;

    try {
      const branch = branches.find(
        (branch) =>
          branch.locationId === selectedLocation ||
          branch.locationName === selectedLocation ||
          branch.aliasName === selectedLocation
      );
      const result = await dispatch(
        approveBulkItems({
          itemCodes: selectedApprovalItemCodes,
          locationId: branch?.locationId || selectedLocation,
          queryDate: apiDate,
          approvedBy: "Inventory",
          description: description || "Bulk approved from variance module",
          adjustmentMode: mode,
        })
      ).unwrap();

      setSelectedApprovalItemCodes([]);
      setShowPendingOnly(false);
      isPendingSelectionRef.current = false;
      dispatch(setCurrentPage(1));
      dispatch(setAllItems([]));
      await loadPage(1, false, false);

      dispatch(
        setSnackbarMessage(
          `Bulk approval completed. Approved: ${result.approvedCount
          }, Skipped: ${result.totalRequested - result.approvedCount}`
        )
      );
      dispatch(setOpenSnackbar(true));
    } catch (error) {
      dispatch(setSnackbarMessage(getApiErrorMessage(error, "Failed to approve selected items")));
      dispatch(setOpenSnackbar(true));
    } finally {
      isApprovingRef.current = false;
    }
  }, [selectedLocation, selectedApprovalItemCodes, branches, dispatch, apiDate, loadPage]);

 


  const handleSelectAllPending = useCallback(async () => {
    if (!selectedLocation || bulkApproving || approveAllBranchLoading) {
      return;
    }

    const branch = branches.find(
      (b) =>
        b.locationId === selectedLocation ||
        b.locationName === selectedLocation ||
        b.aliasName === selectedLocation
    );

    const locationId = branch?.locationId || selectedLocation;

    try {
 
      const result = await dispatch(
        fetchPendingCodes({
          locationId,
          queryDate: apiDate,
        })
      ).unwrap();

      const pendingCodes: string[] = Array.isArray(result.itemCodes)
        ? result.itemCodes
          .map((code: unknown) => String(code ?? "").trim())
          .filter(Boolean)
        : [];

      if (pendingCodes.length === 0) {
        setSelectedApprovalItemCodes([]);
        setShowPendingOnly(false);

        dispatch(
          setSnackbarMessage(
            result.message || "No pending items found for this branch."
          )
        );
        dispatch(setOpenSnackbar(true));

        return;
      }

      // Fast local lookup
      const pendingCodeSet = new Set(pendingCodes);

      // ---------------------------------------------------------
      // STEP 2: Select immediately + enable pending view
      // ---------------------------------------------------------
      isPendingSelectionRef.current = true;

      setSelectedApprovalItemCodes(pendingCodes);
      setShowPendingOnly(true);

      // ---------------------------------------------------------
      // STEP 3: Fetch first 100 items immediately
      // ---------------------------------------------------------
      const firstPageResult = await dispatch(
        fetchItems({
          locationId,
          page: 1,
          limit: 100,
          queryDate: apiDate,
          includeSalesReturn: true,
          includeWastageReturn: true,
          includeStockTransfer: true,
          include_filter_options: false,
          resetFilterOptions: false,
        } as FetchParams)
      ).unwrap();

      const firstPageItems: Branchitem[] =
        firstPageResult.branchwise || [];

      // Show matching pending rows IMMEDIATELY
      const firstPendingItems = firstPageItems.filter((item) =>
        pendingCodeSet.has(String(item.itemCode ?? "").trim())
      );

      dispatch(setAllItems(firstPendingItems));
      dispatch(setCurrentPage(1));
      dispatch(setHasMoreData(false));
      dispatch(setTotalItems(pendingCodes.length));
      dispatch(setTotalPages(1));

      dispatch(
        setSnackbarMessage(
          `${pendingCodes.length} pending items selected.`
        )
      );
      dispatch(setOpenSnackbar(true));

      // ---------------------------------------------------------
      // STEP 4: Determine remaining pages
      // ---------------------------------------------------------
      const totalBranchItems = Number(
        firstPageResult.total || firstPageItems.length
      );

      const totalPages = Math.ceil(totalBranchItems / 100);

      if (totalPages <= 1) {
        return;
      }

      // ---------------------------------------------------------
      // STEP 5: Fetch remaining pages in parallel
      // ---------------------------------------------------------
      const remainingPages = Array.from(
        { length: totalPages - 1 },
        (_, index) => index + 2
      );

      const results = await Promise.all(
        remainingPages.map((page) =>
          dispatch(
            fetchItems({
              locationId,
              page,
              limit: 100,
              queryDate: apiDate,
              includeSalesReturn: true,
              includeWastageReturn: true,
              includeStockTransfer: true,
              include_filter_options: false,
              resetFilterOptions: false,
            } as FetchParams)
          ).unwrap()
        )
      );

      // ---------------------------------------------------------
      // STEP 6: Collect remaining pending rows
      // ---------------------------------------------------------
      const remainingPendingItems: Branchitem[] = results.flatMap(
        (pageResult) =>
          (pageResult.branchwise || []).filter((item: Branchitem) =>
            pendingCodeSet.has(String(item.itemCode ?? "").trim())
          )
      );

      // ---------------------------------------------------------
      // STEP 7: Add remaining pending rows
      // Remove duplicates safely
      // ---------------------------------------------------------
      const combinedPendingItems = [
        ...firstPendingItems,
        ...remainingPendingItems,
      ];

      const uniquePendingItems = Array.from(
        new Map(
          combinedPendingItems.map((item) => [
            String(item.itemCode ?? "").trim(),
            item,
          ])
        ).values()
      );

      dispatch(setAllItems(uniquePendingItems));
      dispatch(setTotalItems(uniquePendingItems.length));
      dispatch(setTotalPages(1));
      dispatch(setCurrentPage(1));
      dispatch(setHasMoreData(false));
    } catch (error) {
      console.error("Select All Pending failed:", error);

      dispatch(
        setSnackbarMessage("Failed to fetch pending item codes.")
      );
      dispatch(setOpenSnackbar(true));
    }
  }, [
    selectedLocation,
    bulkApproving,
    approveAllBranchLoading,
    branches,
    dispatch,
    apiDate,
  ]);


  // Approve ALL items for the branch in one backend call (reads closing doc once)
const handleApproveAllBranch = useCallback(async () => {
  if (
    !selectedLocation ||
    approveAllBranchLoading ||
    isApprovingRef.current
  ) {
    return;
  }

  const branch = branches.find(
    (b) =>
      b.locationId === selectedLocation ||
      b.locationName === selectedLocation ||
      b.aliasName === selectedLocation
  );

  const locationId = branch?.locationId || selectedLocation;

  try {
    setLoadingApprovalPreview(true);

    // Get the REAL pending item codes from backend
    const pendingResult = await dispatch(
      fetchPendingCodes({
        locationId,
        queryDate: apiDate,
      })
    ).unwrap();

    const pendingCodes = Array.isArray(pendingResult?.itemCodes)
      ? pendingResult.itemCodes
          .map((code) => String(code ?? "").trim())
          .filter(Boolean)
      : [];

    if (pendingCodes.length === 0) {
      setHasPendingApprovals(false);

      dispatch(
        setSnackbarMessage("No pending items available for approval.")
      );

      dispatch(setOpenSnackbar(true));

      return;
    }

// ======================================================
// LOAD ONLY ITEMS MANUALLY SUBMITTED FROM
// PHYSICAL STOCK MODIFICATION
// This affects ONLY popup preview.
// Approve All backend / DB logic is NOT changed.
// ======================================================

// Pending codes come from backend (monitor app requests).
// Do NOT depend on localStorage - requests submitted from the
// monitor app never write to this browser's localStorage.
const submittedCodeSet = new Set(pendingCodes);
const PREVIEW_PAGE_LIMIT = 100;
const firstPage = await dispatch(
  fetchItems({
    locationId,
    page: 1,
     limit: PREVIEW_PAGE_LIMIT,
    queryDate: apiDate,


    include_filter_options: false,
    resetFilterOptions: false,
  } as FetchParams)
).unwrap();

const previewTotalPages = Math.ceil(
  Number(firstPage?.total || 0) / PREVIEW_PAGE_LIMIT
);

const otherPages = previewTotalPages > 1
  ? await Promise.all(
      Array.from({ length: previewTotalPages - 1 }, (_, i) =>
        dispatch(
          fetchItems({
            locationId,
            page: i + 2,
            limit: PREVIEW_PAGE_LIMIT,
            queryDate: apiDate,
            include_filter_options: false,
            resetFilterOptions: false,
          } as FetchParams)
        ).unwrap()
      )
    )
  : [];

const freshItems: Branchitem[] = [firstPage, ...otherPages].flatMap(
  (pageResult) => pageResult?.branchwise || []
);
 

// Exact itemCode match - prevents another similarly named item
const matchedPendingItems: Branchitem[] = freshItems
  .filter((item: Branchitem) =>
    submittedCodeSet.has(
      String(item.itemCode ?? "").trim()
    )
  )
  .map((item: Branchitem) => {
    const systemStock = Number(
      item.updatedCurrentSystemQty ??
      item.updatedCurrentSystem ??
      item.systemStock ??
      0
    );

    const physicalStock = Number(
      item.physicalClosingQty ??
      item.physicalClosing ??
      item.physicalStock ??
      0
    );

    return {
      ...item,
      systemStock,
      physicalStock,
      variance: physicalStock - systemStock,
    };
  });
// Dialog shows ONLY items where physical stock was entered (> 0).
// Approve All backend still updates ALL pending items (zeros included).
const previewItems: Branchitem[] = matchedPendingItems.filter(
  (item: Branchitem) => Number(item.physicalStock ?? 0) > 0
);
console.log(
  "LATEST SUBMITTED CODES:",
  Array.from(submittedCodeSet)
);

console.log(
  "FRESH APPROVAL ITEMS:",
  previewItems
);

setApprovalPreviewItems(previewItems);

if (matchedPendingItems.length === 0) {
    dispatch(
    setSnackbarMessage(
      "Submitted items were not found in the current pending variance data."
    )
  );

  dispatch(setOpenSnackbar(true));
  return;
}

if (previewItems.length === 0) {
  dispatch(
    setSnackbarMessage(
      "No manually submitted physical stock items found for approval."
    )
  );

  dispatch(setOpenSnackbar(true));

  return;
}
  setApprovalStage("PREVIEW");
  setApprovalFailedReasons([]);
    setApprovalProgress(0);

setApprovalResult({
  total: previewItems.length,
  verified: 0,
  failed: 0,
});

    setBulkApprovalType("BRANCH");
    setBulkApprovalModalOpen(true);

  } catch (error) {
    console.error("Approve All preview failed:", error);

    dispatch(
      setSnackbarMessage(
        getApiErrorMessage(
          error,
          "Failed to load pending approval items."
        )
      )
    );

    dispatch(setOpenSnackbar(true));

  } finally {
    setLoadingApprovalPreview(false);
  }
}, [
  selectedLocation,
  approveAllBranchLoading,
  branches,
  dispatch,
  apiDate,
  allItems,
]);

  const executeApproveAllBranch = useCallback(async (mode: "ADJUST_SYSTEM" | "KEEP_SYSTEM", description: string) => {
    if (!selectedLocation) return;
    isApprovingRef.current = true;

    const branch = branches.find(
      (b) =>
        b.locationId === selectedLocation ||
        b.locationName === selectedLocation ||
        b.aliasName === selectedLocation
    );
    const locationId = branch?.locationId || selectedLocation;
    const branchLabel = branch?.aliasName || branch?.locationName || locationId;

    try {
      setApprovalStage("APPROVING");
setApprovalProgress(25);
      const result = await dispatch(
        approveAllBranch({
          locationId,
          queryDate: apiDate,
          approvedBy: "Inventory",
          description: description || `Branch bulk approval — ${branchLabel}`,
          adjustmentMode: mode,
        })
      ).unwrap();
setApprovalStage("VERIFYING");
setApprovalProgress(80);

setApprovalFailedReasons(result.failedReasons || []);

setApprovalResult({
  total: result.totalInClosing,
  verified: result.verified,
  failed: result.verificationFailedItems?.length || 0,
});
if (
  !result.success ||
  !result.dbVerified ||
  result.verified !== result.totalInClosing ||
  (result.verificationFailedItems?.length || 0) > 0
) {
  setApprovalStage("FAILED");
  setApprovalProgress(0);

  dispatch(
    setSnackbarMessage(
      `Approval verification failed. ${result.verified}/${result.totalInClosing} items verified in database.`
    )
  );

  dispatch(setOpenSnackbar(true));

  return;
}
      setSelectedApprovalItemCodes([]);
      setShowPendingOnly(false);
      isPendingSelectionRef.current = false;
      dispatch(setCurrentPage(1));
      dispatch(setAllItems([]));
      await loadPage(1, false, false);
// Approval completed + DB verified.
// Do not allow this submitted batch to appear again.
localStorage.removeItem(
  "outletPhysicalStockSubmittedItems"
);
setApprovalStage("SUCCESS");
setApprovalProgress(100);

dispatch(
  setSnackbarMessage(
    `✓ Approval completed and database verified. ${result.verified}/${result.totalInClosing} items successfully verified.`
  )
);

dispatch(setOpenSnackbar(true));
} catch (error) {
  setApprovalStage("FAILED");
  setApprovalProgress(0);

  dispatch(
    setSnackbarMessage(
      getApiErrorMessage(error, "Branch approval failed")
    )
  );

  dispatch(setOpenSnackbar(true));
}finally {
      isApprovingRef.current = false;
    }
  }, [
    selectedLocation,
    branches,
    dispatch,
    apiDate,
    loadPage,
  ]);

  const handleAdjustmentDialogClose = useCallback(() => {
    dispatch(setOpenAdjustmentDialog(false));
    dispatch(setSelectedItem(null));
    dispatch(setAdjustedPhysicalStock(""));
    dispatch(setAdjustmentReason(""));
  }, [dispatch]);

  const handleSnackbarClose = useCallback(
    () => dispatch(setOpenSnackbar(false)),
    [dispatch]
  );

  const handleRefresh = useCallback(async () => {
    if (!selectedLocation) return;

    setIsRefreshing(true);

    try {
      dispatch(setCurrentPage(1));
      dispatch(setAllItems([]));
      setSelectedApprovalItemCodes([]);

      await loadPage(1, false, true);

      dispatch(setSnackbarMessage("Data refreshed."));
      dispatch(setOpenSnackbar(true));
    } catch {
      dispatch(setSnackbarMessage("Error refreshing data."));
      dispatch(setOpenSnackbar(true));
    } finally {
      setIsRefreshing(false);
    }
  }, [dispatch, selectedLocation, loadPage]);

  const getTotalColspan = useCallback(() => {
    const visibleStaticCount = staticColumns.filter(
      (col) => visibleColumns[col]
    ).length;

    const visibleFieldCount = selectedLocation
      ? fieldTypes.filter((col) => visibleColumns[col] !== false).length
      : 0;

    return visibleStaticCount + visibleFieldCount + 1;
  }, [visibleColumns, selectedLocation, fieldTypes, staticColumns]);

  const toggleFullScreen = useCallback(() => {
    dispatch(setIsFullScreen(!isFullScreen));

    if (isFullScreen && filterMenuAnchorEl.current) {
      filterMenuAnchorEl.current();
    }
  }, [dispatch, isFullScreen]);



  const itemsWithIds = useMemo(
    () =>
      allItems.map((item: Branchitem, index: number) => {
        const row: Branchitem & { id: string } = {
          ...item,

          id:
            item.id ||
            `${item.itemCode || item.itemName}-${item.varianceName || "N/A"
            }-${index}`,

          itemName: item.itemName || "N/A",
          varianceName: item.varianceName || "N/A",
          category: item.category || "N/A",
          subCategory: item.subCategory || "N/A",
          itemCode: item.itemCode || "N/A",

          openingStockQty: item.openingStockQty?.toString() ?? "0",
          closingStockQty: item.closingStockQty?.toString() ?? "0",
          stockStatus: item.stockStatus ?? "unknown",

          received:
            item.received?.toString() ?? item.receivedQty?.toString() ?? "0",
          dispatchedQty: item.dispatchedQty?.toString() ?? "0",
          salesQty: item.salesQty?.toString() ?? "0",
          salesReturn:
            item.salesReturnQty?.toString() ??
            item.salesReturn?.toString() ??
            "0",

          wastageReturnQty: item.wastageReturnQty?.toString() ?? "0",
          warehouseReturnQty: item.warehouseReturnQty?.toString() ?? "0",
          stockTransferInQty: item.stockTransferInQty?.toString() ?? "0",
          stockTransferOutQty: item.stockTransferOutQty?.toString() ?? "0",

          currentSystemQty:
            item.currentSystemQty?.toString() ??
            item.currentInventorySystemStock?.toString() ??
            "0",

          stockVariance:
            item.stockVariance?.toString() ?? item.variance?.toString() ?? "0",

          approvalStatus: item.approvalStatus ?? "notAvailable",

          physicalVariance:
            item.physicalVariance?.toString() ??
            item.variance?.toString() ??
            "-",

          updatedCurrentSystemQty:
            item.updatedCurrentSystemQty?.toString() ??
            item.updatedCurrentSystem?.toString() ??
            item.systemStock?.toString() ??
            "-",

          physicalClosingQty:
            item.physicalClosingQty?.toString() ??
            item.physicalClosing?.toString() ??
            item.physicalStock?.toString() ??
            "-",

          approveButton: Boolean(item.approvalButton),
          canApprove: Boolean(item.canApprove),
          status: item.status,
          stockSource: item.stockSource,
        };

        if (selectedLocation) {
          fieldTypes.forEach((field) => {
            const key = `${selectedLocation}-${field}`;

            switch (field) {
              case "Opening-Stock":
                row[key] = item.openingStockQty?.toString() ?? "0";
                break;
              case "Receiving-Stock":
                row[key] = item.received?.toString() ?? "0";
                break;
              case "Stock IN":
                row[key] = item.stockTransferInQty?.toString() ?? "0";
                break;
              case "Stock OUT":
                row[key] = item.stockTransferOutQty?.toString() ?? "0";
                break;
              case "Sales":
                row[key] = item.salesQty?.toString() ?? "0";
                break;
              case "Sales Return":
                row[key] =
                  item.salesReturnQty?.toString() ??
                  item.salesReturn?.toString() ??
                  "0";
                break;
              case "Wastages":
                row[key] = item.wastageReturnQty?.toString() ?? "0";
                break;
              case "Warehouse Return":
                row[key] = item.warehouseReturnQty?.toString() ?? "0";
                break;
              case "Calc System":
                row[key] = item.closingStockQty?.toString() ?? "0";
                break;
              case "Physical Stock":
                row[key] =
                  item.physicalClosingQty?.toString() ??
                  item.physicalClosing?.toString() ??
                  item.physicalStock?.toString() ??
                  "-";
                break;
              case "Variance":
                row[key] =
                  item.stockVariance?.toString() ??
                  item.variance?.toString() ??
                  "-";
                break;
              case "System Stock":
                row[key] =
                  item.updatedCurrentSystemQty?.toString() ??
                  item.updatedCurrentSystem?.toString() ??
                  item.systemStock?.toString() ??
                  "-";
                break;
              case "Action":
                row[key] = item.approvalStatus ?? "notAvailable";
                break;
              default:
                row[key] = item[key]?.toString() ?? "0";
            }
          });
        }

        return row;
      }),
    [allItems, selectedLocation, fieldTypes]
  );




  const displayedItems = useMemo(
    () =>
      showPendingOnly
        ? itemsWithIds.filter((item) =>
          selectedApprovalItemCodes.some(
            (code) => String(code).trim() === String(item.itemCode).trim()
          )
        )
        : itemsWithIds,
    [showPendingOnly, itemsWithIds, selectedApprovalItemCodes]
  );



  const handleSelectAllClick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rows = itemsWithIds || [];
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
    [itemsWithIds, isApprovableRow]
  );

  const filterBar = (
    <FilterBar
      key={`filter-${selectedLocation}`}
      onRefresh={handleRefresh}
      searchParams={searchParams}
      onSearchChange={handleSearchChange}
      branches={branches}
      selectedLocation={selectedLocation}
      onLocationChange={handleLocationChange}
      visibleColumns={visibleColumns}
      onToggleColumn={handleToggleColumn}
      fieldTypes={fieldTypes}
      staticColumns={staticColumns}
      loading={loading}
      isFullScreen={isFullScreen}
      fullScreenContainerRef={fullScreenContainerRef}
      setResetAnchorEl={(fn) => {
        filterMenuAnchorEl.current = fn;
      }}
      showColumnFilter
      onLoadMoreFilterOptions={loadFilterOptions}
      isRefreshing={isRefreshing}
      cascadeSourceKey={cascadeSourceKey}
      cascadeLoading={cascadeLoading}
      onCascadeReset={() => {
        setCascadeSourceKey(null);
        setCascadeLoading(false);
      }}
    />
  );

  const anyApprovalBusy = bulkApproving || approveAllBranchLoading || loading;

  const bulkActionBar = (
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
        {/* Select All Pending */}
        <Tooltip title="Fetch ALL pending item codes for this branch (not just visible rows)" arrow>
          <Button
            variant="outlined"
            size="small"
            disabled={anyApprovalBusy || !selectedLocation}
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
            Select All Pending
          </Button>
        </Tooltip>

        {/* Clear selection */}
        {selectedApprovalCount > 0 && (
          <Button
            variant="outlined"
            size="small"
            disabled={anyApprovalBusy}
            // onClick={() => setSelectedApprovalItemCodes([])}
            onClick={async () => {
              isPendingSelectionRef.current = false;

              setSelectedApprovalItemCodes([]);
              setShowPendingOnly(false);

              dispatch(setCurrentPage(1));
              dispatch(setAllItems([]));

              await loadPage(1, false, false);
            }}
            sx={{
              height: 30,
              borderRadius: "9px",
              textTransform: "none",
              fontSize: "0.72rem",
              fontWeight: 700,
            }}
          >
            Clear
          </Button>
        )}

        {/* Approve Selected */}
        {selectedApprovalCount > 0 && (
          <Button
            variant="contained"
            size="small"
            disabled={anyApprovalBusy}
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

        {/* Approve All Branch */}
        <Tooltip
          title="Approve ALL pending items for this branch in one call — reads closing doc once, processes 500 at a time"
          arrow
        >
          <Button
            variant="contained"
            size="small"
            disabled={
  anyApprovalBusy ||
  checkingPendingApprovals ||
  !selectedLocation ||
  !hasPendingApprovals
}
            onClick={handleApproveAllBranch}
            sx={{
              height: 30,
              borderRadius: "9px",
              textTransform: "none",
              fontSize: "0.72rem",
              fontWeight: 900,
              bgcolor: UI.success,
              "&:hover": { bgcolor: UI.successDark },
              "&:disabled": { opacity: 0.5 },
            }}
          >
            {approveAllBranchLoading ? "Approving Branch..." : "✓ Approve All"}
          </Button>
        </Tooltip>
      </Box>
    </Box>
  );

  const tableSection = (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: UI.surface,
        borderRadius: "12px",
        overflow: "hidden",
        border: `1px solid ${UI.border}`,
      }}
    >
      {bulkActionBar}

      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <DataTable
          loading={loading}
          filteredItems={displayedItems}
          // newly add this line 14 8 1
          onSortChange={handleColumnSort}
          visibleColumns={{
            ...visibleColumns,
            Select: true,
            "Item Name": false,
            Status: false,
          }}
          fieldTypes={fieldTypes}
          selectedLocation={selectedLocation}
          editableRows={editableRows}
          onCellEdit={handleCellEdit}
          totalColspan={getTotalColspan()}
          onScroll={handleScroll}
          hasMoreData={hasMoreData}
          isLoadingMore={isLoadingMore}
          scrollContainerRef={scrollContainerRef}
          inputRefs={inputRefs}
          isFullScreen={isFullScreen}
          handleApproveClick={handleApproveClick}
          selectedApprovalItemCodes={selectedApprovalItemCodes}
          onToggleSelectRow={(itemCode) => {
            setSelectedApprovalItemCodes((prev) =>
              prev.includes(itemCode)
                ? prev.filter((code) => code !== itemCode)
                : [...prev, itemCode]
            );
   
          }}
          onSelectAll={handleSelectAllClick}
        />
      </Box>
    </Box>
  );

  const footer = selectedLocation && totalItems > 0 && (

    <PaginationControls
      currentPage={currentPageSafe}
      totalItems={totalItems}
      totalPages={totalPagesSafe}
      loading={loading}
      isFullScreen={isFullScreen}
      startItem={allItems.length === 0 ? 0 : (currentPageSafe - 1) * ITEMS_PER_PAGE + 1}
      endItem={Math.min(currentPageSafe * ITEMS_PER_PAGE, totalItems)}
      hideSubmit={true}
      onSubmitClick={() => { }}
    />
  );

  const dialogs = (
    <>
      <StockAdjustmentDialog
        open={openAdjustmentDialog}
        item={selectedItem}
        adjustedPhysicalStock={adjustedPhysicalStock}
        adjustmentReason={adjustmentReason}
        onCancel={handleAdjustmentDialogClose}
        onChangePhysicalStock={(value) =>
          dispatch(setAdjustedPhysicalStock(value))
        }
        onChangeReason={(value) => dispatch(setAdjustmentReason(value))}
        fullScreen={isFullScreen}
      />

      <ApprovalModal
        isOpen={openApproveDialog}
        onClose={() => dispatch(setOpenApproveDialog(false))}
        onConfirm={handleApproveConfirm}
        itemName={selectedApproveItem?.varianceName ?? "N/A"}
        systemStock={Number(
          selectedApproveItem?.updatedCurrentSystemQty ??
          selectedApproveItem?.updatedCurrentSystem ??
          selectedApproveItem?.systemStock ??
          0
        )}
        physicalStock={Number(
          selectedApproveItem?.physicalClosingQty ??
          selectedApproveItem?.physicalClosing ??
          selectedApproveItem?.physicalStock ??
          0
        )}
        variance={Number(
          selectedApproveItem?.stockVariance ??
          selectedApproveItem?.variance ??
          0
        )}
        isLoading={isApprovingRef.current || loading}
      />

      {!isFullScreen && (
        <ConfirmDialog
          open={openFirstDialog}
          totalItems={totalItems}
          changesLength={changes.length}
          onClose={handleSnackbarClose}
          fullScreen={isFullScreen}
        />
      )}

      <FeedbackSnackbar
        open={openSnackbar}
        message={snackbarMessage}
        onClose={handleSnackbarClose}
      />

      <ApprovalModal
        isOpen={bulkApprovalModalOpen}
        onClose={() => setBulkApprovalModalOpen(false)}
        itemName={bulkApprovalType === "BRANCH" ? "All Pending Items in Branch" : `Selected Pending Items (${selectedApprovalItemCodes.length})`}
       systemStock={0}
physicalStock={0}
variance={0}
bulkItems={
  bulkApprovalType === "BRANCH"
    ? approvalPreviewItems
    : []
}
  stage={bulkApprovalType === "BRANCH" ? approvalStage : "PREVIEW"}
  progress={bulkApprovalType === "BRANCH" ? approvalProgress : 0}
  totalItems={approvalResult.total}
  verifiedItems={approvalResult.verified}
  failedItems={approvalResult.failed}
  failedReasons={bulkApprovalType === "BRANCH" ? approvalFailedReasons : []}
        isLoading={bulkApprovalType === "BRANCH" ? approveAllBranchLoading : bulkApproving}
onConfirm={async (mode, desc) => {
  if (bulkApprovalType === "BRANCH") {
    await executeApproveAllBranch(mode, desc);
    return;
  }

  await executeBulkApproveSelected(mode, desc);
  setBulkApprovalModalOpen(false);
}}
      />
    </>
  );

  return (
    <Box
      ref={fullScreenContainerRef}
      sx={{
        height: "calc(100dvh - var(--app-topbar-height, 64px))",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: UI.pageBg,
        pt: "env(safe-area-inset-top)",
        pb: "env(safe-area-inset-bottom)",
        ...(isFullScreen
          ? {
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100dvh",
            zIndex: 9999,
            backgroundColor: UI.pageBg,
          }
          : {}),
      }}
    >
      {!isFullScreen && <OutletsInventoryManagementPage />}

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
            minHeight: 46,
            minWidth: 0,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>{filterBar}</Box>

          <Tooltip title={isFullScreen ? "Exit fullscreen" : "Fullscreen"} arrow>
            <IconButton
              onClick={toggleFullScreen}
              size="small"
              aria-label={isFullScreen ? "Exit fullscreen" : "Fullscreen"}
              sx={{
                width: 34,
                height: 34,
                borderRadius: "9px",
                border: `1px solid ${UI.border}`,
                color: UI.accent,
                bgcolor: UI.surface,
                flexShrink: 0,
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
          minHeight: 0,
          px: { xs: 0.75, md: 1 },
          pt: 0.6,
          pb: 0.6,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {selectedLocation ? (
          <>
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                borderRadius: "12px",
              }}
            >
              {tableSection}
            </Box>

            {footer && (
              <Box
                sx={{
                  flexShrink: 0,
                  mt: 0.55,
                }}
              >
                {footer}
              </Box>
            )}
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
                Select an outlet
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
                Choose an outlet from the filter bar to view physical stock
                variance data.
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {dialogs}
    </Box>
  );
};

// FG / RM: remount the whole screen when the type changes so every effect starts clean
const OutletPhysicalStockVarianceModificationByType: React.FC = () => {
  const { stockType, hydrated } = useOutletStockType();
  if (!hydrated) return null;
  return <OutletPhysicalStockVarianceModification key={stockType} />;
};

export default OutletPhysicalStockVarianceModificationByType;