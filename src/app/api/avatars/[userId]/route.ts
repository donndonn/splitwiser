import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guards";
import { receiptImageHttpResult } from "@/lib/receipt-blob";

export const dynamic = "force-dynamic";

function errorResponse(status: number, message: string) {
  return new NextResponse(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
    },
  });
}

/**
 * Uploaded avatars live in the private Blob store. Any signed-in account may
 * view them, since avatars show up in friend search and invitations as well
 * as groups.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const viewer = await getOptionalUser();
  if (!viewer) {
    return errorResponse(401, "Unauthorized");
  }

  const { userId } = await params;
  const [row] = await db
    .select({ avatarBlobPathname: users.avatarBlobPathname })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.avatarBlobPathname) {
    return errorResponse(404, "Not found");
  }

  let blobResult;
  try {
    blobResult = await get(row.avatarBlobPathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });
  } catch {
    return errorResponse(502, "Avatar unavailable");
  }

  // Same headers as receipts: private to the browser, revalidated by ETag.
  const http = receiptImageHttpResult(blobResult);
  return new NextResponse(http.body, {
    status: http.status,
    headers: http.headers,
  });
}
