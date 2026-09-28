"use client";

/**
 * physicalstockmodifcation/confirmDailog.tsx — delegates to shared StockChangesConfirmDialog
 * with primaryField="itemCode" (preserves this folder's original Item Code column).
 */

import React from "react";
import StockChangesConfirmDialog, { StockChange } from "@/components/Inventory/shared/StockChangesConfirmDialog";

interface Change {
  itemName: string;
  varianceName: string;
  locationId: string;
  newValue: number;
  itemCode: string;
}

interface ConfirmDialogProps {
  open: boolean;
  totalItems: number;
  changes: Change[];
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = (props) => (
  <StockChangesConfirmDialog {...props} changes={props.changes as StockChange[]} primaryField="itemCode" />
);

export default React.memo(ConfirmDialog);
