"use client";
import { useCallback } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { assignmentDetailResponseSchema } from "@/modules/books/assignments.schema";
import { formatCurrency } from "@/lib/utils";
import type { AssignmentDetail } from "@/modules/books/assignments.schema";

export function AssignmentSlipView({ accountId, id }: { accountId: string; id: string }) {
  const { t, language } = useLanguage();
  const fetchData = useCallback(async () => assignmentDetailResponseSchema.parse(await booksRequest(`/api/v1/book-assignments/${id}`)).data, [id]);
  const query = usePageQuery(`${accountId}:assignments:detail:${id}`, fetchData);
  return <>{!query.data && (query.loading || query.stale) && <p className={"muted text-[color:var(--muted-foreground)]"} role="status">{t("working")}</p>}
    {query.error != null && <p className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"} role="alert">{t(booksError(query.error))}</p>}
    {query.data && <><div className={"assignment-slip-actions flex justify-end py-[15px]"}><Button variant="outline" onClick={() => window.print()}><Printer size={17} />{t("assignPrint")}</Button></div>
      <AssignmentSlip data={query.data} />
      {createPortal(<div id="assignment-print-root" dir={language === "ur" ? "rtl" : "ltr"} lang={language} className={"hidden print:[body:has(>_&)_>_*:not(#assignment-print-root)]:hidden! print:[body:has(>_&)]:overflow-visible! print:[body:has(>_&)]:h-auto! print:[body:has(>_&)]:pointer-events-auto! print:block! print:[&_.assignment-slip]:p-0 print:[&_.assignment-slip]:text-[color:#111] print:[&_.assignment-slip]:bg-[white] print:[&_.table-container]:overflow-visible print:[&_.assignment-slip_dl]:grid-cols-[1fr_1fr] print:[&_thead]:[display:table-header-group] print:[&_tr]:[break-inside:avoid] print:[&_footer]:[break-inside:avoid] print:[&_.books-table_:is(th,_td)]:text-[color:#111] print:[&_.books-table_:is(th,_td)]:bg-[white] print:[&_.books-table_:is(th,_td)]:[border-bottom:1px_solid_#ddd]"}><AssignmentSlip data={query.data} /></div>, document.body)}</>}
  </>;
}
function AssignmentSlip({ data }: { data: AssignmentDetail }) {
  const { t, language } = useLanguage(); const row = data.assignment;
  return <article className={"assignment-slip text-[length:12px] text-[color:var(--foreground)] bg-[var(--card)] p-[20px] [&_header]:text-center [&_header]:pb-[20px] [&_header]:[border-bottom:2px_solid_var(--primary)] [&_header_h2]:text-[length:24px] [&_header_h2]:text-[color:var(--primary)] [&_header_h2]:m-[0_0_7px] [&_header_h3]:m-[0_0_10px] [&_header_h3]:text-[length:16px] [&_dl]:grid [&_dl]:grid-cols-[1fr_1fr] [&_dl]:gap-[12px_24px] [&_dl]:py-[20px] [&_dl]:m-0 [&_dl_>_div]:grid [&_dl_>_div]:gap-[5px] [&_dl_>_div]:min-w-0 [&_dt]:text-[color:var(--muted-foreground)] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_.books-table]:w-full [&_.books-table]:[table-layout:fixed] [&_.books-table_:is(th,_td)]:p-[10px_8px] [&_.books-table_:is(th,_td)]:text-start [&_.books-table_:is(th,_td)]:text-[length:11px] [&_.books-table_:is(th,_td)]:[overflow-wrap:anywhere] [&_footer]:grid [&_footer]:grid-cols-[1fr_1fr] [&_footer]:gap-[50px] [&_footer]:mt-[80px] [&_footer_>_div]:[border-top:1px_solid_var(--border)] [&_footer_>_div]:pt-[10px] [&_footer_>_div]:text-center max-[650px]:p-0 max-[650px]:[&_dl]:grid-cols-[1fr]"}><header><h2>Jamia Al Habib</h2><h3>{t("assignSlip")}</h3><strong dir="ltr">{row.number}</strong></header>
    <dl><div><dt>{t("assignDate")}</dt><dd>{row.assignmentDate}</dd></div><div><dt>{t("assignReturnDate")}</dt><dd>{row.expectedReturnDate}</dd></div>
      <div><dt>{t("peopleCollectors")}</dt><dd>{row.collectorName} · <bdi>{row.collectorCode}</bdi></dd></div>
      <div><dt>{t("usersMobile")} / {t("peopleWhatsapp")}</dt><dd dir="ltr">{row.phone} / {row.whatsapp || "—"}</dd></div>
      <div><dt>{t("usersAddress")}</dt><dd>{row.address}</dd></div><div><dt>{t("assignAreas")}</dt><dd>{row.areas.map((area) => language === "ur" ? area.nameUr : area.nameEn).join("، ")}</dd></div>
      <div><dt>{t("assignBy")}</dt><dd>{row.assignedByName}</dd></div></dl>
    <div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end books-table [&_thead_th]:bg-[var(--muted)] [&_thead_th]:font-semibold [&_thead_th]:text-[length:11px] [&_tbody_td]:text-[length:12px] [&_tbody_td]:leading-[1.6]"}><thead><tr><th scope="col">{t("booksNumber")}</th><th scope="col">{t("mastersEditions")}</th>
      <th scope="col">{t("mastersBookTypes")}</th><th scope="col">{t("booksReceiptRange")}</th><th scope="col">{t("booksTotalReceipts")}</th><th scope="col">{t("assignSource")}</th></tr></thead>
      <tbody>{data.books.map((book) => <tr key={book.id}><td>{book.bookNumber}{book.source === "LEFTOVER" && <span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{book.sourceCode}</span>}</td><td>{language === "ur" ? book.editionNameUr : book.editionNameEn}</td>
        <td>{t(book.bookType === "TOKEN" ? "booksToken" : "booksRegular")}{book.tokenValuePaise != null && ` ${formatCurrency(book.tokenValuePaise / 100)}`}</td>
        <td><bdi dir="ltr">{book.assignedFrom ?? book.receiptFrom}–{book.assignedTo ?? book.receiptTo}</bdi></td><td>{(book.assignedTo ?? book.receiptTo) - (book.assignedFrom ?? book.receiptFrom) + 1}</td><td>{t(book.source === "LEFTOVER" ? "leftoversSource" : "assignNewStock")}</td></tr>)}</tbody></table></div>
    <p className={"assignment-slip-total pt-[15px]"}>{t("assignBookCount")}: <strong>{data.books.length}</strong> · {t("booksTotalReceipts")}: <strong>{data.books.reduce((sum, book) => sum + (book.assignedTo ?? book.receiptTo) - (book.assignedFrom ?? book.receiptFrom) + 1, 0)}</strong></p>
    {row.remarks && <p className={"assignment-slip-remarks whitespace-pre-wrap [overflow-wrap:anywhere]"}>{t("usersRemarks")}: {row.remarks}</p>}
    <footer><div>{t("assignFundraiserSignature")}</div><div>{t("assignIssuerSignature")}</div></footer>
  </article>;
}
