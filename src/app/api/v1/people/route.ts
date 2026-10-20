import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { collectorInput } from "@/modules/people/people.http";
import { listCollectors, saveCollector } from "@/modules/people/people.repository";
import { collectorQuerySchema } from "@/modules/people/people.schema";
import { userFailure, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const query = collectorQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { collectors, ...meta } = await listCollectors(query.data);
    return userResponse(collectors, 200, meta);
  } catch (error) { return userFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const { input, photo } = await collectorInput(request);
    return userResponse(await saveCollector(input, photo), 201);
  } catch (error) { return userFailure(error); }
}
