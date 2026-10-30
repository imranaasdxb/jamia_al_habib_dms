import { userResponse } from "@/modules/users/users.http";
import { donationOptions } from "@/modules/donations/donations.repository";
import { donationFailure } from "@/modules/donations/donations.http";
export const runtime="nodejs";
export async function GET(){
  try{return userResponse(await donationOptions());}catch(error){return donationFailure(error);}
}
