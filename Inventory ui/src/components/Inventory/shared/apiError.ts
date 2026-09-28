export type ApiErrorLike = unknown;

const MAX_MESSAGE_LENGTH = 360;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringifySafe = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!isRecord(value)) return "";

  const parts = Object.entries(value)
    .map(([key, val]) => {
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        return `${key}: ${val}`;
      }
      return "";
    })
    .filter(Boolean);

  return parts.join(", ");
};

const collectMessages = (value: unknown, messages: string[] = []): string[] => {
  if (!value) return messages;

  if (typeof value === "string") {
    if (value.trim()) messages.push(value.trim());
    return messages;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectMessages(item, messages));
    return messages;
  }

  if (!isRecord(value)) return messages;

  const rowPrefix =
    typeof value.row === "number" || typeof value.row === "string"
      ? `Row ${value.row}: `
      : "";

  const loc = Array.isArray(value.loc) ? `${value.loc.join(".")}: ` : "";
  const direct =
    value.message ??
    value.detail ??
    value.error ??
    value.msg ??
    value.reason ??
    value.description;

  if (typeof direct === "string" && direct.trim()) {
    messages.push(`${rowPrefix}${loc}${direct.trim()}`);
  } else if (Array.isArray(direct) || isRecord(direct)) {
    collectMessages(direct, messages);
  }

  ["errors", "validationErrors", "rowErrors", "data"].forEach((key) => {
    if (key in value) collectMessages(value[key], messages);
  });

  if (!direct && messages.length === 0) {
    const fallback = stringifySafe(value);
    if (fallback) messages.push(fallback);
  }

  return messages;
};

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

export function getApiErrorMessage(
  error: ApiErrorLike,
  fallback = "Something went wrong. Please try again."
): string {
  const root = isRecord(error) && "payload" in error ? error.payload : error;
  const responseData =
    isRecord(root) && isRecord(root.response) && "data" in root.response
      ? root.response.data
      : undefined;
  const data = responseData ?? (isRecord(root) && "data" in root ? root.data : root);
  const messages = unique(collectMessages(data));

  if (!messages.length && isRecord(root) && typeof root.message === "string") {
    messages.push(root.message);
  }

  if (!messages.length) return fallback;

  const visible = messages.slice(0, 3);
  const suffix = messages.length > 3 ? ` + ${messages.length - 3} more errors.` : "";
  const joined = `${visible.join(" ")}${suffix}`;

  return joined.length > MAX_MESSAGE_LENGTH
    ? `${joined.slice(0, MAX_MESSAGE_LENGTH - 3)}...`
    : joined;
}

export const withApiReason = (prefix: string, error: ApiErrorLike, fallback: string) =>
  `${prefix}: ${getApiErrorMessage(error, fallback)}`;
