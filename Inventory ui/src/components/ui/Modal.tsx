"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  /** Prevent closing by clicking backdrop or pressing Escape */
  disableClose?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "full";
  title?: React.ReactNode;
  /** Subtitle / description line below the title */
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Extra className for the dialog panel */
  className?: string;
  /** Show a close × button in the corner */
  showCloseButton?: boolean;
}

// ─── Size Map ────────────────────────────────────────────────────────────────

const sizeMap = {
  xs:   "max-w-xs w-full",
  sm:   "max-w-sm  w-full",
  md:   "max-w-md  w-full",
  lg:   "max-w-lg  w-full",
  xl:   "max-w-2xl w-full",
  full: "max-w-[calc(100vw-32px)] w-full",
};

// ─── Close Icon ───────────────────────────────────────────────────────────────

const XIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// ─── Modal Component ──────────────────────────────────────────────────────────

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  disableClose = false,
  size = "md",
  title,
  description,
  children,
  footer,
  className,
  showCloseButton = true,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Trap Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disableClose) {
        onClose?.();
      }
    },
    [disableClose, onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    // Lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, handleKeyDown]);

  // Focus trap — focus panel on open
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      className="fixed inset-0 z-[1300] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in"
        onClick={!disableClose ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 bg-white rounded-2xl shadow-xl outline-none",
          "animate-scale-in",
          "max-h-[90dvh] flex flex-col",
          sizeMap[size],
          className
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-0">
            <div className="flex-1 min-w-0">
              {title && (
                <h2
                  id="modal-title"
                  className="text-[15px] font-bold text-text-primary leading-snug"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-0.5 text-[13px] text-text-muted leading-relaxed">
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && !disableClose && (
              <button
                onClick={onClose}
                className="shrink-0 mt-0.5 p-1.5 rounded-lg text-text-muted
                           hover:text-text-primary hover:bg-surface-subtle
                           transition-colors duration-150"
                aria-label="Close dialog"
              >
                <XIcon />
              </button>
            )}
          </div>
        )}

        {/* Divider under header */}
        {title && <div className="mx-5 mt-4 h-px bg-border" />}

        {/* Body */}
        {children && (
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {children}
          </div>
        )}

        {/* Footer */}
        {footer && (
          <>
            <div className="mx-5 h-px bg-border" />
            <div className="px-5 py-4 flex items-center justify-end gap-2">
              {footer}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // Render into portal
  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
};

// ─── Sub-components for composition pattern ───────────────────────────────────

export const ModalTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <h2 className={cn("text-[15px] font-bold text-text-primary leading-snug", className)}>
    {children}
  </h2>
);

export const ModalDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <p className={cn("text-[13px] text-text-muted leading-relaxed", className)}>
    {children}
  </p>
);

export default Modal;
