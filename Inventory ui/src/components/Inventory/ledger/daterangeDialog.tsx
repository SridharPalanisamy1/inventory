// "use client";

// /**
//  * ledger/daterangeDialog.tsx — rewritten with pure Tailwind.
//  * Preserves react-date-range. Replaces MUI Modal with custom portal dialog
//  * wide enough to fit the 2-month DateRangePicker without scrolling.
//  */

// import React from 'react';
// import { DateRangePicker, RangeKeyDict } from 'react-date-range';
// import { addDays, startOfYear, endOfYear, startOfDay, endOfDay } from 'date-fns';
// import { Button } from "@/components/ui/Button";
// import { createPortal } from "react-dom";
// import { cn } from "@/lib/utils";

// interface SelectionRange {
//   startDate: Date;
//   endDate: Date;
//   key: string;
// }

// interface DateRangeDialogProps {
//   selectionRange: SelectionRange;
//   setSelectionRange: React.Dispatch<React.SetStateAction<SelectionRange>>;
//   onApply?: () => void;
// }

// const DateRangeDialog: React.FC<DateRangeDialogProps> = ({ selectionRange, setSelectionRange, onApply }) => {
//   const [open, setOpen] = React.useState(false);
//   const [compact, setCompact] = React.useState(false);
//   const [mounted, setMounted] = React.useState(false);

//   React.useEffect(() => {
//     setMounted(true);
//     const handleResize = () => setCompact(window.innerWidth < 700);
//     handleResize();
//     window.addEventListener("resize", handleResize);
//     return () => window.removeEventListener("resize", handleResize);
//   }, []);

//   const handleOpen = () => setOpen(true);
//   const handleClose = () => setOpen(false);

//   const handleSelect = (ranges: RangeKeyDict) => {
//     const { selection } = ranges;
//     if (!selection?.startDate || !selection?.endDate) return;
//     setSelectionRange({
//       startDate: startOfDay(selection.startDate),
//       endDate: endOfDay(selection.endDate),
//       key: 'selection',
//     });
//   };

//   const handlePresetSelection = (preset: string) => {
//     let startDate: Date, endDate: Date;
//     const today = new Date();
//     switch (preset) {
//       case 'This Year':
//         startDate = startOfYear(today);
//         endDate = endOfYear(today);
//         break;
//       case 'Before Year':
//         startDate = startOfYear(addDays(today, -365));
//         endDate = endOfYear(addDays(today, -365));
//         break;
//       default:
//         startDate = endDate = today;
//         break;
//     }
//     setSelectionRange({
//       startDate: startOfDay(startDate),
//       endDate: endOfDay(endDate),
//       key: 'selection',
//     });
//   };

//   const handleClear = () => {
//     const today = new Date();
//     setSelectionRange({
//       startDate: startOfDay(today),
//       endDate: endOfDay(today),
//       key: 'selection',
//     });
//   };

//   const handleApply = () => {
//     if (onApply) onApply();
//     handleClose();
//   };

//   const formatDate = (date: Date) =>
//     `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

//   const modal = (
//     <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
//       {/* Backdrop */}
//       <div
//         className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
//         onClick={handleClose}
//       />

//       {/* Dialog panel — wide enough for the 2-month picker */}
//       <div
//         className={cn(
//           "relative z-10 flex flex-col bg-white rounded-2xl shadow-2xl border border-border",
//           "w-full",
//           compact ? "max-w-sm" : "max-w-[780px]"
//         )}
//         onClick={(e) => e.stopPropagation()}
//       >
//         {/* Header */}
//         <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
//           <h2 className="text-[15px] font-extrabold text-text-primary">Select Date Range</h2>
//           <button
//             onClick={handleClose}
//             className="flex items-center justify-center w-7 h-7 rounded-full text-text-muted hover:bg-surface-subtle hover:text-text-primary transition-colors"
//             aria-label="Close"
//           >
//             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
//               <path d="M18 6L6 18M6 6l12 12" />
//             </svg>
//           </button>
//         </div>

//         {/* Body */}
//         <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
//           {/* Preset buttons */}
//           <div className="flex gap-2 flex-wrap">
//             <Button variant="outline" size="sm" onClick={() => handlePresetSelection('This Year')}>This Year</Button>
//             <Button variant="outline" size="sm" onClick={() => handlePresetSelection('Before Year')}>Before Year</Button>
//           </div>

//           {/* Calendar — no overflow-x so it expands to full width naturally */}
//           <div className="border border-border rounded-xl bg-white overflow-hidden w-full flex justify-center">
//             <DateRangePicker
//               ranges={[selectionRange]}
//               onChange={handleSelect}
//               months={compact ? 1 : 2}
//               direction={compact ? "vertical" : "horizontal"}
//               rangeColors={["#1976d2"]}
//             />
//           </div>
//         </div>

//         {/* Footer */}
//         <div className="flex gap-2 justify-end px-5 py-4 border-t border-border shrink-0">
//           <Button variant="outline" onClick={handleClear}>Clear</Button>
//           <Button variant="ghost" onClick={handleClose}>Cancel</Button>
//           <Button variant="primary" onClick={handleApply}>Apply</Button>
//         </div>
//       </div>
//     </div>
//   );

