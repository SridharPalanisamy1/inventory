"use client";

/**
 * VarianceConfirmDialog — shared replacement for the two identical
 * confirmDailog.tsx files in physcialstockvarience/ and storestockvarience/.
 * Props: { open, totalItems, changesLength, onClose(confirm), fullScreen }.
 */

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export interface VarianceConfirmDialogProps {
  open: boolean;
  totalItems: number;
  changesLength: number;
  onClose: (confirm: boolean) => void;
  fullScreen: boolean;
}

const SaveIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;

const VarianceConfirmDialog: React.FC<VarianceConfirmDialogProps> = ({
  open,
  totalItems,
  changesLength,
  onClose,
}) => (
  <Modal
    open={open}
    onClose={() => onClose(false)}
    size="sm"
    title={
      <span className="flex items-center gap-2">
        <span className="h-8 w-8 rounded-xl bg-warning-50 text-warning-600 border border-warning-500/30 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </span>
        Confirm Save
        <Badge variant="warning" size="sm">{changesLength} changes</Badge>
      </span>
    }
    description="Please review before saving."
    footer={
      <>
        <Button variant="ghost" size="sm" onClick={() => onClose(false)}>Cancel</Button>
        <Button variant="warning" size="sm" leftIcon={<SaveIcon />} onClick={() => onClose(true)}>
          Save Changes
        </Button>
      </>
    }
  >
    {/* Stats */}
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-border bg-surface-muted p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Total Items</p>
        <p className="mt-1 text-[20px] font-extrabold text-text-primary tabular-nums">{totalItems.toLocaleString()}</p>
      </div>
      <div className="rounded-xl border border-warning-500/25 bg-warning-50 p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Edited Items</p>
        <p className="mt-1 text-[20px] font-extrabold text-warning-700 tabular-nums">{changesLength.toLocaleString()}</p>
      </div>
    </div>
    {changesLength > 0 && (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning-500/25 bg-warning-50 px-3 py-2.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warning-600 mt-0.5 shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <p className="text-[12px] font-semibold text-warning-700">
          You are about to update {changesLength} of {totalItems} items. This action cannot be undone.
        </p>
      </div>
    )}
  </Modal>
);

export default React.memo(VarianceConfirmDialog);
