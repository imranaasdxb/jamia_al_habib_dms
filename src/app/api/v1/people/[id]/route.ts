import { requireSameOrigin } from "@/modules/auth/auth.service";
import { collectorId, collectorInput } from "@/modules/people/people.http";
import { deleteCollector, saveCollector, setCollectorEligibility, setCollectorStatus } from "@/modules/people/people.repository";
import { collectorDeleteSchema, collectorPatchSchema } from "@/modules/people/people.schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { userFailure, userJson, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = collectorId((await context.params).id);
    const input = collectorDeleteSchema.safeParse(await userJson(request));
    if (!input.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await deleteCollector(id, input.data));
  } catch (error) { return userFailure(error); }
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = collectorId((await context.params).id);
    const input = collectorPatchSchema.safeParse(await userJson(request));
    if (!input.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse("status" in input.data ? await setCollectorStatus(id, input.data) : await setCollectorEligibility(id, input.data));
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
