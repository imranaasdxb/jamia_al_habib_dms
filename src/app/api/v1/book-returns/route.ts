import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { listBookReturns, listOpenReturns, markAssignedBookLost, ReturnFailure, returnDatabaseFailure, saveBookReturn } from "@/modules/books/returns.repository";
import { bookLossSubmissionSchema, returnQuerySchema, returnSubmissionSchema } from "@/modules/books/returns.schema";
import { boundedBody, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
function failure(error: unknown) {
  const failure = returnDatabaseFailure(error);
  return NextResponse.json({ data: null, error: { code: failure.code,
    ...(process.env.NODE_ENV === "development" && failure instanceof ReturnFailure && failure.details ? { details: failure.details } : {}) }, meta: {} },
    { status: failure.status, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: NextRequest) {
  try {
    const parsed = returnQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { rows, ...meta } = parsed.data.tab === "OPEN" ? await listOpenReturns(parsed.data) : await listBookReturns(parsed.data);
    return userResponse(rows, 200, meta);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const bytes = await boundedBody(request, 131072);
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AuthFailure("INVALID_INPUT", 400); }
    const loss = bookLossSubmissionSchema.safeParse(payload);
    if (loss.success) return userResponse(await markAssignedBookLost(loss.data));
    const parsed = returnSubmissionSchema.safeParse(payload);
    if (!parsed.success) throw new AuthFailure("RETURN_INVALID", 400);
    return userResponse(await saveBookReturn(parsed.data), 201);
  } catch (error) { return failure(error); }
}