//   return (
//     <div>
//       <Button variant="outline" onClick={handleOpen}>
//         {selectionRange.startDate && selectionRange.endDate
//           ? `${formatDate(selectionRange.startDate)} - ${formatDate(selectionRange.endDate)}`
//           : "Date Filter"}
//       </Button>

//       {mounted && open ? createPortal(modal, document.body) : null}
//     </div>
//   );
// };

// export default DateRangeDialog;
// replace the part 7 8 1
"use client";

/**
 * ledger/daterangeDialog.tsx
 *
 * Matches the reference live UI (Image 2): default react-date-range
 * static-ranges sidebar (Today / Yesterday / This Week / Last Week /
 * This Month / Last Month) + input ranges ("days up to today" /
 * "days starting today"), with CLEAR / CANCEL / APPLY in the header
 * and THIS YEAR / BEFORE YEAR as text links.
 *
 * Props interface (selectionRange, setSelectionRange, onApply) is 100%
 * unchanged from before — page.tsx does not need any edits.
 */

import React from 'react';
import { DateRangePicker, RangeKeyDict } from 'react-date-range';
import { addDays, startOfYear, endOfYear, startOfDay, endOfDay } from 'date-fns';
import { Button } from "@/components/ui/Button";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// Required base styles for react-date-range. These power the default
// static-ranges sidebar and input-ranges rows used in this design.
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

interface SelectionRange {
  startDate: Date;
  endDate: Date;
  key: string;
}

interface DateRangeDialogProps {
  selectionRange: SelectionRange;
  setSelectionRange: React.Dispatch<React.SetStateAction<SelectionRange>>;
  onApply?: () => void;
}

const DateRangeDialog: React.FC<DateRangeDialogProps> = ({ selectionRange, setSelectionRange, onApply }) => {
  const [open, setOpen] = React.useState(false);
  const [compact, setCompact] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const handleResize = () => setCompact(window.innerWidth < 900);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSelect = (ranges: RangeKeyDict) => {
    const { selection } = ranges;
    if (!selection?.startDate || !selection?.endDate) return;
    setSelectionRange({
      startDate: startOfDay(selection.startDate),
      endDate: endOfDay(selection.endDate),
      key: 'selection',
    });
  };

  const handlePresetSelection = (preset: string) => {
    let startDate: Date, endDate: Date;
    const today = new Date();
    switch (preset) {
      case 'This Year':
        startDate = startOfYear(today);
        endDate = endOfYear(today);
        break;
      case 'Before Year':
        startDate = startOfYear(addDays(today, -365));
        endDate = endOfYear(addDays(today, -365));
        break;
      default:
        startDate = endDate = today;
        break;
    }
    setSelectionRange({
      startDate: startOfDay(startDate),
      endDate: endOfDay(endDate),
      key: 'selection',
    });
  };

  const handleClear = () => {
    const today = new Date();
    setSelectionRange({
      startDate: startOfDay(today),
      endDate: endOfDay(today),
      key: 'selection',
    });
  };

  const handleApply = () => {
    if (onApply) onApply();
    handleClose();
  };

  const formatDate = (date: Date) =>
    `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      {/* Dialog panel — wide enough for sidebar + 2-month picker (like the reference) */}
      <div
        className={cn(
          "relative z-10 flex flex-col bg-white rounded-xl shadow-2xl border border-border overflow-hidden",
          "w-full",
          compact ? "max-w-sm" : "max-w-[980px]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: title left, Clear / Cancel / Apply right — matches reference */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0 gap-3 flex-wrap">
          <h2 className="text-[15px] font-bold text-text-primary whitespace-nowrap">Select Date Range</h2>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="text-[12px] font-bold text-brand-600 uppercase tracking-wide px-2 py-1 rounded-md hover:bg-brand-50 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleClose}
              className="text-[12px] font-bold text-brand-600 uppercase tracking-wide px-2 py-1 rounded-md hover:bg-brand-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="text-[12px] font-bold text-brand-600 uppercase tracking-wide px-3 py-1.5 rounded-md border border-brand-200 hover:bg-brand-50 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>

        {/* THIS YEAR / BEFORE YEAR — text-link style, under the header */}
        <div className="flex items-center gap-4 px-5 pt-3 shrink-0">
          <button
            onClick={() => handlePresetSelection('This Year')}
            className="text-[12px] font-bold text-brand-600 uppercase tracking-wide hover:underline"
          >
            This Year
          </button>
          <button
            onClick={() => handlePresetSelection('Before Year')}
            className="text-[12px] font-bold text-brand-600 uppercase tracking-wide hover:underline"
          >
            Before Year
          </button>
        </div>

        {/* Body: default react-date-range UI — static ranges sidebar + input ranges + calendar */}
        <div className="px-5 pb-5 pt-3 overflow-x-auto">
          <DateRangePicker
            ranges={[selectionRange]}
            onChange={handleSelect}
            months={compact ? 1 : 2}
            direction={compact ? "vertical" : "horizontal"}
            rangeColors={["#1976d2"]}
            showDateDisplay={true}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <Button variant="outline" onClick={handleOpen}>
        {selectionRange.startDate && selectionRange.endDate
          ? `${formatDate(selectionRange.startDate)} - ${formatDate(selectionRange.endDate)}`
          : "Date Filter"}
      </Button>

      {mounted && open ? createPortal(modal, document.body) : null}
    </div>
  );
};

export default DateRangeDialog;