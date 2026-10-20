import { requireSameOrigin } from "@/modules/auth/auth.service";
import { collectorId, collectorInput } from "@/modules/people/people.http";
import { saveCollector } from "@/modules/people/people.repository";
import { userFailure, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = collectorId((await context.params).id);
    const { input, photo } = await collectorInput(request);
    return userResponse(await saveCollector(input, photo, id));
  } catch (error) { return userFailure(error); }
}
