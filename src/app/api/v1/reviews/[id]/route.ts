import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { userResponse } from "@/modules/users/users.http";
import { reviewKindSchema } from "@/modules/reviews/reviews.schema";
import { readReview } from "@/modules/reviews/reviews.repository";
import { reviewFailure } from "@/modules/reviews/reviews.http";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  try { const {id}=await context.params;const kind=reviewKindSchema.safeParse(new URL(request.url).searchParams.get("kind"));
    if(!z.uuid().safeParse(id).success || !kind.success)throw new AuthFailure("INVALID_INPUT",400);
    const result=await readReview(id,kind.data);return userResponse(result.data);
  }catch(error){return reviewFailure(error);}
}
