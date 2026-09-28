import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { activeExpense } from "@/lib/expenses";
import { receiptImageHttpResult } from "@/lib/receipt-blob";
import { getSharedGroup } from "@/lib/share-link";

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

/** Receipt photo for a view-only link. Stops working once the link is reset or off. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; expenseId: string }> },
) {
  const { token, expenseId } = await params;
  const group = await getSharedGroup(db, token);
  if (!group) {
    return errorResponse(404, "Not found");
  }

  const [expense] = await db
    .select({
      receiptBlobPathname: expenses.receiptBlobPathname,
      receiptContentType: expenses.receiptContentType,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.groupId, group.id),
        activeExpense(),
      ),
    )
    .limit(1);

  if (!expense?.receiptBlobPathname) {
    return errorResponse(404, "Not found");
  }

  let blobResult;
  try {
    blobResult = await get(expense.receiptBlobPathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });
  } catch {
    return errorResponse(502, "Receipt unavailable");
  }

  const http = receiptImageHttpResult(blobResult, expense.receiptContentType);
  return new NextResponse(http.body, {
    status: http.status,
    headers: {
      ...http.headers,
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
