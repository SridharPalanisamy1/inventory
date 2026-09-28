export const isMissingInventoryValue = (value: unknown) => {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "" ||
      normalized === "-" ||
      normalized === "null" ||
      normalized === "undefined" ||
      normalized === "n/a"
    );
  }

  return false;
};

export const inventoryUi = {
  pageBg: "#f6f9fd",
  surface: "#ffffff",
  surfaceSoft: "#fbfdff",
  tableHeader: "#f8fbff",
  tableHeaderSticky: "#f8fbff",
  tableHeaderBorder: "rgba(203,213,225,0.72)",
  tableBorder: "#e8eef6",
  tableBorderSoft: "#f0f4f8",
  rowHover: "#f8fbff",
  accent: "#1976d2",
  accentDark: "#1258a8",
  accentBg: "#eef6ff",
  success: "#16a34a",
  successBg: "#ecfdf5",
  successBorder: "#bbf7d0",
  warning: "#d97706",
  warningBg: "#fff7ed",
  warningBorder: "#fed7aa",
  danger: "#dc2626",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  noData: "#94a3b8",
};

export const formatInventoryQty = (value: unknown, fallback = "-") => {
  if (isMissingInventoryValue(value)) return fallback;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return String(value);
  }

  if (Number.isInteger(numberValue)) {
    return numberValue.toLocaleString("en-IN");
  }

return numberValue.toLocaleString("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});
};

export const getInventoryNumber = (value: unknown) => {
  if (isMissingInventoryValue(value)) return null;

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};
