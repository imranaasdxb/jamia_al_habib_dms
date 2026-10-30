import { AuthFailure } from "@/modules/auth/auth.types";
import { userResponse } from "@/modules/users/users.http";
import { donationQuerySchema } from "@/modules/donations/donations.schema";
import { listDonations } from "@/modules/donations/donations.repository";
import { donationFailure } from "@/modules/donations/donations.http";
export const runtime="nodejs";
export async function GET(request:Request){
  try{
    const input=donationQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if(!input.success)throw new AuthFailure("INVALID_INPUT",400);
    const result=await listDonations(input.data);return userResponse(result.data,200,result.meta);
  }catch(error){return donationFailure(error);}
}
