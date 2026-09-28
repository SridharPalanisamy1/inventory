import React, { useState } from "react";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import { Modal } from "@/components/ui/Modal";
export interface ApprovalFailedReason {
  itemCode: string;
  reason: string;
  action: string;
}
interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: "ADJUST_SYSTEM" | "KEEP_SYSTEM", description: string) => void;
  systemStock: number | string;
  physicalStock: number | string;
  variance: number | string;
  itemName: string;
isLoading?: boolean;

stage?: "PREVIEW" | "APPROVING" | "VERIFYING" | "SUCCESS" | "FAILED";

progress?: number;
totalItems?: number;
verifiedItems?: number;
failedItems?: number;
failedReasons?: ApprovalFailedReason[];
bulkItems?: Array<{
  itemCode: string;
  itemName?: string;
  varianceName?: string;
  systemStock?: string | number | null;
  physicalStock?: string | number | null;
  physicalClosing?: string | number | null;
  variance?: string | number | null;
}>;
}

export function ApprovalModal({
  isOpen,
  onClose,
  onConfirm,
  systemStock,
  physicalStock,
  variance,
  itemName,
  isLoading = false,

  stage = "PREVIEW",
  progress = 0,
  totalItems = 0,
  verifiedItems = 0,
  failedItems = 0,
  failedReasons = [],
  bulkItems = [],
}: ApprovalModalProps) {
  const [description, setDescription] = useState("");

  const handleConfirm = (mode: "ADJUST_SYSTEM" | "KEEP_SYSTEM") => {
    onConfirm(mode, description);
  };
  // newly add this part 31 7 1
const formatValue = (value: number | string) => {
  const num = Number(value);

  return Number.isFinite(num)
    ? num.toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      })
    : value;
};
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      className="!p-0"
    >
      <div className="border-b border-border p-5 flex items-center justify-between bg-slate-50/50">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 m-0">
          <FactCheckOutlinedIcon className="w-5 h-5 text-brand-600" />
          Approve Variance
        </h3>
      </div>

      <div className="p-6">
      {stage !== "PREVIEW" && (
  <div className="mb-6">

    <div className="flex justify-between items-center mb-3">
      <div>
        <div className="text-[15px] font-semibold text-slate-800">
          {stage === "APPROVING" && "Approving stock variance..."}
          {stage === "VERIFYING" && "Verifying database..."}
          {stage === "SUCCESS" && "Approval Completed"}
          {stage === "FAILED" && "Verification Incomplete"}
        </div>

        <div className="text-[12px] text-slate-500 mt-1">
          {stage === "APPROVING" &&
            "Updating inventory and creating approval records"}

          {stage === "VERIFYING" &&
            "Confirming the final data directly from database"}

          {stage === "SUCCESS" &&
            "All approved items were verified successfully"}

          {stage === "FAILED" &&
            "Some items could not be verified"}
        </div>
      </div>

      <div className="text-[14px] font-bold text-brand-600">
        {progress}%
      </div>
    </div>

    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-5">
      <div
        className="h-full bg-blue-600 rounded-full transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>

    <div className="space-y-3 text-[13px]">

      <div className="flex items-center gap-3">
        <span>
          {stage !== "APPROVING" ? "✓" : "●"}
        </span>

        <span className="text-slate-700">
          Update inventory stock
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span>
          {stage === "VERIFYING" ||
          stage === "SUCCESS" ||
          stage === "FAILED"
            ? "✓"
            : "○"}
        </span>

        <span className="text-slate-700">
          Create approval records
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span>
          {stage === "SUCCESS"
            ? "✓"
            : stage === "FAILED"
            ? "!"
            : stage === "VERIFYING"
            ? "●"
            : "○"}
        </span>

        <span className="text-slate-700">
          Verify database records
        </span>
      </div>

    </div>

    {(stage === "SUCCESS" || stage === "FAILED") && (
      <div className="mt-6 grid grid-cols-3 gap-3">

        <div className="rounded-xl bg-slate-50 border p-3 text-center">
          <div className="text-xl font-bold text-slate-800">
            {totalItems}
          </div>

          <div className="text-[11px] text-slate-500">
            Total
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border p-3 text-center">
          <div className="text-xl font-bold text-green-600">
            {verifiedItems}
          </div>

          <div className="text-[11px] text-slate-500">
            Verified
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border p-3 text-center">
          <div className="text-xl font-bold text-red-600">
            {failedItems}
          </div>

          <div className="text-[11px] text-slate-500">
            Failed
          </div>
        </div>

      </div>
    )}
    {(stage === "SUCCESS" || stage === "FAILED") && failedReasons.length > 0 && (
      <div className="mt-5 max-h-64 overflow-auto rounded-xl border">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="text-left text-slate-500">
              <th className="px-2 py-1.5">Item Code</th>
              <th className="px-2 py-1.5">Why failed</th>
              <th className="px-2 py-1.5">What to do</th>
            </tr>
          </thead>
          <tbody>
            {failedReasons.map((f) => (
              <tr key={f.itemCode} className="border-t align-top">
                <td className="px-2 py-1.5 font-semibold text-slate-800">{f.itemCode}</td>
                <td className="px-2 py-1.5 text-red-600">{f.reason}</td>
                <td className="px-2 py-1.5 text-slate-600">{f.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {(stage === "SUCCESS" || stage === "FAILED") && (
      <div className="flex justify-center mt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-8 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    )}

  </div>
)}
{stage === "PREVIEW" && (
  <>
        <p className="text-slate-600 mb-6 leading-relaxed text-[13px]">
          You are about to approve the variance for <span className="font-semibold text-slate-800">{itemName}</span>. 
          Please choose how you want to adjust the system stock.
        </p>
{bulkItems.length === 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 mb-8 grid grid-cols-3 overflow-hidden">
          <div className="flex flex-col items-center justify-center py-5 px-4 text-center">
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mb-1">System Stock</div>
            <div className="text-xl font-semibold text-slate-800">{formatValue(systemStock)}</div>
          </div>
          <div className="flex flex-col items-center justify-center py-5 px-4 text-center">
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mb-1">Physical Stock</div>
            <div className="text-xl font-semibold text-slate-800">{formatValue(physicalStock)}</div>
          </div>
          <div className="flex flex-col items-center justify-center py-5 px-4 text-center">
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mb-1">Variance</div>
            <div className={`text-xl font-semibold ${typeof variance === 'number' && variance < 0 ? 'text-danger-600' : typeof variance === 'number' && variance > 0 ? 'text-success-600' : 'text-slate-800'}`}>
              {/* replace the part 31 7 1 */}
              {typeof variance === "number"
  ? `${variance > 0 ? "+" : ""}${formatValue(variance)}`
  : variance}
            </div>
          </div>
        </div>
)}

{bulkItems.length > 0 && (
  <div className="mb-6">

    <div className="flex items-center justify-between mb-3">
      <div>
        <div className="text-[14px] font-semibold text-slate-800">
          Items ready for approval
        </div>

        <div className="text-[12px] text-slate-500">
          Review the physical stock changes before approving.
        </div>
      </div>

      <div className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[12px] font-semibold">
        {bulkItems.length} Items
      </div>
    </div>

    <div className="border border-slate-200 rounded-xl overflow-hidden">

      <div className="grid grid-cols-[1.2fr_2fr_1fr_1fr_1fr] bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase">
        <div>Item Code</div>
        <div>Item</div>
        <div className="text-right">System</div>
        <div className="text-right">Physical</div>
        <div className="text-right">Variance</div>
      </div>

      <div className="max-h-[260px] overflow-y-auto">

        {bulkItems.map((item) => {

          const system =
            item.systemStock ?? 0;

          const physical =
            item.physicalClosing ??
            item.physicalStock ??
            0;

          const varianceValue =
            item.variance ??
            Number(physical) - Number(system);

          return (
            <div
              key={item.itemCode}
              className="grid grid-cols-[1.2fr_2fr_1fr_1fr_1fr] px-4 py-3 border-b border-slate-100 last:border-b-0 text-[12px]"
            >
              <div className="font-semibold text-slate-700">
                {item.itemCode}
              </div>

              <div className="text-slate-700 truncate pr-3">
                {item.varianceName || item.itemName || "-"}
              </div>

              <div className="text-right text-slate-700">
                {formatValue(system)}
              </div>

              <div className="text-right font-semibold text-slate-800">
                {formatValue(physical)}
              </div>

              <div
                className={`text-right font-semibold ${
                  Number(varianceValue) < 0
                    ? "text-red-600"
                    : Number(varianceValue) > 0
                    ? "text-green-600"
                    : "text-slate-600"
                }`}
              >
                {Number(varianceValue) > 0 ? "+" : ""}
                {formatValue(varianceValue)}
              </div>
            </div>
          );
        })}

      </div>

    </div>

  </div>
)}
{/* comment this part because no need of this part 31 7 1 */}
        {/* <div className="mb-6">
          <label className="block text-[13px] font-semibold text-slate-700 mb-2">
            Approval Remarks (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add any notes about this approval..."
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] shadow-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
          />
        </div> */}

        <div className="flex justify-center mt-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleConfirm("ADJUST_SYSTEM")}
            className="w-full max-w-[280px] flex flex-col items-center justify-center p-4 border-2 border-brand-200 rounded-xl hover:border-brand-500 hover:bg-brand-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="font-semibold text-brand-700 mb-1">Accept Physical Count</span>
            <span className="text-[11px] text-slate-500 text-center">Adjust the system stock</span>
          </button>
          {/* rempove this button 31 7 1 */}
          {/* <button
            type="button"
            disabled={isLoading}
            onClick={() => handleConfirm("KEEP_SYSTEM")}
            className="flex flex-col items-center p-4 border-2 border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="font-semibold text-slate-700 mb-1">Reject Physical Count</span>
            <span className="text-[11px] text-slate-500 text-center">Keep system stock unchanged</span>
          </button> */}
        </div>
          </>
)}
      </div>
    </Modal>
  );
}
