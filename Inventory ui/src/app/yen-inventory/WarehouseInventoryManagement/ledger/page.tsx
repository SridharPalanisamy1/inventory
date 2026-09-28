'use client';

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

import {
  Box,
  Typography,
  Button,
  Table,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Chip,
  Grid,
  Card,
  CardContent,
  Divider,
  alpha,
  useTheme,
  useMediaQuery,
  Collapse,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';

import FilterAltIcon from '@mui/icons-material/FilterAlt';
import DownloadIcon from '@mui/icons-material/Download';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RefreshIcon from '@mui/icons-material/Refresh';
import ClearIcon from '@mui/icons-material/Clear';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { formatInventoryQty } from "@/components/Inventory/shared/numberFormat";
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/redux/store';
import moment from 'moment';
import { startOfMonth, endOfDay } from 'date-fns';
import DateRangeDialog from '../../../../components/Inventory/ledger/daterangeDialog';
import CollapsibleFilter from '@/components/Inventory/physcialstockvarience/ui/collabsfiler';
import { debounce } from 'lodash';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  fetchStockLedger,
  searchPurchaseItems,
  addSelectedItem,
  clearStockLedger,
  clearSearchResults,
  clearSelectedItems,
  setSearchQuery,
  selectStockLedger,
  selectStockLoading,
  selectSearchResults,
  selectSearchLoading,
  exportStockLedgerExcel,
  selectSearchQuery,
  selectWarehouses,
  selectSelectedWarehouse,
  clearSelectedWarehouse,
  setSelectedWarehouse,
  fetchWarehouses,
} from '../../../../features/yen_inventory/ledgerrawSlice';

import { convertImageToBase64 } from '@/components/Hooks/useTodayDate';
import { selectBusinesses } from '@/features/businessSlice';
import WarehouseInventoryManagementPage from '../page';
import DownloadDialog from '@/components/Inventory/ledger/ConfirmDialog';
import {
  formatLedgerValue,
  getWarehouseLedgerColor,
  getWarehouseLedgerSummary,
  type DateSelectionRange,
  type SearchItemsDebounce,
} from '@/features/yen_inventory/warehouseLedgerUtils';

