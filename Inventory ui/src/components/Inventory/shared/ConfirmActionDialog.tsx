"use client";

/**
 * ConfirmActionDialog — rewritten with pure Tailwind CSS.
 * Replaces all 384 lines of MUI Dialog / Box / Button / Alert / Chip / Typography.
 * Prop interface is identical — 100% drop-in replacement.
 */

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

// ─── Types (unchanged from original) ─────────────────────────────────────────

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  message: string;
  warning?: string;
  confirmText: string;
  cancelText?: string;
  loading?: boolean;
  severity?: "default" | "warning" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── Severity Config ──────────────────────────────────────────────────────────

const cfg = {
  default: {
    iconBg:     "bg-brand-50 text-brand-600",
    badgeVar:   "primary" as const,
    chipLabel:  "Confirmation",
    btnVar:     "primary" as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  warning: {
    iconBg:     "bg-warning-50 text-warning-600",
    badgeVar:   "warning" as const,
    chipLabel:  "Review required",
    btnVar:     "warning" as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  danger: {
    iconBg:     "bg-danger-50 text-danger-600",
    badgeVar:   "danger" as const,
    chipLabel:  "Danger action",
    btnVar:     "danger" as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
};

const warningBgMap = {
  default: "bg-brand-50 border-brand-200 text-brand-800",
  warning: "bg-warning-50 border-warning-500/30 text-warning-800",
  danger:  "bg-danger-50 border-danger-500/30 text-danger-800",
};

// ─── Component ────────────────────────────────────────────────────────────────

const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
  open,
  title,
  message,
  warning,
  confirmText,
  cancelText = "Cancel",
  loading = false,
  severity = "default",
  onConfirm,
  onCancel,
}) => {
  const c = cfg[severity];

  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      disableClose={loading}
      size="sm"
      showCloseButton={false}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            leftIcon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            }
          >
            {cancelText}
          </Button>
          <Button
            variant={c.btnVar}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            leftIcon={
              loading
                ? <Spinner size="xs" />
                : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                )
            }
          >
            {loading ? `${confirmText}…` : confirmText}
          </Button>
        </>
      }
    >
      {/* Icon + Title + Badge */}
      <div className="flex items-start gap-3">
        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", c.iconBg)}>
          {c.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-extrabold text-text-primary leading-snug">{title}</p>
            <Badge variant={c.badgeVar} size="sm">{c.chipLabel}</Badge>
          </div>
          <p className="mt-0.5 text-[11px] font-semibold text-text-muted">
            Please confirm before continuing.
          </p>
        </div>
      </div>

      {/* Message box */}
      <div className="mt-3 rounded-xl border border-border bg-white/80 px-3.5 py-3">
        <p className="text-[13px] font-semibold text-text-secondary leading-relaxed">
          {message}
        </p>
      </div>

      {/* Warning banner */}
      {warning && (
        <div className={cn(
          "mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5",
          warningBgMap[severity]
        )}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[12px] font-bold leading-relaxed">{warning}</p>
        </div>
      )}
    </Modal>
  );
};

export default React.memo(ConfirmActionDialog);