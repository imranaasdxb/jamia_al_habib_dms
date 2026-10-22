import { requireSameOrigin } from "@/modules/auth/auth.service";
import { collectorId, collectorInput } from "@/modules/people/people.http";
import { saveCollector, setCollectorEligibility } from "@/modules/people/people.repository";
import { collectorEligibilitySchema } from "@/modules/people/people.schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { userFailure, userJson, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = collectorId((await context.params).id);
    const input = collectorEligibilitySchema.safeParse(await userJson(request));
    if (!input.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await setCollectorEligibility(id, input.data));
  } catch (error) { return userFailure(error); }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = collectorId((await context.params).id);
    const { input, photo } = await collectorInput(request);
    return userResponse(await saveCollector(input, photo, id));
  } catch (error) { return userFailure(error); }
}
