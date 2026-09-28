import type { DebouncedFunc } from "lodash";
import type {
  SelectedItem,
  StockLedgerItem,
  StockLedgerResponse,
  StockLedgerTransaction,
} from "./ledgerrawSlice";
import { formatInventoryQty } from "@/components/Inventory/shared/numberFormat";
export interface WarehouseLedgerSummary {
  totalItems: number;
  totalOpening: number;
  totalMovement: number;
  totalClosing: number;
}

export interface WarehouseLedgerColor {
  main: string;
  light: string;
}

export interface DateSelectionRange {
  startDate: Date;
  endDate: Date;
  key: string;
}

export type SearchItemsDebounce = DebouncedFunc<(term: string) => void>;

const ITEM_COLORS: WarehouseLedgerColor[] = [
  { main: "#6366f1", light: "#e0e7ff" },
  { main: "#8b5cf6", light: "#ede9fe" },
  { main: "#ec4899", light: "#fce7f3" },
  { main: "#14b8a6", light: "#ccfbf1" },
  { main: "#f97316", light: "#ffedd5" },
];

export const formatLedgerValue = (value?: number | string | null) => {
  if (value === undefined || value === null || value === "") return "-";

  const numberValue = Number(value);
return Number.isFinite(numberValue)
  ? numberValue.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    })
  : "-";};

export const getWarehouseLedgerColor = (index: number) =>
  ITEM_COLORS[index % ITEM_COLORS.length];

export const getWarehouseLedgerSummary = (
  stockLedger: StockLedgerResponse | null,
  selectedItems: SelectedItem[]
): WarehouseLedgerSummary => {
  if (!stockLedger || selectedItems.length === 0) {
    return { totalItems: 0, totalOpening: 0, totalMovement: 0, totalClosing: 0 };
  }

  let totalOpening = 0;
  let totalClosing = 0;
  let totalMovement = 0;

  Object.values(stockLedger).forEach((ledger: StockLedgerItem) => {
    totalOpening += Number(ledger.openingReference?.closingStock) || 0;
    totalClosing += Number(ledger.closingSummary?.closingStock) || 0;

    ledger.transactions.forEach((transaction: StockLedgerTransaction) => {
      totalMovement +=
        Math.abs(Number(transaction.inStock) || 0) +
        Math.abs(Number(transaction.outStock) || 0) +
        Math.abs(Number(transaction.returnedStock) || 0) +
        Math.abs(Number(transaction.returnedToVendor) || 0);
    });
  });

  return {
    totalItems: selectedItems.length,
    totalOpening,
    totalMovement,
    totalClosing,
  };
};