const T = {
  pageBg: '#f6f9fd',
  surface: '#ffffff',
  surfaceSoft: '#fbfdff',

  headerGlass: 'rgba(248,251,255,0.72)',
  headerStickyGlass: 'rgba(248,251,255,0.92)',

  border: '#e8eef6',
  borderSoft: '#f0f4f8',
  borderStrong: 'rgba(203,213,225,0.62)',

  accent: '#1976d2',
  accentDark: '#1258a8',
  accentBg: '#eef6ff',

  success: '#16a34a',
  successBg: '#ecfdf5',
  successBorder: '#bbf7d0',

  warning: '#d97706',
  warningBg: '#fff7ed',

  danger: '#dc2626',
  dangerBg: '#fef2f2',

  info: '#4f46e5',
  infoBg: '#eef2ff',

  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',

  fontDisplay: `'Plus Jakarta Sans', 'DM Sans', sans-serif`,

  r1: '8px',
  r2: '12px',
  r3: '14px',
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  color,
  bgColor,
}) => (
  <Card
    elevation={0}
    sx={{
      height: '100%',
      border: `1px solid ${T.border}`,
      borderRadius: T.r2,
      background:
        'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(249,252,255,0.96) 100%)',
      boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
    }}
  >
    <CardContent
      sx={{
        p: '8px 10px !important',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 48,
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: T.r1,
          bgcolor: bgColor,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: '0.58rem',
            fontWeight: 850,
            color: T.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            mb: 0.2,
          }}
        >
          {label}
        </Typography>

        <Typography
          sx={{
            fontSize: '0.9rem',
            fontWeight: 900,
            color: T.textPrimary,
            lineHeight: 1,
            fontFamily: T.fontDisplay,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

const TABLE_COLS = [
  { label: 'Date', align: 'left' as const, sticky: true, accent: false, w: 110 },
  { label: 'Vendor', align: 'left' as const, sticky: false, accent: false },
  { label: 'In', align: 'right' as const, sticky: false, accent: false, color: T.success },
  { label: 'Ret-Vend', align: 'right' as const, sticky: false, accent: false, color: T.danger },
  { label: 'Return', align: 'right' as const, sticky: false, accent: false, color: T.warning },
  { label: 'Dispatch', align: 'left' as const, sticky: false, accent: false },
  { label: 'Out', align: 'right' as const, sticky: false, accent: false, color: T.danger },
  { label: 'Balance', align: 'right' as const, sticky: false, accent: true },
];

const StockSummaryPage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const stockLedger = useSelector(selectStockLedger);
  const loading = useSelector(selectStockLoading);
  const searchResults = useSelector(selectSearchResults);
  const warehouses = useSelector(selectWarehouses);
  const selectedWarehouse = useSelector(selectSelectedWarehouse);
  const searchLoading = useSelector(selectSearchLoading);
  const selectedItems = useSelector(
    (state: RootState) => state.stockSummary.selectedItems
  );
  const { businesses } = useSelector(selectBusinesses);
  const business = businesses?.[0];
  const searchQuery = useSelector(selectSearchQuery);
  const currentPage = useSelector(
    (state: RootState) => state.stockSummary.currentPage
  );
  const hasMore = useSelector((state: RootState) => state.stockSummary.hasMore);

  const [openDialog, setOpenDialog] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const debouncedSearchRef = useRef<SearchItemsDebounce | null>(null);
  const isFetchingRef = useRef(false);

  const today = new Date();

  const [selectionRange, setSelectionRange] = useState<DateSelectionRange>({
    startDate: startOfMonth(today),
    endDate: endOfDay(today),
    key: 'selection',
  });

  useEffect(() => {
    dispatch(fetchWarehouses({ page: 1, limit: 30 }));
    dispatch(searchPurchaseItems({ search: '', page: 1 }));

    debouncedSearchRef.current = debounce((term: string) => {
      dispatch(searchPurchaseItems({ search: term, page: 1 }));
    }, 400);

    return () => debouncedSearchRef.current?.cancel();
  }, [dispatch]);

  useEffect(() => {
    if (warehouses.length > 0 && !selectedWarehouse) {
      const storedLocation = localStorage.getItem("globalSelectedWarehouseLocation");
      let defaultWarehouse = warehouses[0].locationId;
      if (storedLocation && warehouses.some(w => w.locationId === storedLocation)) {
        defaultWarehouse = storedLocation;
      }
      dispatch(setSelectedWarehouse(defaultWarehouse));
    }
  }, [warehouses, selectedWarehouse, dispatch]);

  const handleSearchChange = (value: string) => {
    dispatch(setSearchQuery(value));
    dispatch(clearSearchResults());
    debouncedSearchRef.current?.(value);
  };

  const handleScrollBottom = useCallback(() => {
    if (searchLoading || !hasMore || isFetchingRef.current) return;

    isFetchingRef.current = true;

    dispatch(searchPurchaseItems({ search: searchQuery, page: currentPage }))
      .finally(() => {
        isFetchingRef.current = false;
      });
  }, [dispatch, currentPage, searchLoading, hasMore, searchQuery]);

  const handleItemSelectionChange = (selected: string[]) => {
    const selectedObjects = searchResults
      .filter((item) => selected.includes(item.randomId))
      .map((item) => ({ randomId: item.randomId, itemName: item.itemName }));

    dispatch(clearSelectedItems());
    selectedObjects.forEach((item) => dispatch(addSelectedItem(item)));
  };

  const fetchLedgerWithCurrentFilters = useCallback(() => {
    if (selectedItems.length === 0 || !selectedWarehouse) return;

    const warehouseName =
      warehouses.find((w) => w.locationId === selectedWarehouse)?.locationId ||
      '';

    dispatch(
      fetchStockLedger({
        fromDate: moment(selectionRange.startDate).format('YYYY-MM-DD'),
        toDate: moment(selectionRange.endDate).format('YYYY-MM-DD'),
        itemRandomId: selectedItems.map((item) => item.randomId).join(','),
        locationName: warehouseName,
      })
    );
  }, [
    dispatch,
    selectedItems,
    selectedWarehouse,
    selectionRange.endDate,
    selectionRange.startDate,
    warehouses,
  ]);

  const handleFilterClick = () => {
    fetchLedgerWithCurrentFilters();

    if (isMobile) {
      setFiltersOpen(false);
    }
  };

  const refreshDropdownData = useCallback(() => {
    dispatch(fetchWarehouses({ page: 1, limit: 30 }));
    dispatch(searchPurchaseItems({ search: searchQuery, page: 1 }));
  }, [dispatch, searchQuery]);

  const handleRefreshLedgerData = useCallback(() => {
    refreshDropdownData();

    if (selectedItems.length === 0 || !selectedWarehouse) {
      return;
    }

    const warehouseName =
      warehouses.find((w) => w.locationId === selectedWarehouse)?.locationId ||
      '';

    dispatch(
      fetchStockLedger({
        fromDate: moment(selectionRange.startDate).format('YYYY-MM-DD'),
        toDate: moment(selectionRange.endDate).format('YYYY-MM-DD'),
        itemRandomId: selectedItems.map((item) => item.randomId).join(','),
        locationName: warehouseName,
      })
    );
  }, [
    dispatch,
    refreshDropdownData,
    selectedItems,
    selectedWarehouse,
    selectionRange.endDate,
    selectionRange.startDate,
    warehouses,
  ]);

  const handleClearEverything = () => {
    dispatch(clearStockLedger());
    dispatch(clearSelectedItems());
    dispatch(clearSelectedWarehouse());
    dispatch(clearSearchResults());
    dispatch(setSearchQuery(''));
    dispatch(searchPurchaseItems({ search: '', page: 1 }));
    dispatch(fetchWarehouses({ page: 1, limit: 30 }));
  };

  const handleClearAllFilters = useCallback(() => {
    handleClearEverything();
    setSelectionRange({
      startDate: startOfMonth(new Date()),
      endDate: endOfDay(new Date()),
      key: 'selection',
    });
  }, []);

  const isAnyFilterActive =
    Boolean(selectedWarehouse) ||
    selectedItems.length > 0 ||
    Boolean(searchQuery) ||
    (!!stockLedger && Object.keys(stockLedger).length > 0);

  const stats = useMemo(
    () => getWarehouseLedgerSummary(stockLedger, selectedItems),
    [stockLedger, selectedItems]
  );

  interface LedgerTransaction {
    date?: string;
    grnVendorName?: string;
    dispatchBranch?: string;
    inStock?: number | string;
    outStock?: number | string;
    returnedStock?: number | string;
    returnedToVendor?: number | string;
    balanceStock?: number | string;
    [key: string]: unknown;
  }

  const getLedgerTransactions = (ledger?: { transactions?: unknown }): LedgerTransaction[] =>
    Array.isArray(ledger?.transactions) ? (ledger.transactions as LedgerTransaction[]) : [];

  interface JsPDFWithAutoTable extends jsPDF {
    lastAutoTable?: { finalY: number };
  }

  const handleDownloadPDF = async () => {
    if (!stockLedger || selectedItems.length === 0) return;

    const PRIMARY: [number, number, number] = [99, 102, 241];
    const LIGHT_BG: [number, number, number] = [238, 242, 255];
    const DARK: [number, number, number] = [30, 41, 59];
    const doc = new jsPDF('p', 'mm', 'a4') as JsPDFWithAutoTable;

    let logo = '';

    if (business?.imageUrl) {
      try {
        logo = await convertImageToBase64(business.imageUrl);
      } catch {}
    }

    const warehouseName =
      warehouses.find((w) => w.locationId === selectedWarehouse)
        ?.locationName || '';

    selectedItems.forEach((item, index) => {
      const ledger = stockLedger[item.randomId];

      if (!ledger) return;
      if (index > 0) doc.addPage();

      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, 210, 35, 'F');

      if (logo) doc.addImage(logo, 'PNG', 14, 8, 25, 12);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...DARK);
      doc.text(business?.companyName || 'Company Name', 45, 14);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`${business?.address1 || ''} ${business?.address2 || ''}`, 45, 19);
      doc.text(`GSTIN: ${business?.gstIn || '-'}`, 45, 23);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...PRIMARY);
      doc.text('STOCK LEDGER REPORT', 196, 14, { align: 'right' });

      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `Period: ${moment(selectionRange.startDate).format('DD-MM-YYYY')} to ${moment(
          selectionRange.endDate
        ).format('DD-MM-YYYY')}`,
        196,
        20,
        { align: 'right' }
      );
      doc.text(`Warehouse: ${warehouseName}`, 196, 25, { align: 'right' });

      doc.setDrawColor(200);
      doc.line(14, 38, 196, 38);

      doc.setFontSize(10);
      doc.setTextColor(...PRIMARY);
      doc.text(`Item: ${item.itemName}`, 14, 45);

      doc.setFillColor(...LIGHT_BG);
      doc.rect(14, 48, 182, 10, 'F');

      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(
        `Opening Balance: ${formatLedgerValue(ledger.openingReference?.closingStock)}`,
        18,
        54.5
      );
      doc.text(
        `Closing Balance: ${formatLedgerValue(ledger.closingSummary?.closingStock)}`,
        140,
        54.5
      );

      autoTable(doc, {
        startY: 62,
        margin: { left: 14, right: 14 },
        theme: 'grid',
        head: [
          [
            'Date',
            'Vendor / Particulars',
            'In Stock',
            'Ret. Out',
            'Dispatch Location',
            'Out',
            'Balance',
          ],
        ],
        body: getLedgerTransactions(ledger).map((row) => [
          moment(row.date).format('DD-MM-YYYY'),
          row.grnVendorName || row.dispatchBranch || '-',
          formatLedgerValue(row.inStock),
          formatLedgerValue(Number(row.returnedToVendor)),
          row.dispatchBranch || '-',
          formatLedgerValue(row.outStock),
          formatLedgerValue(row.balanceStock),
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, valign: 'middle' },
        headStyles: {
          fillColor: PRIMARY,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 22, halign: 'left' },
          1: { cellWidth: 'auto', halign: 'left' },
          2: { cellWidth: 18, halign: 'right' },
          3: { cellWidth: 18, halign: 'right' },
          4: { cellWidth: 35, halign: 'left' },
          5: { cellWidth: 18, halign: 'right' },
          6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
        },
      });
    });

    doc.save(`WarehouseStockLedger_${moment().format('DD_MM_YYYY')}.pdf`);
  };

  const handleDownloadExcel = () => {
    if (selectedItems.length === 0) return;

    const warehouseName =
      warehouses.find((w) => w.locationId === selectedWarehouse)?.locationId ||
      '';

    dispatch(
      exportStockLedgerExcel({
        fromDate: moment(selectionRange.startDate).format('YYYY-MM-DD'),
        toDate: moment(selectionRange.endDate).format('YYYY-MM-DD'),
        itemRandomId: selectedItems.map((item) => item.randomId).join(','),
        locationName: warehouseName || undefined,
      })
    );

    setOpenDialog(false);
  };

  const hasData =
    !!stockLedger &&
    selectedItems.length > 0 &&
    Object.keys(stockLedger).length > 0;

  const selectedWarehouseObj = warehouses.find(
    (warehouse) => warehouse.locationId === selectedWarehouse
  );

  const warehouseLabel = selectedWarehouseObj?.locationName || '';

  return (
    <>
      <style>{`
        .wsl-root * {
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .wsl-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        .wsl-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .wsl-scroll::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
        }

        .wsl-scroll::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .wsl-row:hover td {
          background: #f8fbff !important;
        }

        @keyframes wslIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .wsl-in {
          animation: wslIn 0.22s ease both;
        }
      `}</style>

      <Box
        className="wsl-root"
        sx={{
          bgcolor: T.pageBg,
          height: 'calc(100dvh - var(--app-topbar-height, 64px))',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <WarehouseInventoryManagementPage />

        <Box
          sx={{
            px: { xs: 0.75, md: 1 },
            py: 0.55,
            flexShrink: 0,
            borderBottom: `1px solid ${T.border}`,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,251,255,0.82) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <Collapse in={filtersOpen || !isMobile}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 0.5,
                flexWrap: 'wrap',
                width: '100%',

                '& .inventory-filter-field': {
                  width: '100% !important',
                  minWidth: '0 !important',
                  maxWidth: '100% !important',
                  flex: '1 1 auto !important',
                },

                '& .inventory-filter-button': {
                  height: '34px !important',
                  minHeight: '34px !important',
                  borderRadius: '9px !important',
                  padding: '3px 8px !important',
                },
              }}
            >
              <Box
                sx={{
                  height: 34,
                  px: 0.9,
                  display: { xs: 'none', sm: 'inline-flex' },
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: T.r1,
                  border: `1px solid ${T.border}`,
                  bgcolor: T.surface,
                  color: T.accentDark,
                  fontSize: '0.68rem',
                  fontWeight: 950,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  flex: '0 0 auto',
                  gap: 0.5,
                }}
              >
                <Inventory2OutlinedIcon sx={{ fontSize: 14 }} />
                Stock Ledger
              </Box>

              <Box
                sx={{
                  flex: {
                    xs: '1 1 100%',
                    sm: '0 1 clamp(145px, 16vw, 190px)',
                  },
                  minWidth: { xs: 0, sm: 145 },
                  maxWidth: { xs: '100%', sm: 200 },
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.56rem',
                    fontWeight: 900,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    mb: 0.2,
                  }}
                >
                  Warehouse
                </Typography>

                <CollapsibleFilter
                  title="Select warehouse"
                  inputType="single-select"
                  options={warehouses.map((warehouse) => ({
                    label: warehouse.locationName,
                    value: warehouse.locationId,
                  }))}
                  selectedOptions={selectedWarehouse || ''}
                  onChange={(value) => {
                     localStorage.setItem("globalSelectedWarehouseLocation", value as string);
                     dispatch(setSelectedWarehouse(value as string));
                   }}
                  onClear={() => dispatch(clearSelectedWarehouse())}
                />
              </Box>

              <Box
                sx={{
                  flex: {
                    xs: '1 1 100%',
                    sm: '0 1 clamp(220px, 28vw, 390px)',
                    lg: '0 1 clamp(240px, 24vw, 430px)',
                  },
                  minWidth: { xs: 0, sm: 220 },
                  maxWidth: { xs: '100%', sm: 410, lg: 440 },
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.56rem',
                    fontWeight: 900,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    mb: 0.2,
                  }}
                >
                  Items
                </Typography>

                <CollapsibleFilter
                  title="Select items"
                  inputType="multi-select"
                  isMulti
                  options={searchResults.map((item) => ({
                    label: item.itemName,
                    value: item.randomId,
                  }))}
                  selectedOptions={selectedItems.map((item) => item.randomId)}
                  onChange={(value) => handleItemSelectionChange(value as string[])}
                  onClear={() => dispatch(clearSelectedItems())}
                  onSearch={handleSearchChange}
                  onScrollBottom={handleScrollBottom}
                  loading={searchLoading}
                />
              </Box>

              <Box
                sx={{
                  flex: {
                    xs: '1 1 100%',
                    sm: '0 1 clamp(165px, 16vw, 210px)',
                  },
                  minWidth: { xs: 0, sm: 165 },
                  maxWidth: { xs: '100%', sm: 220 },
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.56rem',
                    fontWeight: 900,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    mb: 0.2,
                  }}
                >
                  Date Range
                </Typography>

                <DateRangeDialog
                  selectionRange={selectionRange}
                  setSelectionRange={setSelectionRange}
                  onApply={handleFilterClick}
                />
              </Box>

              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  justifyContent: { xs: 'flex-end', sm: 'flex-start' },
                  gap: 0.45,
                  flex: { xs: '1 1 100%', sm: '0 0 auto' },
                  ml: { xs: 0, lg: 'auto' },
                }}
              >
                <Tooltip title="Apply filters" arrow>
                  <span>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={
                        loading ? (
                          <CircularProgress size={13} color="inherit" />
                        ) : (
                          <FilterAltIcon />
                        )
                      }
                      onClick={handleFilterClick}
                      disabled={
                        selectedItems.length === 0 || !selectedWarehouse || loading
                      }
                      sx={{
                        bgcolor: T.accent,
                        '&:hover': { bgcolor: T.accentDark },
                        '&:disabled': {
                          bgcolor: T.border,
                          color: T.textMuted,
                        },
                        borderRadius: T.r1,
                        textTransform: 'none',
                        fontWeight: 850,
                        fontSize: '0.72rem',
                        height: 34,
                        px: 1.3,
                        minWidth: 84,
                        boxShadow: `0 4px 12px ${alpha(T.accent, 0.22)}`,
                      }}
                    >
                      Apply
                    </Button>
                  </span>
                </Tooltip>

                <Tooltip title="Clear all filters" arrow>
                  <span>
                    <IconButton
                      onClick={handleClearAllFilters}
                      disabled={!isAnyFilterActive}
                      size="small"
                      aria-label="Clear all filters"
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: T.r1,
                        border: `1px solid ${T.danger}`,
                        color: T.danger,
                        bgcolor: T.surface,
                        '&:hover': {
                          bgcolor: T.dangerBg,
                          borderColor: T.danger,
                        },
                        '&.Mui-disabled': {
                          border: `1px solid ${T.border}`,
                          color: T.textMuted,
                          bgcolor: T.surfaceSoft,
                        },
                      }}
                    >
                      <ClearIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title="Download report" arrow>
                  <span>
                    <IconButton
                      disabled={!hasData}
                      onClick={() => setOpenDialog(true)}
                      size="small"
                      aria-label="Download report"
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: T.r1,
                        border: `1px solid ${
                          hasData ? T.successBorder : T.border
                        }`,
                        color: hasData ? T.success : T.textMuted,
                        bgcolor: T.surface,
                        '&:hover': {
                          bgcolor: T.successBg,
                          borderColor: T.successBorder,
                        },
                      }}
                    >
                      <DownloadIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title="Refresh data" arrow>
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleRefreshLedgerData}
                      disabled={loading}
                      aria-label="Refresh data"
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: T.r1,
                        border: `1px solid ${T.border}`,
                        color: T.accent,
                        bgcolor: T.surface,
                        '&:hover': {
                          bgcolor: T.accentBg,
                          borderColor: T.borderStrong,
                        },
                        '&.Mui-disabled': {
                          color: T.textMuted,
                          bgcolor: T.surfaceSoft,
                        },
                      }}
                    >
                      {loading ? (
                        <CircularProgress size={15} thickness={4} />
                      ) : (
                        <RefreshIcon sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>

                {isMobile && (
                  <IconButton
                    size="small"
                    onClick={() => setFiltersOpen((value) => !value)}
                    aria-label={filtersOpen ? "Hide filters" : "Show filters"}
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: T.r1,
                      border: `1px solid ${T.border}`,
                      bgcolor: T.surface,
                    }}
                  >
                    <FilterAltIcon sx={{ fontSize: 16, color: T.accent }} />
                  </IconButton>
                )}
              </Box>
            </Box>
          </Collapse>
        </Box>

        {hasData && (
          <Box
            sx={{
              px: { xs: 0.75, md: 1 },
              pt: 0.55,
              pb: 0.45,
              flexShrink: 0,
            }}
            className="wsl-in"
          >
            <Grid container spacing={0.5}>
              {[
                {
                  label: 'Items',
                  value: stats.totalItems,
                  icon: <Inventory2OutlinedIcon sx={{ fontSize: 15 }} />,
                  color: T.accent,
                  bgColor: T.accentBg,
                },
                {
                  label: 'Opening',
                value: formatInventoryQty(stats.totalMovement),
                  icon: <LoginOutlinedIcon sx={{ fontSize: 15 }} />,
                  color: T.info,
                  bgColor: T.infoBg,
                },
                {
                  label: 'Movement',
                  value: stats.totalMovement.toFixed(2),
                  icon: <SwapHorizIcon sx={{ fontSize: 15 }} />,
                  color: T.warning,
                  bgColor: T.warningBg,
                },
                {
                  label: 'Closing',
                  value: formatInventoryQty(stats.totalClosing),
                  icon: <CheckCircleOutlineIcon sx={{ fontSize: 15 }} />,
                  color: T.success,
                  bgColor: T.successBg,
                },
              ].map((card, index) => (
                <Grid size={{ xs: 6, sm: 3 }} key={index}>
                  <StatCard {...card} />
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            px: { xs: 0.75, md: 1 },
            pb: 0.55,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {hasData && (
            <Box
              className="wsl-scroll"
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.65,
                pr: 0.1,
              }}
            >
              {selectedItems.map((item, index) => {
                const ledger = stockLedger[item.randomId];

                if (!ledger) return null;

                const ic = getWarehouseLedgerColor(index);
                const transactions = getLedgerTransactions(ledger);

                const totalIn = transactions.reduce(
                  (sum, txn) =>
                    sum +
                    (Number(txn.inStock) || 0) +
                    (Number(txn.returnedStock) || 0),
                  0
                );

                const totalOut = transactions.reduce(
                  (sum, txn) =>
                    sum +
                    (Number(txn.outStock) || 0) +
                    (Number(txn.returnedToVendor) || 0),
                  0
                );

                return (
                  <Paper
                    key={item.randomId}
                    elevation={0}
                    className="wsl-in"
                    sx={{
                      borderRadius: T.r3,
                      overflow: 'hidden',
                      border: `1px solid ${T.border}`,
                      bgcolor: T.surface,
                      boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                      flexShrink: 0,
                      animationDelay: `${index * 0.035}s`,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Box
                      sx={{
                        px: { xs: 1, md: 1.2 },
                        py: 0.7,
                        background:
                          'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,251,255,0.88) 100%)',
                        borderBottom: `1px solid ${T.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        flexShrink: 0,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.8,
                          minWidth: 0,
                        }}
                      >
                        <Box
                          sx={{
                            width: 30,
                            height: 30,
                            borderRadius: T.r1,
                            bgcolor: ic.light,
                            color: ic.main,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '0.72rem',
                            flexShrink: 0,
                          }}
                        >
                          {index + 1}
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            sx={{
                              fontWeight: 900,
                              fontSize: { xs: '0.78rem', md: '0.86rem' },
                              color: T.textPrimary,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              letterSpacing: '-0.02em',
                            }}
                          >
                            {ledger.itemDetails.itemName}
                          </Typography>

                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              mt: 0.15,
                            }}
                          >
                            <Chip
                              label={ledger.itemDetails.uom}
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: '0.56rem',
                                fontWeight: 900,
                                bgcolor: ic.light,
                                color: ic.main,
                                border: 'none',
                              }}
                            />

                            <Typography
                              sx={{
                                fontSize: '0.6rem',
                                color: T.textMuted,
                                fontWeight: 650,
                              }}
                            >
                              {transactions.length} transaction
                              {transactions.length !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: { xs: 1, md: 1.5 },
                          flexShrink: 0,
                        }}
                      >
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography
                            sx={{
                              fontSize: '0.55rem',
                              color: T.textMuted,
                              fontWeight: 850,
                              textTransform: 'uppercase',
                            }}
                          >
                            Open
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '0.8rem',
                              fontWeight: 850,
                              color: T.textSecondary,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatLedgerValue(
                              ledger.openingReference?.closingStock
                            )}
                          </Typography>
                        </Box>

                        <Divider
                          orientation="vertical"
                          flexItem
                          sx={{ height: 24, borderColor: T.border }}
                        />

                        <Box sx={{ textAlign: 'right' }}>
                          <Typography
                            sx={{
                              fontSize: '0.55rem',
                              color: T.textMuted,
                              fontWeight: 850,
                              textTransform: 'uppercase',
                            }}
                          >
                            Close
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '0.86rem',
                              fontWeight: 950,
                              color: T.success,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatLedgerValue(
                              ledger.closingSummary?.closingStock
                            )}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        px: { xs: 1, md: 1.2 },
                        py: 0.45,
                        bgcolor: alpha(T.warning, 0.045),
                        borderBottom: `1px solid ${alpha(T.warning, 0.14)}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 0.55,
                        flexShrink: 0,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.62rem',
                          fontWeight: 850,
                          color: '#92400e',
                        }}
                      >
                        Opening: {formatLedgerValue(ledger.openingReference?.closingStock)}{' '}
                        {ledger.itemDetails.uom}
                        {ledger.openingReference?.date
                          ? ` · ${moment(ledger.openingReference.date).format('DD MMM YYYY')}`
                          : ''}
                      </Typography>

                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                          }}
                        >
                          <TrendingUpIcon sx={{ fontSize: 12, color: T.success }} />
                          <Typography
                            sx={{
                              fontSize: '0.62rem',
                              fontWeight: 850,
                              color: T.success,
                            }}
                          >
                            In: {formatLedgerValue(totalIn)}
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                          }}
                        >
                          <TrendingDownIcon sx={{ fontSize: 12, color: T.danger }} />
                          <Typography
                            sx={{
                              fontSize: '0.62rem',
                              fontWeight: 850,
                              color: T.danger,
                            }}
                          >
                            Out: {formatLedgerValue(totalOut)}
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                          }}
                        >
                          <SwapHorizIcon sx={{ fontSize: 12, color: T.textMuted }} />
                          <Typography
                            sx={{
                              fontSize: '0.62rem',
                              fontWeight: 850,
                              color: T.textSecondary,
                            }}
                          >
                            Net: {formatLedgerValue(totalIn - totalOut)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Dynamic Height and Vertical Scroll Enabled here */}
                    <TableContainer
                      className="wsl-scroll"
                      sx={{
                        overflowX: 'auto',
                        overflowY: 'auto',
                        width: '100%',
                        maxWidth: '100%',
                        maxHeight: { xs: 'calc(100dvh - 460px)', sm: 'calc(100dvh - 380px)' }
                      }}
                    >
                      <Table
                        size="small"
                        stickyHeader
                        sx={{
                          minWidth: { xs: 720, md: 900 },
                          width: '100%',
                          tableLayout: 'fixed',
                          borderCollapse: 'separate',
                          borderSpacing: 0,
                        }}
                      >
                        <TableHead>
                          <TableRow
                            sx={{
                              '& th': {
                                position: 'sticky', // Sticky heading
                                top: 0,              // Sticks to top of table container
                                zIndex: 5,
                                height: 36,
                                backgroundColor: `${T.headerGlass} !important`,
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                borderBottom: `1px solid ${T.borderStrong}`,
                                color: T.textPrimary,
                                fontSize: '0.58rem',
                                fontWeight: 950,
                                textTransform: 'uppercase',
                                letterSpacing: '0.07em',
                                whiteSpace: 'nowrap',
                                px: { xs: 0.75, md: 1 },
                                py: 0.55,
                              },
                            }}
                          >
                            {TABLE_COLS.map((column, tableColumnIndex) => (
                              <TableCell
                                key={tableColumnIndex}
                                align={column.align}
                                sx={{
                                  bgcolor: column.accent
                                    ? `${alpha(T.success, 0.045)} !important`
                                    : undefined,
                                  color: column.accent
                                    ? `${T.success} !important`
                                    : column.color || undefined,
                                  ...(column.sticky
                                    ? {
                                        width: column.w,
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 6,
                                        backgroundColor: `${T.headerStickyGlass} !important`,
                                        backdropFilter: 'blur(12px)',
                                        WebkitBackdropFilter: 'blur(12px)',
                                        boxShadow: `1px 0 0 ${T.borderSoft}`,
                                      }
                                    : {}),
                                }}
                              >
                                {column.label}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>

                        <TableBody>
                          {transactions.map((row, rowIndex) => (
                            <TableRow
                              key={rowIndex}
                              className="wsl-row"
                              sx={{
                                '& td': {
                                  height: 34,
                                  borderBottom: `1px solid ${T.borderSoft}`,
                                  fontSize: '0.66rem',
                                  px: { xs: 0.75, md: 1 },
                                  py: 0.45,
                                  backgroundColor: '#ffffff',
                                },
                                '&:last-child td': { borderBottom: 0 },
                              }}
                            >
                              <TableCell
                                sx={{
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 3,
                                  bgcolor: '#ffffff',
                                  boxShadow: `1px 0 0 ${T.borderSoft}`,
                                  whiteSpace: 'nowrap',
                                  color: T.textPrimary,
                                  fontWeight: 850,
                                }}
                              >
                                {moment(row.date).format('DD MMM YYYY')}
                              </TableCell>

                              <TableCell
                                sx={{
                                  color: T.textSecondary,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {row.grnVendorName || row.dispatchBranch || '-'}
                              </TableCell>

                              <TableCell align="right" sx={{ color: T.success, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>
                                {formatLedgerValue(row.inStock)}
                              </TableCell>

                              <TableCell align="right" sx={{ color: T.danger, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>
                                {formatLedgerValue(Number(row.returnedToVendor))}
                              </TableCell>

                              <TableCell align="right" sx={{ color: T.warning, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>
                                {formatLedgerValue(row.returnedStock)}
                              </TableCell>

                              <TableCell
                                sx={{
                                  color: T.textSecondary,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {row.dispatchBranch || '-'}
                              </TableCell>

                              <TableCell align="right" sx={{ color: T.danger, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>
                                {formatLedgerValue(row.outStock)}
                              </TableCell>

                              <TableCell
                                align="right"
                                sx={{
                                  color: T.success,
                                  fontWeight: 950,
                                  bgcolor: alpha(T.success, 0.04),
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {formatLedgerValue(row.balanceStock)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                );
              })}
            </Box>
          )}

          {!hasData && (
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <Inventory2OutlinedIcon sx={{ fontSize: 48, color: T.border }} />
              <Typography sx={{ color: T.textMuted, fontSize: '0.85rem', fontWeight: 700 }}>
                No ledger data found
              </Typography>
              <Typography sx={{ color: T.textMuted, fontSize: '0.75rem' }}>
                Select warehouse, items, and date range, then apply filters.
              </Typography>
            </Box>
          )}
        </Box>

    <DownloadDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onDownloadPDF={handleDownloadPDF}
        onDownloadExcel={handleDownloadExcel}
      />
      </Box>
    </>
  );
};

export default StockSummaryPage;