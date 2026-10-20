import { collectorId } from "@/modules/people/people.http";
import { collectorPhoto } from "@/modules/people/people.repository";
import { userFailure } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const id = collectorId((await context.params).id);
    const proposal = request.nextUrl.searchParams.get("request");
    return new Response(await collectorPhoto(id, proposal ? collectorId(proposal) : null), { headers: {
      "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60", Vary: "Cookie",
      "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename=collector.jpg",
      "Content-Security-Policy": "default-src 'none'",
    } });
  } catch (error) { return userFailure(error); }
}
