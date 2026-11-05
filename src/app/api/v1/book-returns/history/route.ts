import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import { historicalCollectionQuerySchema } from "@/modules/books/historical-collections.schema";
import { listHistoricalCollections } from "@/modules/books/historical-collections.repository";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const parsed = historicalCollectionQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const result = await listHistoricalCollections(parsed.data);
    return NextResponse.json({ ...result, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ data: null, error: { code: error instanceof AuthFailure ? error.code : "HISTORICAL_COLLECTIONS_UNAVAILABLE" }, meta: {} },
      { status: error instanceof AuthFailure ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
