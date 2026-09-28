"use client";

import React, {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ChangeEvent,
} from "react";
import { Box, Paper } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchRawMaterials,
  fetchWarehouses,
  updateRawMaterialStock,
  selectFilterOptions,
  selectLoading as selectRawMaterialsLoading,
  selectFilteredRawMaterials,
  selectHasMore,
  selectFilters,
  selectWarehouses,
  selectWarehousesLoading,
  setFilter,
  setPageOnly,
  resetRawMaterials,
  selectOpenSnackbar,
  setOpenSnackbar,
  selectOpenDownloadDialog,
  setOpenDownloadDialog,
  selectEditMessage,
  setEditMessage,
  selectOpenDialog,
  setOpenDialog,
  selectOpenModal,
  setOpenModal,
  selectUpdatedStocks,
  setUpdatedStocks,
  selectChanges,
  setChanges,
  selectChangedRows,
  setChangedRows,
  RawMaterial,
  RawMaterialsState,
  clearAllFilters,
  downloadExportCSV,
  downloadSampleCSV,
  importRawMaterialStock,
  updateRawMaterialsBulk,
} from "../../../../features/yen_inventory/wharehoueSlice";
import { AppDispatch, RootState } from "@/redux/store";
import FilterBar from "../../../../components/Inventory/stock/filterBar";
import DataTable from "../../../../components/Inventory/stock/dataTable";
import PaginationControls from "../../../../components/Inventory/stock/paginationcontrol";
import ConfirmDialog from "../../../../components/Inventory/stock/confirmDailog";
import FeedbackSnackbar from "../../../../components/Inventory/stock/feedbackSnakbar";
import UpdatedStocksModal from "../../../../components/Inventory/stock/updateStockModel";
import DownloadDialog from "../../../../components/Inventory/stock/downloadDialog";
import ConfirmActionDialog from "@/components/Inventory/shared/ConfirmActionDialog";
import InventoryActionSnackbar from "@/components/Inventory/shared/InventoryActionSnackbar";
import { withApiReason } from "@/components/Inventory/shared/apiError";
import { useInventoryAsyncAction } from "@/components/Inventory/shared/useInventoryAsyncAction";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import WarehouseInventoryManagementPage from "../page";
import { useTodayDate } from "@/components/Hooks/useTodayDate";

export interface TableRowData {
  id: string;
  index: number;
  itemName: string;
  varianceName: string;

  category: string;
  subcategory: string;
  locationId: string;
  systemStock: number | null;
  systemStockSo: number | null;
  physicalStock: number | null;
  itemCode: string;
  previousSystemStock: number | null;
  randomId: string;
  itemGroup?: string;
}

type SearchKey =
  | "categorySearch"
  | "subCategorySearch"
  | "itemNameSearch"
  | "varianceNameSearch";

type PageKey =
  | "categoryPage"
  | "subCategoryPage"
  | "itemNamePage"
  | "varianceNamePage";

type LimitKey =
  | "categoryLimit"
  | "subCategoryLimit"
  | "itemNameLimit"
  | "varianceNameLimit";

const UI = {
  pageBg: "#f6f9fd",
  surface: "#ffffff",
  border: "#e8eef6",
};

