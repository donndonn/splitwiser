import { del, put } from "@vercel/blob";
import {
  RECEIPT_BLOB_CACHE_CONTROL_MAX_AGE,
  receiptBlobPathname,
} from "@/lib/receipt-blob";

export async function putReceiptBlob({
  groupId,
  expenseId,
  body,
  contentType,
}: {
  groupId: string;
  expenseId: string;
  body: File | Blob;
  contentType: string;
}): Promise<{ pathname: string; contentType: string }> {
  const pathname = receiptBlobPathname(groupId, expenseId, contentType);
  await put(pathname, body, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    cacheControlMaxAge: RECEIPT_BLOB_CACHE_CONTROL_MAX_AGE,
  });
  return { pathname, contentType };
}

export async function deleteReceiptBlob(pathname: string): Promise<void> {
  await del(pathname);
}
