import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { masterFailure } from "@/modules/masters/masters.http";
import { listMasterRecords, saveMasterRecord } from "@/modules/masters/masters.repository";
import { masterQuerySchema, masterSubmissionSchema } from "@/modules/masters/masters.schema";
import { userJson, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const parsed = masterQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { rows, ...meta } = await listMasterRecords(parsed.data);
    return userResponse(rows, 200, meta);
  } catch (error) { return masterFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const parsed = masterSubmissionSchema.safeParse(await userJson(request));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await saveMasterRecord(parsed.data), 201);
  } catch (error) { return masterFailure(error); }
}
