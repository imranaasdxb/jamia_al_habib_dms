import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { collectorId } from "@/modules/people/people.http";
import { reviewCollectorRequest } from "@/modules/people/people.repository";
import { reviewCollectorSchema } from "@/modules/people/people.schema";
import { userFailure, userJson, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = collectorId((await context.params).id);
    const parsed = reviewCollectorSchema.safeParse(await userJson(request));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await reviewCollectorRequest(id, parsed.data.decision, parsed.data.note));
  } catch (error) { return userFailure(error); }
}
