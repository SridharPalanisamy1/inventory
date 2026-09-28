"use client";

/**
 * stock/confirmDailog.tsx — delegates to shared StockChangesConfirmDialog
 * with primaryField="itemName" (preserves this folder's original Item Name column).
 */

import React from "react";
import StockChangesConfirmDialog, { StockChange } from "@/components/Inventory/shared/StockChangesConfirmDialog";

interface Change {
  itemName: string;
  varianceName: string;
  randomId: string;
  locationId?: string;
  newValue: number;
}

interface ConfirmDialogProps {
  open: boolean;
  totalItems: number;
  changes: Change[];
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = (props) => (
  <StockChangesConfirmDialog {...props} changes={props.changes as StockChange[]} primaryField="itemName" />
);

export default React.memo(ConfirmDialog);
