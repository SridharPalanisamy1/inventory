"use client";

/**
 * DownloadDialog — rewritten with pure Tailwind CSS.
 * Replaces 39-line MUI Dialog version.
 */

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface DownloadDialogProps {
  open: boolean;
  onClose: () => void;
  onDownloadPDF: () => void;
  onDownloadCSV: () => void;
}

const PdfIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const CsvIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>;

const DownloadDialog: React.FC<DownloadDialogProps> = ({
  open,
  onClose,
  onDownloadPDF,
  onDownloadCSV,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    size="xs"
    title="Download Options"
    description="Choose a format to download the report."
    footer={
      <>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="outline" size="sm" leftIcon={<PdfIcon />} onClick={onDownloadPDF}
          className="text-danger-600 border-danger-200 hover:bg-danger-50">PDF</Button>
        <Button variant="outline" size="sm" leftIcon={<CsvIcon />} onClick={onDownloadCSV}
          className="text-success-700 border-success-500/30 hover:bg-success-50">Excel / CSV</Button>
      </>
    }
  />
);

export default DownloadDialog;