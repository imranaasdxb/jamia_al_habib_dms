import { AuthFailure } from "@/modules/auth/auth.types";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { userJson,userResponse } from "@/modules/users/users.http";
import { reviewActionSchema,reviewQuerySchema } from "@/modules/reviews/reviews.schema";
import { listReviews,reviewAction } from "@/modules/reviews/reviews.repository";
import { reviewFailure } from "@/modules/reviews/reviews.http";
import type { NextRequest } from "next/server";
export const runtime="nodejs";
export async function GET(request:NextRequest) {
  try { const q=reviewQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if(!q.success)throw new AuthFailure("INVALID_INPUT",400);const result=await listReviews(q.data);return userResponse(result.data,200,result.meta);
  }catch(error){return reviewFailure(error);}
}
export async function POST(request:NextRequest) {
  try { requireSameOrigin(request);const input=reviewActionSchema.safeParse(await userJson(request));
    if(!input.success)throw new AuthFailure("INVALID_INPUT",400);return userResponse(await reviewAction(input.data));
  }catch(error){return reviewFailure(error);}
}
