"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-guards";
import {
  confirmPhoneCode,
  PhoneVerificationError,
  removePhone,
  requestPhoneCode,
} from "@/lib/phone-verification";

/** Errors come back as values: Next.js hides thrown messages in production. */
export type PhoneActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<PhoneActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof PhoneVerificationError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export async function sendPhoneCodeAction(
  raw: string,
): Promise<PhoneActionResult<string>> {
  const user = await requireUser("/profile");
  return run(() => requestPhoneCode(user.id, raw));
}

export async function confirmPhoneCodeAction(
  phone: string,
  code: string,
): Promise<PhoneActionResult> {
  const user = await requireUser("/profile");
  const result = await run(async () => {
    await confirmPhoneCode(user.id, phone, code);
    return undefined;
  });
  if (result.ok) revalidatePath("/profile");
  return result;
}

export async function removePhoneAction(): Promise<void> {
  const user = await requireUser("/profile");
  await removePhone(user.id);
  revalidatePath("/profile");
}
