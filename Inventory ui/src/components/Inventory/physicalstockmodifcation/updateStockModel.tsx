"use client";

/**
 * physicalstockmodifcation/updateStockModel.tsx — rewritten with pure Tailwind.
 * Replaces 96-line MUI Dialog version.
 */

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface Stock {
  itemName: string;
  varianceName: string;
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

const PdfIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>;
const ExcelIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;

const UpdatedStocksModal: React.FC<UpdatedStocksModalProps> = ({
  open,
  updatedStocks,
  onClose,
  onDownloadPDF,
  onDownloadExcel,
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Updated Stocks"
      footer={
        <div className="flex gap-2 w-full justify-end">
          <Button variant="outline" leftIcon={<PdfIcon />} onClick={onDownloadPDF}>
            Download PDF
          </Button>
          <Button variant="outline" leftIcon={<ExcelIcon />} onClick={onDownloadExcel} className="bg-success-50 text-success-700 border-success-200 hover:bg-success-100 hover:border-success-300">
            Download Excel
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="max-h-[400px] overflow-auto border border-border rounded-xl bg-white" style={{ scrollbarWidth: "thin" }}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-surface-muted shadow-sm z-10">
            <tr>
              <th className="px-3 py-2 text-[11px] font-extrabold uppercase text-text-muted border-b border-border">Item Name</th>
              <th className="px-3 py-2 text-[11px] font-extrabold uppercase text-text-muted border-b border-border">Variance</th>
              <th className="px-3 py-2 text-[11px] font-extrabold uppercase text-text-muted border-b border-border">Branch Name</th>
              <th className="px-3 py-2 text-[11px] font-extrabold uppercase text-text-muted border-b border-border text-right">New Stock Value</th>
            </tr>
          </thead>
          <tbody>
            {updatedStocks.map((stock) => (
              <tr
                key={`${stock.itemName}-${stock.varianceName}-${stock.locationId}`}
                className="border-b border-surface-subtle hover:bg-brand-50/50 last:border-0"
              >
                <td className="px-3 py-2 text-[12px] font-semibold text-text-primary">{stock.itemName}</td>
                <td className="px-3 py-2 text-[12px] font-semibold text-text-secondary">{stock.varianceName}</td>
                <td className="px-3 py-2 text-[12px] font-semibold text-text-secondary">{stock.locationId}</td>
                <td className="px-3 py-2 text-[12px] font-extrabold text-brand-700 text-right tabular-nums">{stock.newValue}</td>
              </tr>
            ))}
            {updatedStocks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[12px] font-semibold text-text-muted">
                  No updated stocks.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

export default UpdatedStocksModal;