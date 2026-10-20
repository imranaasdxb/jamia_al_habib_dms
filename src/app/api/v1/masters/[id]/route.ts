import { z } from "zod";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { masterFailure } from "@/modules/masters/masters.http";
import { saveMasterRecord } from "@/modules/masters/masters.repository";
import { masterSubmissionSchema } from "@/modules/masters/masters.schema";
import { userJson, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const id = z.uuid().safeParse((await context.params).id);
    const parsed = masterSubmissionSchema.safeParse(await userJson(request));
    if (!id.success || !parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await saveMasterRecord(parsed.data, id.data));
  } catch (error) { return masterFailure(error); }
}
