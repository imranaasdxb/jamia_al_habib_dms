import { bookFailure } from "@/modules/books/books.http";
import { assignmentDefaults } from "@/modules/books/assignments.repository";
import { userResponse } from "@/modules/users/users.http";

export const runtime = "nodejs";
export async function GET() {
  try { return userResponse(await assignmentDefaults()); } catch (error) { return bookFailure(error); }
}
