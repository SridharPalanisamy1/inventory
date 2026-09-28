"use client";

/**
 * InventoryActionSnackbar — rewritten with pure Tailwind, zero MUI.
 * Drop-in replacement for the original MUI Snackbar + Alert version.
 */

import React from "react";
import { Toast } from "@/components/ui/Toast";
import type { InventoryActionSnackbarState } from "./useInventoryAsyncAction";

// ─── Props ────────────────────────────────────────────────────────────────────

interface InventoryActionSnackbarProps extends InventoryActionSnackbarState {
  onClose: (event?: React.SyntheticEvent | Event, reason?: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const InventoryActionSnackbar: React.FC<InventoryActionSnackbarProps> = ({
  open,
  message,
  severity,
  persist,
  onClose,
}) => (
  <Toast
    open={open}
    message={message}
    severity={severity}
    autoHideDuration={persist ? 0 : 4500}
    onClose={() => onClose(undefined, "timeout")}
    anchorY="bottom"
    anchorX="left"
  />
);

export default React.memo(InventoryActionSnackbar);
