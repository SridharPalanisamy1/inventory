"use client";

/**
 * ledger/ConfirmDialog.tsx — rewritten with pure Tailwind.
 * Replaces MUI Dialog version.
 */

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface DownloadDialogProps {
  open: boolean;
  onClose: () => void;
  onDownloadPDF: () => Promise<void> | void;
  onDownloadExcel: () => Promise<void> | void;
}

const PdfIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>;
const ExcelIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;

const DownloadDialog: React.FC<DownloadDialogProps> = ({
  open,
  onClose,
  onDownloadPDF,
  onDownloadExcel,
}) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (type: "pdf" | "excel") => {
    setDownloading(true);
    try {
      if (type === "pdf") await onDownloadPDF();
      else await onDownloadExcel();
    } finally {
      setDownloading(false);
      onClose(); // Automatically close after download triggers
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Download Stock Ledger"
      description="Choose a format to download the stock ledger data."
      footer={
        <div className="w-full flex justify-center">
          <Button variant="outline" onClick={onClose} disabled={downloading}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex justify-center gap-4 py-4">
        <Button
          variant="primary"
          leftIcon={<PdfIcon />}
          onClick={() => handleDownload("pdf")}
          disabled={downloading}
          className="px-6 h-12 text-[14px]"
        >
          {downloading ? "Downloading..." : "PDF"}
        </Button>
        <Button
          variant="primary"
          leftIcon={<ExcelIcon />}
          onClick={() => handleDownload("excel")}
          disabled={downloading}
          className="px-6 h-12 text-[14px] bg-success-600 hover:bg-success-700 border-success-700 focus:ring-success-500"
        >
          {downloading ? "Downloading..." : "Excel"}
        </Button>
      </div>
    </Modal>
  );
};

export default React.memo(DownloadDialog);