const WarehousePhysicalStockModification: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  const filterOptions = useSelector(selectFilterOptions);
  const loading = useSelector(selectRawMaterialsLoading);
  const warehouses = useSelector(selectWarehouses);
  const warehousesLoading = useSelector(selectWarehousesLoading);
  const rows = useSelector(
    (state: RootState) => state.rawMaterials.accumulatedRawMaterials
  );
  const filteredRawMaterials = useSelector(selectFilteredRawMaterials);
  const hasMore = useSelector(selectHasMore);
  const currentFilters = useSelector(selectFilters);
  const openSnackbar = useSelector(selectOpenSnackbar);
  const openDownloadDialog = useSelector(selectOpenDownloadDialog);
  const editMessage = useSelector(selectEditMessage);
  const openDialog = useSelector(selectOpenDialog);
  const openModal = useSelector(selectOpenModal);
  const updatedStocks = useSelector(selectUpdatedStocks);
  const changes = useSelector(selectChanges);
  const changedRows = useSelector(selectChangedRows);
  const todayDate = useTodayDate();

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const isInitializedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const pendingImportFileRef = useRef<File | null>(null);

  const [confirmExportOpen, setConfirmExportOpen] = React.useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = React.useState(false);
  const [cascadeSourceKey, setCascadeSourceKey] = React.useState<string | null>(
    null
  );
  const [cascadeLoading, setCascadeLoading] = React.useState(false);
  
  // Puthiya State: Submit panniya value UI-la maintain panna
  const [persistedChanges, setPersistedChanges] = React.useState<Record<string, number>>({});

  const actionGuard = useInventoryAsyncAction();

  const limit = currentFilters.limit || 30;
  const total = filteredRawMaterials?.total || 0;
  const currentPage = currentFilters.page || 1;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const startItem = total > 0 ? (currentPage - 1) * limit + 1 : 0;
  const endItem = total > 0 ? Math.min(startItem + limit - 1, total) : 0;
  const isInitialLoading = loading && total === 0;

  const getFallbackCascadeSource = useCallback(
    (filters: Partial<RawMaterialsState["filters"]>) => {
      const orderedKeys = [
        "varianceName",
        "itemName",
        "purchasesubcategoryName",
        "purchasecategoryName",
      ] as const;

      return (
        orderedKeys.find((key) => {
          const value = filters[key];
          return Array.isArray(value) ? value.length > 0 : Boolean(value);
        }) ?? null
      );
    },
    []
  );

  useEffect(() => {
    dispatch(fetchWarehouses({}));
  }, [dispatch]);

  useEffect(() => {
    if (warehouses.length > 0 && !warehousesLoading && !currentFilters.locationId) {
      const storedLocation = localStorage.getItem("globalSelectedWarehouseLocation");
      if (storedLocation && warehouses.some(w => w.locationId === storedLocation)) {
        dispatch(setFilter({ field: "locationId", value: storedLocation }));
      }
    }
  }, [warehouses, warehousesLoading, currentFilters.locationId, dispatch]);

  useEffect(() => {
    if (!todayDate) return;

    if (
      !isInitializedRef.current &&
      warehouses.length > 0 &&
      !warehousesLoading &&
      currentFilters.locationId
    ) {
      dispatch(
        fetchRawMaterials({
          params: {
            page: 1,
            limit: 30,
            locationId: currentFilters.locationId,
            includeDropdowns: true,
            createdDate: todayDate,
          } as Partial<RawMaterialsState["filters"]>,
          skipCache: true, // Cache problem avoid panna
          append: false,
        })
      );

      isInitializedRef.current = true;
    }
  }, [
    dispatch,
    warehouses.length,
    warehousesLoading,
    currentFilters.locationId,
    todayDate,
  ]);

  const handleSearchChange = useCallback(
    (field: keyof RawMaterialsState["filters"], value: string | string[]) => {
      dispatch(setChanges([]));
      dispatch(setUpdatedStocks([]));
      dispatch(setChangedRows({}));
      setPersistedChanges({}); // Filter maathum pothu persisted changes-ah clear pannu

      const processed = Array.isArray(value) ? value : value ? [value] : [];
      const isCascadeField = field !== "locationId";

      const nextFilters = {
        ...currentFilters,
        [field]: field === "locationId" ? value : processed,
      };

      if (!isCascadeField) {
        localStorage.setItem("globalSelectedWarehouseLocation", value as string);
        setCascadeSourceKey(getFallbackCascadeSource(nextFilters));
        setCascadeLoading(false);
      } else if (processed.length === 0) {
        if (cascadeSourceKey === String(field)) {
          setCascadeSourceKey(getFallbackCascadeSource(nextFilters));
          setCascadeLoading(false);
        }
      } else {
        setCascadeSourceKey(String(field));
        setCascadeLoading(true);
      }

      dispatch(
        setFilter({
          field: field,
          value: field === "locationId" ? value : processed,
        })
      );
      dispatch(setFilter({ field: "page", value: 1 }));

      dispatch(
        fetchRawMaterials({
          params: {
            ...(field === "locationId"
              ? { locationId: value as string }
              : { [field]: processed }),
            page: 1,
            includeDropdowns: true,
            createdDate: todayDate,
          } as Partial<RawMaterialsState["filters"]>,
          append: false,
          skipCache: true,
        })
      )
        .unwrap()
        .catch((error) => {
          const message = withApiReason(
            "Unable to load inventory data",
            error,
            "Unable to load inventory data. Please try again."
          );
          dispatch(setEditMessage(message));
          dispatch(setOpenSnackbar(true));
        })
        .finally(() => {
          setCascadeLoading(false);
        });
    },
    [
      dispatch,
      todayDate,
      cascadeSourceKey,
      currentFilters,
      getFallbackCascadeSource,
    ]
  );

  const handleClearAllFilters = useCallback(() => {
    if (actionGuard.disableAllActions) return;

    setCascadeSourceKey(null);
    setCascadeLoading(false);
    setPersistedChanges({}); // Clear all pannum pothu clear pannu

    const currentLocation = currentFilters.locationId;
    const currentAlias = currentFilters.aliasName;

    dispatch(clearAllFilters());
    
    if (currentLocation) {
      dispatch(setFilter({ field: "locationId", value: currentLocation }));
    }

    if (currentAlias) {
      dispatch(setFilter({ field: "aliasName", value: currentAlias }));
    }
    
    dispatch(setChanges([]));
    dispatch(setUpdatedStocks([]));
    dispatch(setChangedRows({}));

    dispatch(
      fetchRawMaterials({
        params: {
          ...currentFilters,
          purchasecategoryName: undefined,
          purchasesubcategoryName: undefined,
          itemName: undefined,
          varianceName: undefined,
          createdDate: todayDate,
          page: 1,
        },
        skipCache: true,
        append: false,
      })
    );
  }, [dispatch, currentFilters, actionGuard.disableAllActions, todayDate]);

  const handleTableScrollBottom = useCallback(() => {
    if (hasMore && !loading && !loadingRef.current) {
      loadingRef.current = true;
      const nextPage = currentFilters.page + 1;

      dispatch(
        fetchRawMaterials({
          page: nextPage,
          append: true,
          skipCache: true,
          params: {
            ...currentFilters,
            page: nextPage,
            createdDate: todayDate,
          },
        })
      )
        .unwrap()
        .then(() => {
          dispatch(setPageOnly(nextPage));
        })
        .catch(() => {})
        .finally(() => {
          loadingRef.current = false;
        });
    }
  }, [hasMore, loading, currentFilters, dispatch, todayDate]);

  const handleFilterScrollBottom = useCallback(
    (field: "categories" | "subcategories" | "itemNames" | "varianceNames") => {
      const map: Record<
        "categories" | "subcategories" | "itemNames" | "varianceNames",
        { page: PageKey; limit: LimitKey; search: SearchKey }
      > = {
        categories: {
          page: "categoryPage",
          limit: "categoryLimit",
          search: "categorySearch",
        },
        subcategories: {
          page: "subCategoryPage",
          limit: "subCategoryLimit",
          search: "subCategorySearch",
        },
        itemNames: {
          page: "itemNamePage",
          limit: "itemNameLimit",
          search: "itemNameSearch",
        },
        varianceNames: {
          page: "varianceNamePage",
          limit: "varianceNameLimit",
          search: "varianceNameSearch",
        },
      };

      const { page, limit: limitKey, search } = map[field];
      const nextPage =
        (currentFilters[page as keyof typeof currentFilters] as number) + 1;

      dispatch(
        fetchRawMaterials({
          params: {
            ...currentFilters,
            [page]: nextPage,
            [limitKey]: currentFilters[limitKey] || 10,
            [search]: currentFilters[search] || "",
            createdDate: todayDate,
          },
          field,
          append: true,
        })
      );

      dispatch(setFilter({ field: page, value: nextPage }));
    },
    [dispatch, currentFilters, todayDate]
  );

  const handleFilterSearch = useCallback(
    (
      field: "categories" | "subcategories" | "itemNames" | "varianceNames",
      searchTerm: string
    ) => {
      const fieldMapping = {
        categories: {
          page: "categoryPage",
          limit: "categoryLimit",
          search: "categorySearch",
        },
        subcategories: {
          page: "subCategoryPage",
          limit: "subCategoryLimit",
          search: "subCategorySearch",
        },
        itemNames: {
          page: "itemNamePage",
          limit: "itemNameLimit",
          search: "itemNameSearch",
        },
        varianceNames: {
          page: "varianceNamePage",
          limit: "varianceNameLimit",
          search: "varianceNameSearch",
        },
      };

      const { page, limit, search } = fieldMapping[field];
      const pageKey = page as PageKey;
      const limitKey = limit as LimitKey;
      const searchKey = search as SearchKey;

      dispatch(setFilter({ field: pageKey, value: 1 }));
      dispatch(setFilter({ field: searchKey, value: searchTerm }));

      const searchParams = {
        ...currentFilters,
        [pageKey]: 1,
        [limitKey]: currentFilters[limitKey] || 10,
        [searchKey]: searchTerm,
        createdDate: todayDate,
      };

      dispatch(
        fetchRawMaterials({
          params: searchParams,
          field,
          append: false,
          isFilterRequest: true,
        })
      );
    },
    [dispatch, currentFilters, todayDate]
  );

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasMore || loading) return;

    loadingRef.current = true;
    const nextPage = currentFilters.page + 1;

    try {
      await dispatch(
        fetchRawMaterials({
          params: {
            ...currentFilters,
            page: nextPage,
            createdDate: todayDate,
          },
          append: true,
          skipCache: true,
        })
      ).unwrap();

      dispatch(setPageOnly(nextPage));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error loading next page";
      dispatch(setEditMessage(message));
      dispatch(setOpenSnackbar(true));
    } finally {
      loadingRef.current = false;
    }
  }, [dispatch, hasMore, currentFilters, loading, todayDate]);

  const loadPreviousPage = useCallback(async () => {
    if (currentFilters.page <= 1 || loadingRef.current || loading) return;

    loadingRef.current = true;

    try {
      const prevPage = currentFilters.page - 1;

      dispatch(setFilter({ field: "page", value: prevPage }));

      await dispatch(
        fetchRawMaterials({
          params: {
            ...currentFilters,
            page: prevPage,
            createdDate: todayDate,
          },
          append: false,
          skipCache: true,
        })
      ).unwrap();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : "Error loading previous page";

      dispatch(setEditMessage(message));
      dispatch(setOpenSnackbar(true));
    } finally {
      loadingRef.current = false;
    }
  }, [dispatch, currentFilters, loading, todayDate]);

  const mappedRows: TableRowData[] = useMemo(() => {
    return rows.map((item: RawMaterial, index: number) => {
      const change = changes.find((c) => c.randomId === item.randomId);
      const persistedValue = persistedChanges[item.randomId]; // Puthiya variable

      return {
        id: item.randomId,
        index: index + 1,
        itemName: item.varianceName || "-",
        varianceName: item.varianceName || "-",
        itemGroup: item.itemName || "-",  
        category: item.category || "-",
        subcategory: item.subcategory || "-",
        locationId: currentFilters.locationId || "-",
        systemStockSo: item.systemStockSo ?? null,
        systemStock: item.stockQuantity ?? null,
        physicalStock:
          change?.newValue !== undefined 
            ? change.newValue 
            : (persistedValue !== undefined ? persistedValue : item.physicalStock ?? null),
        itemCode: item.itemCode ? String(item.itemCode) : "N/A",
        previousSystemStock: item.previousSystemStock ?? null,
        randomId: item.randomId,
      };
    });
  }, [rows, changes, currentFilters.locationId, persistedChanges]);

  const handlePhysicalStockChange = useCallback(
    (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      itemName: string,
      varianceName: string,
      randomId: string,
      currentSystemStock: number
    ) => {
      const rawValue = event.target.value;

      if (rawValue === "") {
        dispatch(setChanges(changes.filter((c) => c.randomId !== randomId)));
        dispatch(
          setUpdatedStocks(
            updatedStocks.filter((c) => c.randomId !== randomId)
          )
        );

        const updatedChangedRows = { ...changedRows };
        delete updatedChangedRows[randomId];

        dispatch(setChangedRows(updatedChangedRows));
        return;
      }

      const numericValue = Number(rawValue);

      const updatedChange = {
        itemName,
        newValue: numericValue,
        varianceName: varianceName || "N/A",
        randomId,
        systemStock: currentSystemStock,
        locationId: currentFilters.locationId,
      };

      dispatch(
        setChanges(
          changes.some((c) => c.randomId === randomId)
            ? changes.map((c) => (c.randomId === randomId ? updatedChange : c))
            : [...changes, updatedChange]
        )
      );

      dispatch(
        setUpdatedStocks(
          updatedStocks.some((c) => c.randomId === randomId)
            ? updatedStocks.map((c) =>
                c.randomId === randomId ? updatedChange : c
              )
            : [...updatedStocks, updatedChange]
        )
      );

      dispatch(setChangedRows({ ...changedRows, [randomId]: true }));
    },
    [dispatch, currentFilters.locationId, changes, updatedStocks, changedRows]
  );

  const handleSubmitClick = useCallback(() => {
    if (changes.length > 0) {
      dispatch(setUpdatedStocks(changes));
      dispatch(setOpenDialog(true));
    } else {
      dispatch(setEditMessage("No changes to submit."));
      dispatch(setOpenSnackbar(true));
    }
  }, [dispatch, changes]);

   const handleConfirmSubmit = useCallback(async () => {
    if (isSubmittingRef.current || actionGuard.disableAllActions) return;

    const actionId = actionGuard.startAction(
      "saving",
      "Saving changes. Please wait..."
    );

    if (!actionId) return;

    isSubmittingRef.current = true;
    dispatch(setOpenDialog(false));

    if (changes.length === 0) {
      dispatch(setEditMessage("No changes to submit."));
      dispatch(setOpenSnackbar(true));
      isSubmittingRef.current = false;
      actionGuard.finishAction(undefined, actionId);
      return;
    }

    try {
      if (changes.length === 1) {
        const change = changes[0];

        await dispatch(
          updateRawMaterialStock({
            randomId: change.randomId,
            warehouseId: currentFilters.locationId,
            physicalStock: change.newValue,
            updatedBy: "",
            description: "",
          })
        ).unwrap();
      } else {
        await dispatch(
          updateRawMaterialsBulk({
            warehouseId: currentFilters.locationId,
            updates: changes.map((c) => ({
              randomId: c.randomId,
              warehouseId: currentFilters.locationId,
              physicalStock: c.newValue,
            })),
          })
        ).unwrap();
      }

      dispatch(setEditMessage("Changes saved successfully."));
      
      // Puthiya Logic: Submit aana data-va namma local state-la vachikrom
      const newPersisted = { ...persistedChanges };
      changes.forEach((c) => {
        newPersisted[c.randomId] = c.newValue;
      });
      setPersistedChanges(newPersisted);

      dispatch(setChanges([])); 
      dispatch(setUpdatedStocks([]));
      dispatch(setChangedRows({}));
      
      actionGuard.finishAction("Changes saved successfully.", actionId);
    } catch (error) {
      const message = withApiReason(
        "Stock update failed",
        error,
        "Unable to save stock changes."
      );
      dispatch(setEditMessage(message));
      actionGuard.failAction(
        message,
        "Stock update failed. Please try again.",
        actionId
      );
    } finally {
      isSubmittingRef.current = false;
      dispatch(setOpenSnackbar(true));
    }
  }, [dispatch, changes, currentFilters, todayDate, actionGuard, persistedChanges]);
  
  const handleSnackbarClose = useCallback(
    (event?: React.SyntheticEvent | Event, reason?: string) => {
      if (reason === "clickaway") return;
      dispatch(setOpenSnackbar(false));
    },
    [dispatch]
  );

  const handleCloseModal = useCallback(() => {
    dispatch(setOpenModal(false));
  }, [dispatch]);

  const handleRefreshData = useCallback(async () => {
    if (!currentFilters.locationId) return;
    if (actionGuard.disableAllActions) return;

    const actionId = actionGuard.startAction(
      "loading",
      "Loading inventory data..."
    );

    if (!actionId) return;

    try {
      dispatch(resetRawMaterials());

      await dispatch(
        fetchRawMaterials({
          params: {
            ...currentFilters,
            page: 1,
            includeDropdowns: true,
            createdDate: todayDate,
          },
          skipCache: true,
          append: false,
        })
      ).unwrap();

      actionGuard.finishAction("Inventory data loaded.", actionId);
    } catch (error) {
      const message = withApiReason(
        "Unable to load inventory data",
        error,
        "Unable to load inventory data. Please try again."
      );
      dispatch(setEditMessage(message));
      dispatch(setOpenSnackbar(true));
      actionGuard.failAction(
        message,
        "Unable to load inventory data. Please try again.",
        actionId
      );
    }
  }, [dispatch, currentFilters, todayDate, actionGuard]);

  const handleDownloadCSV = useCallback(() => {
    if (actionGuard.disableAllActions) return;

    if (!currentFilters.locationId) {
      actionGuard.showMessage("Please select a warehouse first.", "warning");
      return;
    }

    setConfirmExportOpen(true);
  }, [currentFilters.locationId, actionGuard]);

  const handleConfirmExport = useCallback(async () => {
    const actionId = actionGuard.startAction(
      "exporting",
      "Preparing export. Please wait..."
    );

    if (!actionId) return;

    setConfirmExportOpen(false);

    try {
      await dispatch(
        downloadExportCSV({
          locationId: currentFilters.locationId,
          aliasName: currentFilters.aliasName,
          purchasecategoryName: Array.isArray(
            currentFilters.purchasecategoryName
          )
            ? currentFilters.purchasecategoryName.join(",")
            : currentFilters.purchasecategoryName,
          purchasesubcategoryName: Array.isArray(
            currentFilters.purchasesubcategoryName
          )
            ? currentFilters.purchasesubcategoryName.join(",")
            : currentFilters.purchasesubcategoryName,
          itemName: Array.isArray(currentFilters.itemName)
            ? currentFilters.itemName.join(",")
            : currentFilters.itemName,
          varianceName: Array.isArray(currentFilters.varianceName)
            ? currentFilters.varianceName.join(",")
            : currentFilters.varianceName,
        })
      ).unwrap();

      actionGuard.finishAction("Export downloaded successfully.", actionId);
    } catch (error) {
      actionGuard.failAction(
        withApiReason("Export failed", error, "Export failed. Please try again."),
        "Export failed. Please try again.",
        actionId
      );
    }
  }, [dispatch, currentFilters, actionGuard]);

  const handleDownloadSampleCSV = useCallback(async () => {
    if (actionGuard.disableAllActions) return;

    const actionId = actionGuard.startAction(
      "exporting",
      "Preparing sample export. Please wait..."
    );

    if (!actionId) return;

    try {
      await dispatch(downloadSampleCSV()).unwrap();
      actionGuard.finishAction("Sample downloaded successfully.", actionId);
    } catch (error) {
      actionGuard.failAction(
        withApiReason("Export failed", error, "Export failed. Please try again."),
        "Export failed. Please try again.",
        actionId
      );
    }
  }, [dispatch, actionGuard]);

  const handleImportCSV = useCallback(
    async (file: File) => {
      if (actionGuard.disableAllActions) return;

      if (!currentFilters.locationId) {
        actionGuard.showMessage("Please select a warehouse first.", "warning");
        return;
      }

      const validExtensions = [".csv", ".xlsx", ".xls"];

      if (
        !file ||
        !validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
      ) {
        actionGuard.showMessage("Please select a valid import file.", "warning");
        return;
      }

      pendingImportFileRef.current = file;
      setConfirmImportOpen(true);
    },
    [currentFilters.locationId, actionGuard]
  );

  const handleConfirmImport = useCallback(async () => {
    const file = pendingImportFileRef.current;

    if (!file) {
      actionGuard.showMessage("Please select a valid import file.", "warning");
      return;
    }

    const actionId = actionGuard.startAction(
      "importing",
      "Importing data. Please wait..."
    );

    if (!actionId) return;

    setConfirmImportOpen(false);

    try {
      await dispatch(
        importRawMaterialStock({
          file,
          locationId: currentFilters.locationId,
        })
      ).unwrap();

      dispatch(resetRawMaterials());

      await dispatch(
        fetchRawMaterials({
          params: {
            ...currentFilters,
            page: 1,
            createdDate: todayDate,
            includeDropdowns: true,
          },
          skipCache: true,
          append: false,
        })
      ).unwrap();

      pendingImportFileRef.current = null;
      actionGuard.finishAction("Import completed successfully.", actionId);
    } catch (error) {
      const message = withApiReason(
        "Import failed",
        error,
        "Import failed. Please check the file and try again."
      );
      dispatch(setEditMessage(message));
      dispatch(setOpenSnackbar(true));
      actionGuard.failAction(
        message,
        "Import failed. Please check the file and try again.",
        actionId
      );
    }
  }, [dispatch, currentFilters, todayDate, actionGuard]);

  const downloadPDF = useCallback(() => {
    if (updatedStocks.length === 0) {
      dispatch(setEditMessage("No updated stock data to download."));
      dispatch(setOpenSnackbar(true));
      return;
    }

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Updated Raw Materials", 14, 16);

    const tableData = updatedStocks.map((stock) => [
      stock.itemName || "N/A",
      stock.varianceName || "N/A",
      stock.locationId || "N/A",
      stock.systemStock.toString(),
      stock.newValue.toString(),
    ]);

    autoTable(doc, {
      head: [
        [
          "Item Name",
          "Variance",
          "Warehouse",
          "System Stock",
          "Physical Stock",
        ],
      ],
      body: tableData,
      startY: 20,
      styles: { fontSize: 10, cellPadding: 2 },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    doc.save(`updated_raw_materials_${currentFilters.locationId || "all"}.pdf`);
  }, [dispatch, updatedStocks, currentFilters.locationId]);

  const downloadExcel = useCallback(() => {
    if (updatedStocks.length === 0) {
      dispatch(setEditMessage("No updated stock data to download."));
      dispatch(setOpenSnackbar(true));
      return;
    }

    const formattedData = updatedStocks.map((stock) => ({
      "Item Name": stock.itemName || "N/A",
      Variance: stock.varianceName || "N/A",
      Warehouse: stock.locationId || "N/A",
      "System Stock": stock.systemStock,
      "Physical Stock": stock.newValue,
    }));

    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Updated Raw Materials");
    XLSX.writeFile(
      wb,
      `updated_raw_materials_${currentFilters.locationId || "all"}.xlsx`
    );
  }, [dispatch, updatedStocks, currentFilters.locationId]);

  const normalizeToArray = (value?: string | string[]): string[] | undefined => {
    if (!value) return undefined;
    if (typeof value === "string") return [value];
    return value;
  };

  const normalizedFilters = {
    ...currentFilters,
    purchasecategoryName: normalizeToArray(currentFilters.purchasecategoryName),
    purchasesubcategoryName: normalizeToArray(
      currentFilters.purchasesubcategoryName
    ),
    itemName: normalizeToArray(currentFilters.itemName),
    varianceName: normalizeToArray(currentFilters.varianceName),
  };

  const formattedFilterOptions = useMemo(
    () => ({
      categories: filterOptions?.categories?.values || [],
      subcategories: filterOptions?.subcategories?.values || [],
      itemNames: filterOptions?.itemNames?.values || [],
      varianceNames: filterOptions?.varianceNames?.values || [],
      warehouses: Array.isArray(warehouses)
        ? warehouses.map((w) => ({
            label: `${w.locationName} (${w.aliasName})`,
            value: w.locationId,
            aliasName: w.aliasName,
          }))
        : [],
    }),
    [filterOptions, warehouses]
  );

  const hasAnyFilter =
    Boolean(currentFilters.purchasecategoryName) ||
    Boolean(currentFilters.purchasesubcategoryName) ||
    Boolean(currentFilters.itemName) ||
    Boolean(currentFilters.varianceName);

  const currentLocationLabel =
    currentFilters.aliasName || currentFilters.locationId || "";

  return (
    <Box
      sx={{
        height: "calc(100dvh - var(--app-topbar-height, 64px))",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: UI.pageBg,
        pt: "env(safe-area-inset-top)",
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <WarehouseInventoryManagementPage />

      <Paper
        elevation={0}
        sx={{
          flexShrink: 0,
          borderRadius: 0,
          borderBottom: `1px solid ${UI.border}`,
          bgcolor: "rgba(255,255,255,0.92)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(248,251,255,0.86) 100%)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          position: "relative",
          zIndex: 100,
          px: { xs: 0.75, md: 1 },
          py: 0.55,
        }}
      >
        <FilterBar
          handleRefreshData={handleRefreshData}
          todayDate={todayDate}
          onClearAll={handleClearAllFilters}
          searchParams={normalizedFilters}
          onSearchChange={handleSearchChange}
          setOpenDownloadDialog={(value) =>
            dispatch(setOpenDownloadDialog(value))
          }
          filterOptions={formattedFilterOptions}
          onFilterScrollBottom={handleFilterScrollBottom}
          onFilterSearch={handleFilterSearch}
          warehousesLoading={warehousesLoading}
          onDownloadCSV={handleDownloadCSV}
          onDownloadSampleCSV={handleDownloadSampleCSV}
          onImportCSV={handleImportCSV}
          disabled={actionGuard.disableAllActions}
          busyType={actionGuard.busyType}
          cascadeSourceKey={cascadeSourceKey}
          cascadeLoading={cascadeLoading}
        />
      </Paper>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          px: { xs: 0.75, md: 1 },
          pt: 0.6,
          pb: !isInitialLoading && total > 0 ? 0 : 0.55,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            borderRadius: "12px",
          }}
        >
          <DataTable
            inputRefs={inputRefs}
            tableContainerRef={tableContainerRef}
            rows={mappedRows}
            onPhysicalStockChange={handlePhysicalStockChange}
            loading={loading}
            hasMore={hasMore}
            onScrollBottom={handleTableScrollBottom}
            changedRows={changedRows}
            disabled={actionGuard.disableAllActions}
          />
        </Box>

        {!isInitialLoading && total > 0 && (
          <Box sx={{ flexShrink: 0, mt: 0.55 }}>
            <PaginationControls
              currentPage={currentPage}
              totalItems={total}
              totalPages={totalPages}
              hasMoreData={hasMore}
              loading={loading}
              startItem={startItem}
              endItem={endItem}
              onPreviousPage={loadPreviousPage}
              onNextPage={loadNextPage}
              onSubmitClick={handleSubmitClick}
              disabled={actionGuard.disableAllActions}
            />
          </Box>
        )}
      </Box>
      <ConfirmDialog
        open={openDialog}
        totalItems={total}
        changes={changes}
        onClose={() => dispatch(setOpenDialog(false))}
        onConfirm={handleConfirmSubmit}
      />

      <FeedbackSnackbar
        open={openSnackbar && !actionGuard.snackbar.open}
        message={editMessage}
        onClose={handleSnackbarClose}
      />

      <UpdatedStocksModal
        open={openModal}
        updatedStocks={updatedStocks}
        onClose={handleCloseModal}
        onDownloadPDF={downloadPDF}
        onDownloadExcel={downloadExcel}
      />

      <DownloadDialog
        open={openDownloadDialog}
        onClose={() => dispatch(setOpenDownloadDialog(false))}
        onDownloadPDF={downloadPDF}
        onDownloadCSV={downloadExcel}
      />

      <ConfirmActionDialog
        open={confirmExportOpen}
        title={
          hasAnyFilter ? "Export filtered inventory data?" : "Export full inventory data?"
        }
        message={
          hasAnyFilter
            ? `This will export inventory data for the selected filters${
                currentLocationLabel ? ` at ${currentLocationLabel}` : ""
              }. Do you want to continue?`
            : `This may export a large file${
                currentLocationLabel ? ` for ${currentLocationLabel}` : ""
              }. Do you want to continue?`
        }
        warning={
          hasAnyFilter
            ? undefined
            : "Large exports can take extra time. Please wait until the download starts."
        }
        confirmText="Export"
        severity={hasAnyFilter ? "default" : "warning"}
        loading={actionGuard.busyType === "exporting"}
        onCancel={() => setConfirmExportOpen(false)}
        onConfirm={handleConfirmExport}
      />

      <ConfirmActionDialog
        open={confirmImportOpen}
        title="Import inventory data?"
        message="This will update inventory stock values from the selected file. Please make sure the file is correct before continuing."
        warning="Inventory stock values may change after import. This action should be done carefully."
        confirmText="Import"
        severity="warning"
        loading={actionGuard.busyType === "importing"}
        onCancel={() => setConfirmImportOpen(false)}
        onConfirm={handleConfirmImport}
      />

      <InventoryActionSnackbar
        {...actionGuard.snackbar}
        onClose={(_, reason) => actionGuard.closeSnackbar(reason)}
      />
    </Box>
  );
};

export default WarehousePhysicalStockModification;