import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/redux/store";
import {
  fetchBranches,
  fetchItems,
  setMultipleFilters,
  resetItems,
} from "./../store/outletPhysicalStockSlice";
import { withApiReason } from "@/components/Inventory/shared/apiError";
// newly add the line 29 7 1
import { useTodayDate } from "@/components/Hooks/useTodayDate";
export interface SearchParams {
  itemName: string[];
  varianceName: string[];
  category: string[];
  subCategory: string[];
  location: string[];
}

export const useStockModification = () => {
  const dispatch = useDispatch<AppDispatch>();
  const {
    branches,
    filters,
    // items,
    loading,
    // total,
  } = useSelector((state: RootState) => state.items);

  // const businessState = useSelector((state: RootState) => state.business);
  // const todayDate = businessState?.businessData?.date || null;
  // newly replace the part to line 29 7 1
  const todayDate = useTodayDate();

  const [searchParams, setSearchParams] = useState<SearchParams>(() => ({
    itemName: filters.itemName ? filters.itemName.split(",") : [],
    varianceName: filters.varianceName ? filters.varianceName.split(",") : [],
    category: filters.category ? filters.category.split(",") : [],
    subCategory: filters.subCategory ? filters.subCategory.split(",") : [],
    location: filters.branch ? [filters.branch] : [],
  }));

  const [selectedBranches, setSelectedBranches] = useState<string>("");
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [openSnackbar, setOpenSnackbar] = useState(false);

  const prevBranchesLengthRef = useRef(0);
  const isInitializedRef = useRef(false);
  const loadingRef = useRef(false);
  const skipNextSearchRef = useRef(false);

  // Fetch branches
  useEffect(() => {
    if (branches.length === 0) {
      dispatch(fetchBranches());
    }
  }, [dispatch, branches.length]);

  // Set default branch
  useEffect(() => {
    if (!todayDate) return;

    if (branches.length > 0 && prevBranchesLengthRef.current === 0 && !isInitializedRef.current) {
      const defaultBranch = branches[0].locationId;
      setSelectedBranches(defaultBranch);

      dispatch(
        setMultipleFilters({
          branch: defaultBranch,
          date: todayDate,
        })
      );

      isInitializedRef.current = true;
      prevBranchesLengthRef.current = branches.length;
    } else if (branches.length > prevBranchesLengthRef.current) {
      prevBranchesLengthRef.current = branches.length;
    }
  }, [branches, dispatch, todayDate]);

  // Initial load
  useEffect(() => {
    if (!todayDate || !selectedBranches) return;
    dispatch(
      // fetchItems({
      //   params: {
      //     branch: selectedBranches,
      //     date: todayDate,
      //     include_filter_options: true,
      //   },
      //   append: false,
      //   skipCache: true,
      // })
      // replace the part 10 8 1
      fetchItems({
        params: {
          branch: selectedBranches,
          date: todayDate,
         
          include_filter_options: true,
        },
        append: false,
        skipCache: true,
      })
    );
  }, [dispatch, todayDate, selectedBranches]);

  const arrayToCSV = (arr: string[]) =>
    arr.length > 0 ? arr.map((s) => s.trim()).join(",") : undefined;

  const handleSearch = useCallback(async () => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    if (!selectedBranches || selectedBranches.length === 0) {
      setEditMessage("Please select a branch before searching.");
      setOpenSnackbar(true);
      return;
    }

    if (loadingRef.current) return;
    loadingRef.current = true;
    setCascadeLoading(true);

    dispatch(resetItems());

    const filterUpdates = {
      page: 1,
      date: todayDate,
      branch: selectedBranches,
      category: arrayToCSV(searchParams.category),
      subCategory: arrayToCSV(searchParams.subCategory),
      itemName: arrayToCSV(searchParams.itemName),
      varianceName: arrayToCSV(searchParams.varianceName),
    };

    dispatch(setMultipleFilters(filterUpdates));

    try {
      await dispatch(
        // fetchItems({
        //   params: {
        //     ...filterUpdates,
        //     include_filter_options: true,
        //   },
        //   append: false,
        //   page: 1,
        //   skipCache: true,
        // })
        // replace the part 10 8 1
        fetchItems({
          params: {
            ...filterUpdates,
            date: todayDate,
            
            include_filter_options: true,
          },
          append: false,
          page: 1,
          skipCache: true,
        })
      ).unwrap();
    } catch (error) {
      const message = withApiReason(
        "Unable to load inventory data",
        error,
        "Unable to load inventory data. Please try again."
      );
      setEditMessage(message);
      setOpenSnackbar(true);
    } finally {
      loadingRef.current = false;
      setCascadeLoading(false);
    }
  }, [selectedBranches, searchParams, todayDate, dispatch]);

  const handleSearchChange = useCallback((field: keyof SearchParams, value: string[] | string) => {
    const newValue = Array.isArray(value) ? value : [value];
    const nextParams = { ...searchParams, [field]: newValue };
    setSearchParams(nextParams);
  }, [searchParams]);

  return {
    searchParams,
    setSearchParams,
    selectedBranches,
    setSelectedBranches,
    cascadeLoading,
    setCascadeLoading,
    editMessage,
    setEditMessage,
    openSnackbar,
    setOpenSnackbar,
    handleSearch,
    handleSearchChange,
    skipNextSearchRef,
  };
};
