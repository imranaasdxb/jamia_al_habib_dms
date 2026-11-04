import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookExportQuerySchema } from "@/modules/books/book-export.schema";
import { exportBookRecords } from "@/modules/books/book-export.repository";
import { createExcelWorkbook } from "@/lib/export/xlsx";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let stage = "request";
  try {
    const parsed = bookExportQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    stage = "records";
    const sheets = await exportBookRecords(parsed.data);
    const statuses = parsed.data.source === "STOCK" ? parsed.data.stockStatus.toLowerCase()
      : parsed.data.statuses.includes("ALL") ? "all" : parsed.data.statuses.join("-").toLowerCase();
    const filename = `jah-${parsed.data.source.toLowerCase()}-${statuses}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    stage = "workbook";
    const workbook = createExcelWorkbook(sheets);
    return new NextResponse(new Uint8Array(workbook), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof AuthFailure) return NextResponse.json({ data: null, error: { code: error.code }, meta: {} },
      { status: error.status, headers: { "Cache-Control": "no-store" } });
    const cause = error instanceof Error && error.cause ? error.cause : error;
    const details: { stage: string; type: string; sqlState?: string; message?: string; object?: string; position?: number; context?: string } = {
      stage, type: cause instanceof Error ? cause.name : typeof cause,
    };
    if (typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" && /^[0-9A-Z]{5}$/.test(cause.code)) {
      details.sqlState = cause.code;
      if ("position" in cause && typeof cause.position === "string" && /^\d+$/.test(cause.position)) {
        details.position = Number(cause.position);
        if (cause.code === "42601" && typeof error === "object" && error !== null && "query" in error && typeof error.query === "string") {
          const position = details.position - 1;
          details.context = error.query.slice(Math.max(0, position - 80), position + 80)
            .replace(/'[^']*'/g, "'[value]'").replace(/\s+/g, " ");
        }
      }
      // Report SQL diagnostics only, never the wrapper's SQL, bind values or connection settings.
      const message = "message" in cause && typeof cause.message === "string" ? cause.message : "";
      if (/^(?:syntax error|column |relation |function |operator does not exist|could not determine|permission denied for (?:table|schema|function)|missing FROM-clause|invalid reference to FROM-clause|aggregate function|more than |cannot pass |argument of )/i.test(message)) {
        details.message = message.replace(/'[^']*'/g, "'[value]'").slice(0, 300);
      }
      if (cause.code === "57014") details.message = "The export query exceeded the database time limit.";
      const object = /^(?:column|relation|function) "?([a-z_][a-z0-9_.]*)/i.exec(message)?.[1];
      if (object) details.object = object;
    } else if (process.env.NODE_ENV === "development" && cause instanceof TypeError) {
      details.message = cause.message.replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi, "[redacted]").slice(0, 300);
    }
    console.error("[book-export] Export failed", JSON.stringify(details));
    return NextResponse.json({ data: null, error: { code: "BOOK_EXPORT_FAILED", details }, meta: {} },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
