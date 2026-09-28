"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastSeverity = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  message: string;
  severity: ToastSeverity;
  autoHideDuration?: number;
}

export interface ToastProps {
  open: boolean;
  message: string;
  severity?: ToastSeverity;
  autoHideDuration?: number;
  onClose: () => void;
  anchorY?: "top" | "bottom";
  anchorX?: "left" | "center" | "right";
}

// ─── Severity Config ──────────────────────────────────────────────────────────

const severityConfig = {
  success: {
    bg:      "bg-success-50 border-success-500/30",
    text:    "text-success-700",
    icon:    (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    bar:     "bg-success-500",
  },
  error: {
    bg:      "bg-danger-50 border-danger-500/30",
    text:    "text-danger-700",
    icon:    (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    bar:     "bg-danger-500",
  },
  warning: {
    bg:      "bg-warning-50 border-warning-500/30",
    text:    "text-warning-700",
    icon:    (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    bar:     "bg-warning-500",
  },
  info: {
    bg:      "bg-brand-50 border-brand-300/40",
    text:    "text-brand-700",
    icon:    (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="8" strokeWidth="3" strokeLinecap="round" />
        <line x1="12" y1="12" x2="12" y2="16" />
      </svg>
    ),
    bar:     "bg-brand-500",
  },
};

// ─── Anchor Position ──────────────────────────────────────────────────────────

const anchorClass = (y: "top" | "bottom", x: "left" | "center" | "right") => {
  const yClass = y === "top" ? "top-4" : "bottom-4";
  const xClass =
    x === "left"   ? "left-4" :
    x === "right"  ? "right-4" :
    "left-1/2 -translate-x-1/2";
  return `${yClass} ${xClass}`;
};

// ─── Single Toast ─────────────────────────────────────────────────────────────

export const Toast: React.FC<ToastProps> = ({
  open,
  message,
  severity = "info",
  autoHideDuration = 3500,
  onClose,
  anchorY = "top",
  anchorX = "right",
}) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cfg = severityConfig[severity];

  const close = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setExiting(false);
      setVisible(false);
      onClose();
    }, 250);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setExiting(false);
      if (autoHideDuration > 0) {
        timerRef.current = setTimeout(close, autoHideDuration);
      }
    } else {
      close();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoHideDuration]);

  if (!visible) return null;

  const toast = (
    <div
      className={cn(
        "fixed z-[1500] pointer-events-auto",
        anchorClass(anchorY, anchorX)
      )}
    >
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
          "min-w-[280px] max-w-[420px] overflow-hidden",
          cfg.bg,
          exiting ? "animate-toast-out" : "animate-toast-in"
        )}
      >
        {/* Icon */}
        <span className={cn("mt-0.5 shrink-0", cfg.text)}>{cfg.icon}</span>

        {/* Message */}
        <p className={cn("flex-1 text-[13px] font-medium leading-relaxed", cfg.text)}>
          {message}
        </p>

        {/* Close */}
        <button
          onClick={close}
          className={cn(
            "shrink-0 mt-0.5 p-0.5 rounded-md opacity-60 hover:opacity-100 transition-opacity",
            cfg.text
          )}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Progress bar */}
        {autoHideDuration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-xl">
            <div
              className={cn("h-full", cfg.bar)}
              style={{ animation: `progressBar ${autoHideDuration}ms linear forwards` }}
            />
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(toast, document.body);
};

export default Toast;
