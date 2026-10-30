import { AuthFailure } from "@/modules/auth/auth.types";
import { userResponse } from "@/modules/users/users.http";
import { reportQuerySchema } from "@/modules/reports/reports.schema";
import { readReports } from "@/modules/reports/reports.repository";
import { reportFailure } from "@/modules/reports/reports.http";
export const runtime="nodejs";
export async function GET(request:Request){
 try{const query=reportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)throw new AuthFailure("INVALID_INPUT",400);
  const result=await readReports(query.data);return userResponse(result.data,200,result.meta);
 }catch(error){return reportFailure(error);}
}
