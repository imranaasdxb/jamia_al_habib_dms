import { userResponse } from "@/modules/users/users.http";
import { reportOptions } from "@/modules/reports/reports.repository";
import { reportFailure } from "@/modules/reports/reports.http";
export const runtime="nodejs";
export async function GET(){try{return userResponse(await reportOptions());}catch(error){return reportFailure(error);}}
