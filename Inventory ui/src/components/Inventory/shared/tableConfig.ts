/**
 * Shared table constants used across all inventory dataTable components.
 * Changing a value here updates ALL tables at once.
 */

/** Width of the sticky S.No column (px) */
export const STICKY_SNO_WIDTH = 48;

/** Width of the sticky Item Code column (px) */
export const STICKY_CODE_WIDTH = 96;

/** left offset of Item Code sticky column — must equal STICKY_SNO_WIDTH */
export const STICKY_CODE_LEFT = STICKY_SNO_WIDTH;

/** Column count above which the table becomes horizontally scrollable */
export const COLUMN_SCROLL_THRESHOLD = 10;

/** Per-column width used to compute tableMinWidth when scrollable */
export const DEFAULT_COLUMN_WIDTH_PX = 110;

/** Width of Approve / Approved / N/A action buttons (Tailwind JIT safe string) */
export const ACTION_BUTTON_WIDTH = "w-[88px]";

/** maxLength for physical stock input fields */
export const PHYSICAL_INPUT_MAX_LENGTH = 8;

/**
 * Returns the table minimum width string.
 * When columnCount > COLUMN_SCROLL_THRESHOLD it grows to fit; otherwise 100%.
 */
export const tableMinWidth = (columnCount: number): string =>
  columnCount > COLUMN_SCROLL_THRESHOLD
    ? `${columnCount * DEFAULT_COLUMN_WIDTH_PX}px`
    : "100%";

/**
 * Relative weight per column, used to derive <colgroup> percentage widths so
 * a table-layout:fixed table with width:100% always fills its container —
 * unset-width columns are not reliably distributed across browsers/render
 * states (e.g. an empty tbody), so every column must get an explicit width.
 */
export const buildColWidthPercents = (
  weights: Record<string, number>,
  visibleCols: string[]
): Record<string, string> => {
  const totalWeight = visibleCols.reduce((sum, col) => sum + (weights[col] ?? 0), 0) || 1;
  const result: Record<string, string> = {};
  visibleCols.forEach((col) => {
    result[col] = `${((weights[col] ?? 0) / totalWeight) * 100}%`;
  });
  return result;
};

/** Tailwind classes for the sticky S.No th */
export const STICKY_SNO_TH_CLS = `w-[${STICKY_SNO_WIDTH}px] sticky left-0 z-30 shadow-[1px_0_0_theme(colors.border)]`;

/** Tailwind classes for the sticky Item Code th */
export const STICKY_CODE_TH_CLS = `w-[${STICKY_CODE_WIDTH}px] sticky left-[${STICKY_CODE_LEFT}px] z-30 shadow-[1px_0_0_theme(colors.border)]`;

/** Tailwind classes for the sticky Action th (right-anchored) */
export const STICKY_ACTION_TH_CLS = `w-[90px] sticky right-0 z-30 shadow-[-1px_0_0_theme(colors.border)]`;

/** Tailwind classes for the sticky S.No td */
export const STICKY_SNO_TD_CLS = `sticky left-0 z-10 bg-inherit shadow-[1px_0_0_theme(colors.border)]`;

/** Tailwind classes for the sticky Item Code td */
export const STICKY_CODE_TD_CLS = `sticky left-[${STICKY_CODE_LEFT}px] z-10 bg-inherit shadow-[1px_0_0_theme(colors.border)]`;

/** Tailwind classes for the sticky Action td */
export const STICKY_ACTION_TD_CLS = `sticky right-0 z-10 bg-inherit shadow-[-1px_0_0_theme(colors.border)]`;

/** Shared thead th base classes */
export const TH_BASE_CLS =
  "px-2.5 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-surface-muted border-b-[2px] border-border";

/** Shared tbody td base classes */
export const TD_BASE_CLS = "px-2.5 py-1.5 border-b border-surface-subtle";

/** Row class for a row with a pending/changed value */
export const ROW_CHANGED_CLS = "bg-warning-50 hover:bg-warning-100 border-l-2 border-warning-300";

/** Default row class */
export const ROW_DEFAULT_CLS = "bg-white hover:bg-brand-50/40";
