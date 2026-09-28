// export interface TableRow {
//   id: string;
//   index: number;
//   itemName: string;
//   varianceName: string;
//   category: string;
//   subcategory: string;
//   systemStock: number;
//   physicalStock: number;
// }

// export interface FilterBarProps {
//   searchParams: RawMaterialSearchParams;
//   onSearchChange: (field: keyof RawMaterialSearchParams, value: string[] | string) => void;
//   setOpenDownloadDialog: (open: boolean) => void;
//   filterOptions: {
//     itemNames: string[];
//     varianceNames: string[];
//     categories: string[];
//     subcategories: string[];
//   };
//   loading?: boolean;
//   onFilterScrollBottom: (field: keyof RawMaterialSearchParams) => void;
//   onFilterSearch: (field: keyof RawMaterialSearchParams, searchTerm: string) => void;
// }

// export interface DataTableProps {
//   inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
//   tableContainerRef: React.RefObject<HTMLDivElement>;
//   rows: TableRow[];
//   onPhysicalStockChange: (
//     event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
//     itemName: string,
//     varianceName: string,
//     itemId: string,
//     currentSystemStock: number
//   ) => void;
//   loading: boolean;
//   hasMore: boolean;
//   onScrollBottom: () => void;
//   changedRows: Record<string, boolean>;
// }

// export interface PaginationControlsProps {
//   currentPage: number;
//   totalItems: number;
//   totalPages: number;
//   hasMoreData: boolean;
//   loading: boolean;
//   startItem: number;
//   endItem: number;
//   onPreviousPage: () => void;
//   onNextPage: () => void;
//   onSubmitClick: () => void;
// }

// export interface ConfirmDialogProps {
//   open: boolean;
//   totalItems: number;
//   changes: { itemName: string; newValue: number; varianceName: string; itemId: string; systemStock: number }[];
//   onClose: () => void;
//   onConfirm: () => void;
// }

// export interface FeedbackSnackbarProps {
//   open: boolean;
//   message: string;
//   onClose: (event?: React.SyntheticEvent | Event, reason?: string) => void;
// }

// export interface UpdatedStocksModalProps {
//   open: boolean;
//   updatedStocks: { itemName: string; newValue: number; varianceName: string; itemId: string; systemStock: number }[];
//   onClose: () => void;
//   onDownloadPDF: () => void;
//   onDownloadExcel: () => void;
// }

// export interface DownloadDialogProps {
//   open: boolean;
//   onClose: () => void;
//   onDownloadPDF: () => void;
//   onDownloadCSV: () => void;
// }