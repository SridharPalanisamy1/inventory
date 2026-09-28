import React from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  color?: string;
}

// ─── Size Map ─────────────────────────────────────────────────────────────────

const sizeMap: Record<SpinnerSize, number> = {
  xs: 12,
  sm: 16,
  md: 22,
  lg: 32,
  xl: 48,
};

// ─── Ring Spinner (replaces MUI CircularProgress) ────────────────────────────

export const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  className,
  color = "currentColor",
}) => {
  const px = sizeMap[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin-slow shrink-0", className)}
      aria-hidden="true"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        fill={color}
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
};

// ─── Dot Loader (3 bouncing dots) ─────────────────────────────────────────────

export const DotLoader: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("flex items-center justify-center gap-1.5 py-6", className)}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="h-2 w-2 rounded-full bg-brand-400"
        style={{
          animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }}
      />
    ))}
  </div>
);

// ─── Page-level loading overlay ───────────────────────────────────────────────

export const PageLoader: React.FC<{ message?: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
    <Spinner size="lg" className="text-brand-500" />
    {message && <p className="text-[13px] text-text-muted">{message}</p>}
  </div>
);

export default Spinner;
