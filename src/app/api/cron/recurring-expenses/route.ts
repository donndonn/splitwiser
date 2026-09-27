import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { generateDueRecurringExpenses } from "@/lib/recurring-expenses";

export const dynamic = "force-dynamic";

/**
 * Daily Vercel Cron job (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateDueRecurringExpenses(db);
  for (const groupId of result.groupIds) {
    revalidatePath(`/g/${groupId}`);
    revalidatePath(`/g/${groupId}/balances`);
    revalidatePath(`/g/${groupId}/activity`);
  }
  revalidatePath("/");

  return Response.json({ created: result.created, failed: result.failed });
}
