import React from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "muted";

export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

// ─── Variant Map ──────────────────────────────────────────────────────────────

const variantMap: Record<BadgeVariant, string> = {
  default:  "bg-slate-100 text-slate-600 border-slate-200",
  primary:  "bg-brand-50 text-brand-700 border-brand-200",
  success:  "bg-success-50 text-success-700 border-success-500/30",
  warning:  "bg-warning-50 text-warning-700 border-warning-500/30",
  danger:   "bg-danger-50 text-danger-700 border-danger-500/30",
  muted:    "bg-surface-subtle text-text-muted border-border",
};

const dotMap: Record<BadgeVariant, string> = {
  default:  "bg-slate-400",
  primary:  "bg-brand-500",
  success:  "bg-success-500",
  warning:  "bg-warning-500",
  danger:   "bg-danger-500",
  muted:    "bg-text-disabled",
};

const sizeMap: Record<BadgeSize, string> = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-[11px] px-2 py-0.5 gap-1.5",
};

// ─── Badge Component ──────────────────────────────────────────────────────────

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
  dot = false,
  className,
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border font-semibold leading-none",
      variantMap[variant],
      sizeMap[size],
      className
    )}
  >
    {dot && (
      <span
        className={cn(
          "inline-block rounded-full shrink-0",
          size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
          dotMap[variant]
        )}
      />
    )}
    {children}
  </span>
);

export default Badge;
