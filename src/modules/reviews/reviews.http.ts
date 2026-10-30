import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
export function reviewFailure(error:unknown) {
  let failure = error instanceof AuthFailure ? error : new AuthFailure("REVIEWS_UNAVAILABLE",503);
  const cause = error instanceof Error ? error.cause : undefined;
  let sqlState: string | undefined;
  for (const item of [cause,error]) if (typeof item === "object" && item !== null && "code" in item) {
    sqlState=String(item.code); const message="message" in item ? String(item.message) : "";
    if (sqlState === "40001" || sqlState === "40P01" || sqlState === "23505") failure=new AuthFailure("REVIEW_CHANGED",409);
    if (sqlState === "P0001") failure=new AuthFailure(/Finalize the submission first/i.test(message) ? "REVIEW_FINALIZE_FIRST" : /Resolve receipt issues first/i.test(message) ? "REVIEW_OPEN_ISSUES" : "REVIEW_CHANGED",409);
  }
  return NextResponse.json({data:null,error:{code:failure.code,...(process.env.NODE_ENV === "development" && sqlState ? {details:{sqlState}} : {})},meta:{}},
    {status:failure.status,headers:{"Cache-Control":"no-store"}});
}
