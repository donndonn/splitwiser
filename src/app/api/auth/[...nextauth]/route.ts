import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { withAuthRequestContext } from "@/lib/auth-request-context";

export function GET(request: NextRequest) {
  return withAuthRequestContext(request, () => handlers.GET(request));
}

export function POST(request: NextRequest) {
  return withAuthRequestContext(request, () => handlers.POST(request));
}
