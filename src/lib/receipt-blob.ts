import {
  isReceiptImageMimeType,
  MAX_RECEIPT_IMAGE_BYTES,
  type ReceiptImageMimeType,
} from "@/lib/ai/parse-receipt-image";

export const RECEIPT_IMAGE_FIELD = "receiptImage";

/** Blob CDN cache between the Function and the private store (not the browser). */
export const RECEIPT_BLOB_CACHE_CONTROL_MAX_AGE = 60 * 60 * 24 * 30;

/** Browser cache for the auth'd receipt route. Do not add s-maxage. */
export const RECEIPT_BROWSER_CACHE_CONTROL = "private, no-cache";

/** Prevent Vercel CDN from caching private Function responses. */
export const RECEIPT_CDN_CACHE_CONTROL = "no-store";

export type ReceiptImageUpload = {
  file: File;
  contentType: ReceiptImageMimeType;
};

export function receiptExtensionForContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    default:
      return "jpg";
  }
}

export function receiptBlobPathname(
  groupId: string,
  expenseId: string,
  contentType: string = "image/jpeg",
): string {
  const ext = receiptExtensionForContentType(contentType);
  return `receipts/${groupId}/${expenseId}.${ext}`;
}

export function receiptImageApiPath(expenseId: string): string {
  return `/api/receipts/${expenseId}`;
}

export function readReceiptImageFromFormData(
  formData: FormData,
): ReceiptImageUpload | null {
  const value = formData.get(RECEIPT_IMAGE_FIELD);
  if (value == null || value === "") return null;
  if (!(value instanceof Blob)) {
    throw new Error("Invalid receipt image");
  }
  if (value.size === 0) return null;
  if (value.size > MAX_RECEIPT_IMAGE_BYTES) {
    throw new Error(
      "That photo is still too large. Try a closer crop of the receipt.",
    );
  }
  const contentType = (value.type || "image/jpeg").toLowerCase();
  if (!isReceiptImageMimeType(contentType)) {
    throw new Error("Use a JPEG, PNG, or WebP photo of the receipt.");
  }
  const file =
    value instanceof File
      ? value
      : new File(
          [value],
          `receipt.${receiptExtensionForContentType(contentType)}`,
          { type: contentType },
        );
  return { file, contentType };
}

export type ReceiptGetResult = {
  statusCode: number;
  stream: ReadableStream<Uint8Array> | null;
  blob: {
    contentType: string | null;
    etag: string;
  };
};

export function receiptImageHttpResult(
  result: ReceiptGetResult | null,
  fallbackContentType?: string | null,
): {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
} {
  const baseHeaders = {
    "Cache-Control": RECEIPT_BROWSER_CACHE_CONTROL,
    "CDN-Cache-Control": RECEIPT_CDN_CACHE_CONTROL,
  };

  if (!result) {
    return { status: 404, headers: baseHeaders, body: null };
  }

  if (result.statusCode === 304) {
    return {
      status: 304,
      headers: {
        ...baseHeaders,
        ETag: result.blob.etag,
      },
      body: null,
    };
  }

  if (result.statusCode !== 200 || !result.stream) {
    return { status: 404, headers: baseHeaders, body: null };
  }

  const contentType =
    result.blob.contentType ?? fallbackContentType ?? "application/octet-stream";

  return {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      ETag: result.blob.etag,
    },
    body: result.stream,
  };
}
