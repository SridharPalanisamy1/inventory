"use client";

/**
 * PaginationBar — Universal replacement for the 4 near-identical
 * paginationcontrol.tsx files across stock/, physicalstockmodifcation/,
 * physcialstockvarience/, and storestockvarience/.
 *
 * Zero MUI. Pure Tailwind CSS v4.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  totalPages: number;
  hasMoreData?: boolean;
  loading: boolean;
  startItem: number;
  endItem: number;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onSubmitClick: () => void;
  /** When true, Submit button is disabled */
  disabled?: boolean;
  /** Override the submit button label */
  submitLabel?: string;
  /** Hide submit button entirely (read-only screens) */
  hideSubmit?: boolean;
  className?: string;
  isFullScreen?: boolean;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const BoxIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

// ─── PaginationBar Component ──────────────────────────────────────────────────

const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalItems,
  totalPages,
  hasMoreData = false,
  loading,
  startItem,
  endItem,
  onSubmitClick,
  disabled = false,
  submitLabel = "Submit",
  hideSubmit = false,
  className,
}) => {
  const isInitialLoading = totalItems === 0 && loading;
  const isSubmitDisabled = disabled || loading;

  const safeStart  = totalItems > 0 ? startItem : 0;
  const safeEnd    = totalItems > 0 ? endItem   : 0;
  const safePages  = totalPages > 0 ? totalPages : 1;

  return (
    <div
      className={cn(
        "w-full flex items-center justify-between gap-2 flex-wrap",
        "px-3 py-2 min-h-[44px]",
        "bg-white/90 backdrop-blur-sm",
        "border-t border-border",
        "shadow-[0_-4px_12px_rgba(15,23,42,0.04)]",
        className
      )}
    >
      {/* ── Left: stats ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Icon badge */}
        <div className="h-[30px] w-[30px] rounded-[9px] bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center shrink-0">
          <BoxIcon />
        </div>

        {/* Counts */}
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-text-primary leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {isInitialLoading
              ? "Loading items…"
              : `Showing ${safeStart}–${safeEnd} of ${totalItems.toLocaleString()} items`}
          </p>
          <p className="text-[10.5px] font-semibold text-text-muted leading-tight mt-0.5">
            Page {currentPage} of {safePages}
            {hasMoreData && " · More records available"}
          </p>
        </div>
      </div>

      {/* ── Right: submit ───────────────────────────────────────────────────── */}
      {!hideSubmit && (
        <button
          onClick={onSubmitClick}
          disabled={isSubmitDisabled}
          className={cn(
            "inline-flex items-center justify-center gap-1.5",
            "h-[34px] min-w-[90px] px-3.5 rounded-[9px]",
            "text-[12px] font-extrabold text-white",
            "border border-transparent",
            "transition-all duration-150",
            isSubmitDisabled
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-[0_4px_12px_rgba(37,99,235,0.22)] hover:shadow-[0_6px_16px_rgba(37,99,235,0.26)] active:scale-[0.97]"
          )}
        >
          {loading
            ? <><Spinner size="xs" /> Please wait</>
            : <><CheckIcon /> {submitLabel}</>
          }
        </button>
      )}
    </div>
  );
};

export default React.memo(PaginationBar);
