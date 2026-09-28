"use client";

/**
 * StockChangesConfirmDialog — shared replacement for the near-identical
 * confirmDailog.tsx in physicalstockmodifcation/ (keys by itemCode) and
 * stock/ (keys by randomId, displays itemName). `primaryField` preserves
 * each caller's exact original column/label — no visual change for either.
 */

import React, { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StockChange {
  itemName?: string;
  varianceName: string;
  locationId?: string;
  newValue: number;
  itemCode?: string;
  randomId?: string;
}

export interface StockChangesConfirmDialogProps {
  open: boolean;
  totalItems: number;
  changes: StockChange[];
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  /** Which field identifies a row in the primary column — "itemCode" (Item Code) or "itemName" (Item Name). */
  primaryField: "itemCode" | "itemName";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (v: unknown) => {
  const n = Number(v);

  if (!Number.isFinite(n)) return "-";

  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
};
const txt = (v: unknown) => (v === undefined || v === null || v === "" ? "-" : String(v));

// ─── Component ────────────────────────────────────────────────────────────────

const StockChangesConfirmDialog: React.FC<StockChangesConfirmDialogProps> = ({
  open,
  totalItems,
  changes,
  onClose,
  onConfirm,
  primaryField,
}) => {
  const [loading, setLoading] = useState(false);

  const totalNewStock = useMemo(
    () => changes.reduce((s, c) => { const n = Number(c.newValue); return s + (Number.isFinite(n) ? n : 0); }, 0),
    [changes]
  );

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };

  const primaryLabel = primaryField === "itemCode" ? "Item Code" : "Item Name";
  const minWidth = primaryField === "itemCode" ? 560 : 500;
  const maxTableHeight = primaryField === "itemCode" ? 320 : 300;

  return (
    <Modal
      open={open}
      onClose={!loading ? onClose : undefined}
      disableClose={loading}
      size="xl"
      showCloseButton={!loading}
      title={
        <span className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-warning-50 text-warning-600 border border-warning-500/30 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
          </span>
          Confirm Save
          <Badge variant="warning" size="sm">{changes.length} changes</Badge>
        </span>
      }
      description={primaryField === "itemCode" ? "Review the pending changes before saving." : "Review the pending stock changes before saving."}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={loading ? <Spinner size="xs" /> : undefined}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Saving…" : "Save Changes"}
          </Button>
        </>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-border bg-surface-muted p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Total Items</p>
          <p className="mt-1 text-[18px] font-extrabold text-text-primary tabular-nums">{totalItems.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-warning-500/25 bg-warning-50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Changed</p>
          <p className="mt-1 text-[18px] font-extrabold text-warning-700 tabular-nums">{changes.length.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Total New Stock</p>
          <p className="mt-1 text-[18px] font-extrabold text-brand-700 tabular-nums">{fmtNum(totalNewStock)}</p>
        </div>
      </div>

      {primaryField === "itemCode" && changes.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning-500/25 bg-warning-50 px-3 py-2.5 mb-4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warning-600 mt-0.5 shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-[12px] font-semibold text-warning-700">
            You are about to update {changes.length} of {totalItems} items. This action cannot be undone.
          </p>
        </div>
      )}

      {/* Changes table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: maxTableHeight }}>
          <table className="w-full border-collapse text-[12px]" style={{ minWidth }}>
            <thead className="sticky top-0 z-10">
              <tr>
                {[primaryLabel, "Variance", "Location", "New Stock"].map((h, hi) => (
                  <th key={hi} className={`px-3 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b border-border ${hi === 3 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[13px] text-text-muted">
                    No changes to display.
                  </td>
                </tr>
              ) : (
                changes.map((c, i) => (
                  <tr key={primaryField === "itemCode" ? `${c.itemCode}-${c.varianceName}-${c.locationId}-${i}` : `${c.randomId}-${i}`}
                    className="border-b border-surface-subtle last:border-0 hover:bg-brand-50/40 transition-colors">
                    <td className="px-3 py-2 font-semibold text-text-primary truncate" title={txt(primaryField === "itemCode" ? c.itemCode : c.itemName)}>
                      {txt(primaryField === "itemCode" ? c.itemCode : c.itemName)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary truncate" title={txt(c.varianceName)}>{txt(c.varianceName)}</td>
                    <td className="px-3 py-2 text-text-secondary truncate" title={txt(c.locationId)}>{txt(c.locationId)}</td>
                    <td className="px-3 py-2 text-right font-extrabold text-brand-700 tabular-nums">{fmtNum(c.newValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

export default React.memo(StockChangesConfirmDialog);
