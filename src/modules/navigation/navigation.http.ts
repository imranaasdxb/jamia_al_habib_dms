import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
export function navigationFailure(error:unknown) {
 const failure=error instanceof AuthFailure?error:new AuthFailure("NAVIGATION_UNAVAILABLE",503);
 return NextResponse.json({data:null,error:{code:failure.code},meta:{}},
  {status:failure.status,headers:{"Cache-Control":"no-store","Vary":"Cookie"}});
}
