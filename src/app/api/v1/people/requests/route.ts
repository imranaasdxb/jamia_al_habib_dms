import { collectorQuerySchema } from "@/modules/people/people.schema";
import { listCollectorRequests } from "@/modules/people/people.repository";
import { AuthFailure } from "@/modules/auth/auth.types";
import { userFailure, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const parsed = collectorQuerySchema.safeParse({ page: request.nextUrl.searchParams.get("page") ?? 1 });
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { requests, ...meta } = await listCollectorRequests(parsed.data.page);
    return userResponse(requests, 200, meta);
  } catch (error) { return userFailure(error); }
}
