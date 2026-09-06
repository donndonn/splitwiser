import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_IMAGE_BYTES } from "@/lib/ai/parse-receipt-image";
import {
  RECEIPT_BROWSER_CACHE_CONTROL,
  RECEIPT_CDN_CACHE_CONTROL,
  RECEIPT_IMAGE_FIELD,
  readReceiptImageFromFormData,
  receiptBlobPathname,
  receiptExtensionForContentType,
  receiptImageApiPath,
  receiptImageHttpResult,
} from "@/lib/receipt-blob";

describe("receiptBlobPathname", () => {
  it("stores jpeg receipts at receipts/{groupId}/{expenseId}.jpg", () => {
    expect(
      receiptBlobPathname("group-1", "expense-2", "image/jpeg"),
    ).toBe("receipts/group-1/expense-2.jpg");
  });

  it("uses png and webp extensions when the content type matches", () => {
    expect(receiptExtensionForContentType("image/png")).toBe("png");
    expect(receiptExtensionForContentType("image/webp")).toBe("webp");
    expect(
      receiptBlobPathname("g", "e", "image/webp"),
    ).toBe("receipts/g/e.webp");
  });
});

describe("receiptImageApiPath", () => {
  it("points at the auth'd receipt route", () => {
    expect(receiptImageApiPath("exp-1")).toBe("/api/receipts/exp-1");
  });
});

describe("readReceiptImageFromFormData", () => {
  it("returns null when the field is missing or empty", () => {
    expect(readReceiptImageFromFormData(new FormData())).toBeNull();

    const empty = new FormData();
    empty.set(
      RECEIPT_IMAGE_FIELD,
      new File([], "receipt.jpg", { type: "image/jpeg" }),
    );
    expect(readReceiptImageFromFormData(empty)).toBeNull();
  });

  it("accepts a jpeg under the size cap", () => {
    const formData = new FormData();
    formData.set(
      RECEIPT_IMAGE_FIELD,
      new File([new Uint8Array([1, 2, 3, 4])], "receipt.jpg", {
        type: "image/jpeg",
      }),
    );
    const result = readReceiptImageFromFormData(formData);
    expect(result?.contentType).toBe("image/jpeg");
    expect(result?.file.size).toBe(4);
  });

  it("rejects oversized and unsupported files", () => {
    const huge = new FormData();
    huge.set(
      RECEIPT_IMAGE_FIELD,
      new File([new Uint8Array(MAX_RECEIPT_IMAGE_BYTES + 1)], "receipt.jpg", {
        type: "image/jpeg",
      }),
    );
    expect(() => readReceiptImageFromFormData(huge)).toThrow(/too large/);

    const gif = new FormData();
    gif.set(
      RECEIPT_IMAGE_FIELD,
      new File([new Uint8Array([1])], "receipt.gif", { type: "image/gif" }),
    );
    expect(() => readReceiptImageFromFormData(gif)).toThrow(/JPEG, PNG, or WebP/);
  });
});

describe("receiptImageHttpResult", () => {
  it("returns 404 without caching at the CDN when the blob is missing", () => {
    const result = receiptImageHttpResult(null);
    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
    expect(result.headers["Cache-Control"]).toBe(RECEIPT_BROWSER_CACHE_CONTROL);
    expect(result.headers["CDN-Cache-Control"]).toBe(RECEIPT_CDN_CACHE_CONTROL);
    expect(JSON.stringify(result.headers)).not.toMatch(/s-maxage/);
  });

  it("returns 304 with ETag and private no-cache headers", () => {
    const result = receiptImageHttpResult({
      statusCode: 304,
      stream: null,
      blob: { contentType: null, etag: '"abc"' },
    });
    expect(result.status).toBe(304);
    expect(result.body).toBeNull();
    expect(result.headers.ETag).toBe('"abc"');
    expect(result.headers["Cache-Control"]).toBe("private, no-cache");
    expect(result.headers["CDN-Cache-Control"]).toBe("no-store");
  });

  it("streams 200 with content-type, nosniff, and etag", () => {
    const stream = new ReadableStream<Uint8Array>();
    const result = receiptImageHttpResult(
      {
        statusCode: 200,
        stream,
        blob: { contentType: "image/jpeg", etag: '"xyz"' },
      },
      "image/png",
    );
    expect(result.status).toBe(200);
    expect(result.body).toBe(stream);
    expect(result.headers["Content-Type"]).toBe("image/jpeg");
    expect(result.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(result.headers.ETag).toBe('"xyz"');
    expect(result.headers["Cache-Control"]).toBe("private, no-cache");
    expect(JSON.stringify(result.headers)).not.toMatch(/s-maxage/);
  });
});
