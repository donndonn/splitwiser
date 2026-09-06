import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { getMembership } from "@/lib/auth-guards";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ expenseId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse(401, "Unauthorized");
  }

  const { expenseId } = await params;
  const [expense] = await db
    .select({
      id: expenses.id,
      groupId: expenses.groupId,
      receiptBlobPathname: expenses.receiptBlobPathname,
      receiptContentType: expenses.receiptContentType,
    })
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);

  if (!expense) {
    return errorResponse(404, "Not found");
  }

  const member = await getMembership(expense.groupId, session.user.id);
  if (!member) {
    return errorResponse(403, "Forbidden");
  }

  if (!expense.receiptBlobPathname) {
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

  const http = receiptImageHttpResult(
    blobResult,
    expense.receiptContentType,
  );
  return new NextResponse(http.body, {
    status: http.status,
    headers: http.headers,
  });
}
