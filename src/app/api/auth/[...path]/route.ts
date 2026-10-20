import { getAuth } from "@/lib/auth/server";
import { authErrorResponse, handleAuthPost } from "@/modules/auth/auth.service";
import type { NextRequest } from "next/server";
import type { AuthRouteContext } from "@/modules/auth/auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: AuthRouteContext) {
  if ((await context.params).path.join("/") !== "get-session") {
    return authErrorResponse("ACCESS_DENIED", 403);
  }
  try {
    const response = await getAuth().handler().GET(request, context);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return authErrorResponse("AUTH_UNAVAILABLE", 503);
  }
}

export const POST = handleAuthPost;
