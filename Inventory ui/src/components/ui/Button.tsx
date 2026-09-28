"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "warning"
  | "success"
  | "outline";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

// ─── Variant & Size Maps ──────────────────────────────────────────────────────

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white border-transparent " +
    "hover:bg-brand-700 active:bg-brand-800 " +
    "shadow-sm hover:shadow-md",
  secondary:
    "bg-brand-50 text-brand-700 border-brand-200 " +
    "hover:bg-brand-100 active:bg-brand-200",
  ghost:
    "bg-transparent text-text-secondary border-transparent " +
    "hover:bg-surface-subtle hover:text-text-primary",
  outline:
    "bg-white text-text-secondary border-border " +
    "hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50",
  danger:
    "bg-danger-600 text-white border-transparent " +
    "hover:bg-danger-700 active:bg-danger-700 " +
    "shadow-sm hover:shadow-md",
  warning:
    "bg-warning-500 text-white border-transparent " +
    "hover:bg-warning-600 active:bg-warning-700",
  success:
    "bg-success-600 text-white border-transparent " +
    "hover:bg-success-700 active:bg-success-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-[11px] gap-1 rounded-md",
  sm: "h-8 px-3 text-[12px] gap-1.5 rounded-[8px]",
  md: "h-9 px-4 text-[13px] gap-2 rounded-[10px]",
  lg: "h-11 px-6 text-[14px] gap-2 rounded-[12px]",
};

// ─── Spinner ─────────────────────────────────────────────────────────────────

const ButtonSpinner: React.FC<{ size: ButtonSize }> = ({ size }) => {
  const s = size === "xs" ? 12 : size === "sm" ? 14 : size === "lg" ? 18 : 15;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin-slow shrink-0"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
};

// ─── Button Component ─────────────────────────────────────────────────────────

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          // Base
          "inline-flex items-center justify-center font-semibold border",
          "transition-all duration-150 cursor-pointer select-none",
          "focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
          "active:scale-[0.98]",
          // Variant
          variantClasses[variant],
          // Size
          sizeClasses[size],
          // States
          isDisabled && "opacity-50 cursor-not-allowed pointer-events-none",
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {loading ? (
          <ButtonSpinner size={size} />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        {children && <span>{children}</span>}
        {!loading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";

// ─── Icon Button ──────────────────────────────────────────────────────────────

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  tooltip?: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", size = "sm", loading, tooltip, children, className, disabled, ...props }, ref) => {
    const sizeMap: Record<ButtonSize, string> = {
      xs: "h-6 w-6 rounded-md",
      sm: "h-8 w-8 rounded-[8px]",
      md: "h-9 w-9 rounded-[10px]",
      lg: "h-11 w-11 rounded-[12px]",
    };

    const button = (
      <button
        ref={ref}
        disabled={disabled || loading}
        title={tooltip}
        className={cn(
          "inline-flex items-center justify-center border",
          "transition-all duration-150 cursor-pointer",
          "focus-visible:ring-2 focus-visible:ring-brand-500",
          "active:scale-[0.95]",
          variantClasses[variant],
          sizeMap[size],
          (disabled || loading) && "opacity-50 cursor-not-allowed pointer-events-none",
          className
        )}
        {...props}
      >
        {loading ? <ButtonSpinner size={size} /> : children}
      </button>
    );

    return button;
  }
);

IconButton.displayName = "IconButton";

export default Button;
