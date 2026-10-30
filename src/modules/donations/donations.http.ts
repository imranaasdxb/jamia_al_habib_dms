import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
export function donationFailure(error:unknown){
  const failure=error instanceof AuthFailure?error:new AuthFailure("DONATIONS_UNAVAILABLE",503);
  const cause=error instanceof Error?error.cause:undefined;
  const db=[cause,error].find(value=>typeof value==="object"&&value!==null&&"code" in value);
  return NextResponse.json({data:null,error:{code:failure.code,
    ...(process.env.NODE_ENV==="development"&&typeof db==="object"&&db!==null&&"code" in db
      ?{details:{sqlState:String(db.code)}}:{})},meta:{}},
    {status:failure.status,headers:{"Cache-Control":"no-store"}});
}
