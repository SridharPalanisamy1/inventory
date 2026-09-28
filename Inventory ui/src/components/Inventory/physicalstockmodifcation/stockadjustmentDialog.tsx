"use client";

/**
 * physicalstockmodifcation/stockadjustmentDialog.tsx — rewritten with pure Tailwind CSS.
 * Replaces 552-line MUI version. Props interface 100% identical.
 */

import React from "react";
import { Branchitem } from "@/features/yen_inventory/OutletPhysicalVarianceSlice";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

// ─── Types (unchanged) ────────────────────────────────────────────────────────

interface StockAdjustmentDialogProps {
  open: boolean;
  item: Branchitem | null;
  adjustedPhysicalStock: string;
  adjustmentReason: string;
  onConfirm?: () => void;
  onCancel: () => void;
  onChangePhysicalStock: (value: string) => void;
  onChangeReason: (value: string) => void;
  fullScreen: boolean;
}

// ─── Input Style ──────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[13px] font-semibold text-text-primary outline-none transition-all duration-150 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 hover:border-brand-300 disabled:bg-surface-subtle disabled:cursor-not-allowed";

// ─── Component ────────────────────────────────────────────────────────────────

const StockAdjustmentDialog: React.FC<StockAdjustmentDialogProps> = ({
  open,
  item,
  adjustedPhysicalStock,
  adjustmentReason,
  onConfirm,
  onCancel,
  onChangePhysicalStock,
  onChangeReason,
}) => {
  const currentQty   = item?.currentSystemQty ?? "";
  const physicalValue = Number(adjustedPhysicalStock);
  const systemValue   = Number(currentQty);

  const canApprove =
    Boolean(String(adjustedPhysicalStock).trim()) &&
    Boolean(adjustmentReason.trim());

  const variance =
    Number.isFinite(physicalValue) && Number.isFinite(systemValue)
      ? physicalValue - systemValue
      : 0;

  const varianceColor =
    !adjustedPhysicalStock || !Number.isFinite(variance)
      ? "text-text-muted"
      : variance < 0
      ? "text-danger-600"
      : "text-success-600";

  const handlePhysicalChange = (value: string) => {
    if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) {
      onChangePhysicalStock(value);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </span>
          Adjust Stock
          {item?.itemCode && <Badge variant="primary" size="sm">{item.itemCode}</Badge>}
        </span>
      }
      description={item?.itemName || "Selected item"}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canApprove}
            onClick={onConfirm}
            leftIcon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            }
          >
            Approve
          </Button>
        </>
      }
    >
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl border border-border bg-white p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Item</p>
          <p className="mt-1 text-[13px] font-bold text-text-primary truncate" title={item?.itemName || "-"}>
            {item?.itemName || "-"}
          </p>
        </div>
        <div className={cn(
          "rounded-xl border p-3",
          adjustedPhysicalStock
            ? "border-success-500/25 bg-success-50/70"
            : "border-warning-500/25 bg-warning-50/70"
        )}>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Variance Preview</p>
          <p className={cn("mt-1 text-[18px] font-extrabold tabular-nums", varianceColor)}>
            {adjustedPhysicalStock ? variance : "-"}
          </p>
        </div>
      </div>

      {/* Form fields */}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-bold text-text-muted mb-1.5 uppercase tracking-wider">
            Current System Quantity
          </label>
          <input
            type="text"
            value={currentQty}
            disabled
            readOnly
            className={cn(inputCls, "pl-8 relative")}
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-text-muted mb-1.5 uppercase tracking-wider">
            Physical Stock <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={adjustedPhysicalStock}
            onChange={(e) => handlePhysicalChange(e.target.value)}
            inputMode="decimal"
            maxLength={8}
            autoFocus
            placeholder="Enter physical count…"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-text-muted mb-1.5 uppercase tracking-wider">
            Reason for Adjustment <span className="text-danger-500">*</span>
          </label>
          <textarea
            value={adjustmentReason}
            onChange={(e) => onChangeReason(e.target.value)}
            placeholder="Enter the reason for this physical stock adjustment…"
            rows={4}
            className={cn(inputCls, "resize-none")}
          />
        </div>
      </div>

      {/* Readiness indicator */}
      <div className={cn(
        "mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5",
        canApprove
          ? "border-success-500/25 bg-success-50"
          : "border-warning-500/25 bg-warning-50"
      )}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={cn("mt-0.5 shrink-0", canApprove ? "text-success-600" : "text-warning-600")}>
          {canApprove
            ? <><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
            : <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
          }
        </svg>
        <div>
          <p className={cn("text-[12px] font-bold", canApprove ? "text-success-800" : "text-warning-800")}>
            {canApprove ? "Ready to approve this stock adjustment." : "Physical stock and reason are required."}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            Check system quantity, physical stock and reason before approving.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export { StockAdjustmentDialog };
export default React.memo(StockAdjustmentDialog);