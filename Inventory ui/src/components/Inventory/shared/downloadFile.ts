import { getApiErrorMessage } from "./apiError";

export const getFilenameFromContentDisposition = (
  contentDisposition: string | undefined,
  fallback: string
) => {
  if (!contentDisposition) return fallback;
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1].replace(/"/g, ""));
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
};

const blobLooksLikeJson = (blob: Blob) =>
  blob.type.includes("application/json") || blob.type.includes("text/json");

export async function throwIfBlobError(blob: Blob): Promise<void> {
  if (!blob.size) {
    throw new Error("Empty file received from server.");
  }

  if (blobLooksLikeJson(blob)) {
    const text = await blob.text();
    try {
      throw new Error(getApiErrorMessage(JSON.parse(text), "Server returned an export error."));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(text || "Server returned an export error.");
      }
      throw error;
    }
  }
}

export async function downloadBlobSafely(blob: Blob, filename: string) {
  await throwIfBlobError(blob);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}
