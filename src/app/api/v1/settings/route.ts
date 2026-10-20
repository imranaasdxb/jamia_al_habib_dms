import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { readSettings, saveSettings } from "@/modules/settings/settings.repository";
import { saveSettingsSchema } from "@/modules/settings/settings.schema";
import { userJson } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  return NextResponse.json({ data: null, error: {
    code: error instanceof AuthFailure ? error.code : "SETTINGS_UNAVAILABLE",
  }, meta: {} }, { status: error instanceof AuthFailure ? error.status : 503, headers });
}
function response(data: unknown) { return NextResponse.json({ data, error: null, meta: {} }, { headers }); }

export async function GET() {
  try { return response(await readSettings()); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const parsed = saveSettingsSchema.safeParse(await userJson(request));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    return response(await saveSettings(parsed.data));
  } catch (error) { return failure(error); }
}
