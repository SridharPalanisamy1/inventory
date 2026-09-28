import React from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  /** Delay before showing tooltip (ms) */
  delay?: number;
  /**
   * Horizontal anchor of the popup, used only for side="top" | "bottom".
   * Defaults to "center" — every existing caller that doesn't pass this
   * prop keeps the exact same behavior as before this change.
   *
   * Pass "left" / "right" when the trigger box is stretched wider than its
   * visible content (e.g. a table cell using `w-full truncate` for
   * ellipsis clipping) so the popup lines up with where the text is
   * actually rendered, instead of the center of the stretched box.
   */
  align?: "left" | "center" | "right";
}

// ─── Position Maps ────────────────────────────────────────────────────────────

// side="left" | "right" — unaffected by `align`, same as before.
const sidePositionMap = {
  left:  "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full  top-1/2 -translate-y-1/2 ml-2",
};
const sideArrowMap = {
  left:  "left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-800",
  right: "right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-800",
};

// side="top" | "bottom", keyed by horizontal align.
// align="center" here is byte-identical to the original positionMap —
// this is what every caller that doesn't pass `align` still gets.
const verticalPositionMap: Record<"top" | "bottom", Record<"left" | "center" | "right", string>> = {
  top: {
    left:   "bottom-full left-0 mb-2",
    center: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    right:  "bottom-full right-0 mb-2",
  },
  bottom: {
    left:   "top-full left-0 mt-2",
    center: "top-full left-1/2 -translate-x-1/2 mt-2",
    right:  "top-full right-0 mt-2",
  },
};

const verticalArrowMap: Record<"top" | "bottom", Record<"left" | "center" | "right", string>> = {
  top: {
    left:   "top-full left-3 border-l-transparent border-r-transparent border-b-transparent border-t-gray-800",
    center: "top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-800",
    right:  "top-full right-3 border-l-transparent border-r-transparent border-b-transparent border-t-gray-800",
  },
  bottom: {
    left:   "bottom-full left-3 border-l-transparent border-r-transparent border-t-transparent border-b-gray-800",
    center: "bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-800",
    right:  "bottom-full right-3 border-l-transparent border-r-transparent border-t-transparent border-b-gray-800",
  },
};

// ─── Tooltip Component (Pure CSS, no JS state) ────────────────────────────────

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = "top",
  className,
  align = "center",
}) => {
  if (!content) return <>{children}</>;

  const isVertical = side === "top" || side === "bottom";
  const positionClasses = isVertical
    ? verticalPositionMap[side][align]
    : sidePositionMap[side as "left" | "right"];
  const arrowClasses = isVertical
    ? verticalArrowMap[side][align]
    : sideArrowMap[side as "left" | "right"];

  return (
    <div className="group/tooltip relative inline-flex">
      {children}
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[2000] whitespace-nowrap",
          "rounded-lg bg-gray-800 px-2.5 py-1.5",
          "text-[11px] font-medium leading-tight text-white",
          "shadow-lg opacity-0 transition-opacity duration-150",
          "group-hover/tooltip:opacity-100",
          positionClasses,
          className
        )}
      >
        {content}
        <div className={cn("absolute border-4 border-transparent", arrowClasses)} />
      </div>
    </div>
  );
};

export default Tooltip;