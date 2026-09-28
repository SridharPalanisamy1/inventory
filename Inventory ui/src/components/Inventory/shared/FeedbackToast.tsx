"use client";

/**
 * FeedbackToast — Universal replacement for the 4 near-identical
 * feedbackSnakbar.tsx files across stock/, physicalstockmodifcation/,
 * physcialstockvarience/, and storestockvarience/.
 *
 * Zero MUI (no Snackbar, no Alert, no @mui/icons-material).
 * Uses the Toast UI primitive + portal rendering.
 */

import React from "react";
import { Toast } from "@/components/ui/Toast";
import type { ToastSeverity } from "@/components/ui/Toast";

// ─── Props — intentionally match old FeedbackSnackbarProps ───────────────────

export interface FeedbackToastProps {
  open: boolean;
  message: string;
  /** MUI AlertColor alias — maps directly to ToastSeverity */
  severity?: ToastSeverity;
  autoHideDuration?: number;
  onClose: (event?: React.SyntheticEvent | Event, reason?: string) => void;
  /** MUI SnackbarOrigin alias — maps to Toast anchor props */
  anchorOrigin?: {
    vertical:   "top" | "bottom";
    horizontal: "left" | "center" | "right";
  };
  fullScreen?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const FeedbackToast: React.FC<FeedbackToastProps> = ({
  open,
  message,
  severity = "info",
  autoHideDuration = 3500,
  onClose,
  anchorOrigin = { vertical: "top", horizontal: "right" },
}) => (
  <Toast
    open={open}
    message={message}
    severity={severity}
    autoHideDuration={autoHideDuration}
    onClose={() => onClose(undefined, "timeout")}
    anchorY={anchorOrigin.vertical}
    anchorX={anchorOrigin.horizontal}
  />
);

export default React.memo(FeedbackToast);
