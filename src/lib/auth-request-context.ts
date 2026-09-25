import { AsyncLocalStorage } from "node:async_hooks";
import {
  AdmissionError,
  admitNewUser,
  type AdmissionFailure,
  type NewUserProfile,
} from "@/lib/admission";
import type { Db } from "@/db/types";
import type { User } from "@/db/schema";
import {
  SIGNUP_INVITE_COOKIE,
  decodeSignupInvite,
} from "@/lib/signup-invite-cookie";

/**
 * Per-request state for the Auth.js route handler. Never store invitation
 * context in module-level variables: concurrent requests share the process.
 */
export type AuthRequestContext = {
  signupInviteId: string | null;
  admissionFailure: AdmissionFailure | null;
};

const authRequestContext = new AsyncLocalStorage<AuthRequestContext>();

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * Runs an Auth.js handler with request-scoped invitation context. When
 * account creation is rejected (including a lost race at the final database
 * check), Auth.js reports a generic error; redirect to the specific reason.
 */
export async function withAuthRequestContext(
  request: Request,
  handler: () => Promise<Response>,
  secret: string | undefined = process.env.AUTH_SECRET,
): Promise<Response> {
  const context: AuthRequestContext = {
    signupInviteId: decodeSignupInvite(
      readCookie(request, SIGNUP_INVITE_COOKIE),
      secret,
    ),
    admissionFailure: null,
  };

  const response = await authRequestContext.run(context, handler);
  if (!context.admissionFailure) return response;

  const target = new URL(
    "/signin",
    response.headers.get("location") ?? request.url,
  );
  target.searchParams.set("error", context.admissionFailure);
  const headers = new Headers(response.headers);
  headers.set("location", target.toString());
  return new Response(null, { status: 302, headers });
}

/**
 * Adapter createUser. Auth.js calls it only after existing-account and
 * email-linking lookups miss, so returning users and extra providers never
 * reach here. New accounts need a signed invitation and a free slot.
 */
export async function createUserWithAdmission(
  client: Db,
  profile: NewUserProfile,
): Promise<User> {
  const context = authRequestContext.getStore();
  try {
    return await admitNewUser(client, {
      inviteId: context?.signupInviteId ?? null,
      profile,
    });
  } catch (error) {
    if (error instanceof AdmissionError) {
      if (context) context.admissionFailure = error.reason;
      console.warn("[admission] new account rejected", {
        reason: error.reason,
      });
    }
    throw error;
  }
}
