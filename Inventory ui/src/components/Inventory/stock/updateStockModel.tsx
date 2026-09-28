"use client";

/**
 * UpdatedStocksModal — rewritten with pure Tailwind CSS.
 * Replaces 605 lines of MUI Dialog + Table + Box + Typography + Chip.
 * Props interface is identical — 100% drop-in replacement.
 */

import React, { useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stock {
  itemName: string;
  varianceName?: string;
  locationId: string;
  newValue: number;
}

interface UpdatedStocksModalProps {
  open: boolean;
  updatedStocks: Stock[];
  onClose: () => void;
  onDownloadPDF: () => void;
  onDownloadExcel: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt    = (v: unknown) => (v === undefined || v === null || v === "" ? "-" : String(v));
const fmtNum = (v: unknown) => {
  const n = Number(v);

  if (!Number.isFinite(n)) return "-";

  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
};

// ─── Table Headers ────────────────────────────────────────────────────────────

const HEADERS = [
  { key: "itemName",    label: "Item Name", align: "left"  as const, w: "w-[35%]" },
  { key: "varianceName",label: "Variance",  align: "left"  as const, w: "w-[30%]" },
  { key: "locationId",  label: "Branch",    align: "left"  as const, w: "w-[20%]" },
  { key: "newValue",    label: "New Stock", align: "right" as const, w: "w-[15%]" },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

const PdfIcon     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const ExcelIcon   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>;
const BoxIcon     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>;

// ─── Component ────────────────────────────────────────────────────────────────

const UpdatedStocksModal: React.FC<UpdatedStocksModalProps> = ({
  open,
  updatedStocks,
  onClose,
  onDownloadPDF,
  onDownloadExcel,
}) => {
  const totalStock = useMemo(
    () => updatedStocks.reduce((s, r) => { const n = Number(r.newValue); return s + (Number.isFinite(n) ? n : 0); }, 0),
    [updatedStocks]
  );
  const hasData = updatedStocks.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-success-50 text-success-600 border border-success-500/30 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </span>
          <span>Updated Stocks</span>
          <Badge variant="primary" size="sm" dot>
            {updatedStocks.length} updated
          </Badge>
        </span>
      }
      description="Review submitted stock updates and download the report."
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<PdfIcon />}
            disabled={!hasData}
            onClick={onDownloadPDF}
            className="text-danger-600 border-danger-200 hover:bg-danger-50"
          >
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ExcelIcon />}
            disabled={!hasData}
            onClick={onDownloadExcel}
            className="text-success-700 border-success-500/30 hover:bg-success-50"
          >
            Excel
          </Button>
          <div className="flex-1" />
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl border border-success-500/25 bg-success-50/70 p-3">
          <p className="text-[10px] font-extrabold tracking-wider uppercase text-text-muted">Updated Rows</p>
          <p className="mt-1 text-[18px] font-extrabold text-success-700 tabular-nums">{fmtNum(updatedStocks.length)}</p>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-[10px] font-extrabold tracking-wider uppercase text-text-muted">Total New Stock</p>
          <p className="mt-1 text-[18px] font-extrabold text-brand-700 tabular-nums">{fmtNum(totalStock)}</p>
        </div>
      </div>

      {/* Table */}
      {hasData ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-auto max-h-[360px]">
            <table className="w-full border-collapse text-[12px]" style={{ minWidth: 560 }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  {HEADERS.map((h) => (
                    <th key={h.key} className={`${h.w} bg-surface-muted px-3 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider text-text-muted border-b border-border text-${h.align}`}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {updatedStocks.map((s, i) => (
                  <tr key={`${s.itemName}-${s.varianceName}-${s.locationId}-${i}`} className="border-b border-surface-subtle last:border-0 hover:bg-brand-50/40 transition-colors">
                    <td className="px-3 py-2 font-bold text-text-primary truncate max-w-0 overflow-hidden">{fmt(s.itemName)}</td>
                    <td className="px-3 py-2 text-text-secondary truncate max-w-0 overflow-hidden">{fmt(s.varianceName)}</td>
                    <td className="px-3 py-2 text-text-secondary truncate max-w-0 overflow-hidden">{fmt(s.locationId)}</td>
                    <td className="px-3 py-2 text-right font-extrabold text-brand-700 tabular-nums">{fmtNum(s.newValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[160px] rounded-xl border border-border bg-surface-muted gap-2">
          <BoxIcon />
          <p className="text-[14px] font-bold text-text-primary">No updated stocks</p>
          <p className="text-[12px] text-text-muted">Updated stock rows will appear here after submission.</p>
        </div>
      )}
    </Modal>
  );
};

export default React.memo(UpdatedStocksModal);