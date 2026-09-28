"use client";

/**
 * ConfirmDialog — Universal replacement for the 4 near-identical
 * confirmDailog.tsx files across feature folders.
 *
 * Zero MUI. Uses the Modal + Button + Spinner primitives.
 */

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConfirmDialogSeverity = "default" | "warning" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Optional yellow warning sub-text below the main message */
  warning?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  severity?: ConfirmDialogSeverity;
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── Severity config ──────────────────────────────────────────────────────────

const severityCfg = {
  default: {
    iconBg:   "bg-brand-50 text-brand-600",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    btnVariant: "primary" as const,
  },
  warning: {
    iconBg:   "bg-warning-50 text-warning-600",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    btnVariant: "warning" as const,
  },
  danger: {
    iconBg:   "bg-danger-50 text-danger-600",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    btnVariant: "danger" as const,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  warning,
  confirmText = "Confirm",
  cancelText  = "Cancel",
  loading     = false,
  severity    = "default",
  onConfirm,
  onCancel,
}) => {
  const cfg = severityCfg[severity];

  return (
    <Modal
      open={open}
      onClose={!loading ? onCancel : undefined}
      disableClose={loading}
      size="sm"
      showCloseButton={!loading}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={cfg.btnVariant}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            leftIcon={loading ? <Spinner size="xs" /> : undefined}
          >
            {loading ? "Please wait…" : confirmText}
          </Button>
        </>
      }
    >
      {/* Icon + title */}
      <div className="flex items-start gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", cfg.iconBg)}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-text-primary leading-snug">{title}</p>
          <p className="mt-1 text-[13px] text-text-muted leading-relaxed">{message}</p>
        </div>
      </div>

      {/* Warning banner */}
      {warning && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-warning-50 border border-warning-500/25 px-3 py-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warning-600 shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[12px] font-semibold text-warning-700 leading-relaxed">{warning}</p>
        </div>
      )}
    </Modal>
  );
};

export default React.memo(ConfirmDialog);
