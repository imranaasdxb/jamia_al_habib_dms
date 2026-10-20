import { AuthFailure } from "@/modules/auth/auth.types";
import { masterFailure } from "@/modules/masters/masters.http";
import { listMasterRecords } from "@/modules/masters/masters.repository";
import { masterQuerySchema } from "@/modules/masters/masters.schema";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const parsed = masterQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { rows, ...meta } = await listMasterRecords(parsed.data, true);
    return userResponse(rows, 200, meta);
  } catch (error) { return masterFailure(error); }
}
