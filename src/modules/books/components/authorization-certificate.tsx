"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, Circle, Printer, RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { indiaToday } from "@/modules/books/assignments.schema";
import { certificateResponseSchema } from "@/modules/books/certificates.schema";
import type { AuthorizationCertificate, CertificateScope } from "@/modules/books/certificates.schema";
import type { ReactNode } from "react";

const terms = [
  ["Donations shall be collected only through official receipts.", "چندہ صرف ادارہ کی جاری کردہ رسید کے ذریعے وصول کیا جائے گا۔"],
  ["This authorization is personal and non-transferable.", "یہ سند شخصی، عارضی اور ناقابل انتقال ہے۔"],
  ["All collected funds and receipts are held in trust for the Institution.", "تمام وصول شدہ رقوم اور رسیدات ادارہ کی امانت ہیں۔"],
  ["Unauthorized use is prohibited.", "ادارہ کے نام، مہر یا رسید کا غیر مجاز استعمال ممنوع ہے۔"],
  ["Authorization may be revoked for misconduct.", "بے ضابطگی یا خیانت کی صورت میں سند فوراً منسوخ کی جا سکتی ہے۔"],
  ["Bearer shall comply with By-laws and applicable laws of India.", "حامل سند ادارہ کے بائی لاز اور قابل اطلاق قوانین ہند کا پابند ہوگا۔"],
  ["This certificate remains the property of the Institution.", "یہ سند ادارہ کی ملکیت ہے اور کسی بھی وقت واپس لی جا سکتی ہے۔"],
] as const;

export function AuthorizationCertificateView({ accountId, assignmentId, scope = "ASSIGNMENT", fundraiserId }: {
  accountId: string; assignmentId: string; scope?: CertificateScope; fundraiserId?: string;
}) {
  const { t } = useLanguage(); const cache = usePageDataCache();
  const printArea = useRef<HTMLDivElement>(null);
  const printDocument = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const fitPrint = useCallback(() => {
    const area = printArea.current; const content = printDocument.current;
    if (!area || !content || !content.scrollHeight) return;
    const scale = Math.min(1, (area.clientHeight - 2) / content.scrollHeight, (area.clientWidth - 2) / content.scrollWidth);
    content.style.transform = `scale(${scale})`;
  }, []);
  useEffect(() => {
    window.addEventListener("beforeprint", fitPrint);
    return () => window.removeEventListener("beforeprint", fitPrint);
  }, [fitPrint]);
  async function printCertificate() {
    if (printing) return;
    setPrinting(true);
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(printDocument.current?.querySelectorAll("img") ?? []).map((image) => image.decode().catch(() => undefined)));
      fitPrint();
      window.print();
    } finally { setPrinting(false); }
  }
  const key = scope === "FUNDRAISER" ? `${accountId}:assignments:fundraiser-certificate:${fundraiserId ?? assignmentId}:v3`
    : `${accountId}:assignments:detail:${assignmentId}:certificate:assignment-v3`;
  const load = useCallback(async () => certificateResponseSchema.parse(await booksRequest(
    `/api/v1/book-assignments/${assignmentId}/certificate?scope=${scope}`,
  )).data, [assignmentId, scope]);
  const query = usePageQuery(key, load);
  const pending = !query.data || query.stale;
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
      <div className="flex gap-2">
        <Button variant="outline" size="icon" aria-label={t("usersRefresh")} loading={query.loading} onClick={() => cache.invalidate(key)}><RefreshCw size={16} /></Button>
        <Button variant="outline" size="small" loading={printing} disabled={pending || query.error != null} onClick={() => { void printCertificate(); }}><Printer size={16} />{t("assignPrint")}</Button>
      </div>
    </div>
    {query.error != null && <p role="alert" className="mb-3 rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{t(booksError(query.error))}</p>}
    {pending && query.error == null && <div className="space-y-5 rounded-2xl border border-border p-8" role="status" aria-label={t("working")}>
      <div className="mx-auto h-10 w-2/3 animate-pulse rounded-lg bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>}
    {!pending && query.data && query.error == null && <>
      {query.data.historical && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{t("certificateHistorical")}</p>}
      <Certificate data={query.data} />
      {createPortal(<div id="authorization-certificate-print-root" aria-hidden="true" className="pointer-events-none invisible fixed -left-[10000px] top-0 box-border h-[297mm] w-[210mm] overflow-hidden bg-white p-[10mm] print:visible print:static print:m-0 print:break-inside-avoid print:rounded-none print:[body:has(>_&)_>_*:not(#authorization-certificate-print-root)]:hidden! print:[body:has(>_&)]:overflow-visible! print:[body:has(>_&)]:h-auto! print:[body:has(>_&)]:pointer-events-auto!">
        {/* Page size and printer margins require @page; certificate styling stays in Tailwind. */}
        <style>{`@media print {
          @page { size: A4 portrait; margin: 0; }
          body:has(> #authorization-certificate-print-root),
          html:has(#authorization-certificate-print-root) {
            margin: 0 !important; padding: 0 !important; min-width: 0 !important;
            min-height: 0 !important; height: auto !important;
            width: 210mm !important; background: white !important;
          }
        }`}</style>
        <div ref={printArea} className="relative h-full w-full overflow-hidden">
          <div ref={printDocument} className="absolute inset-x-0 top-0 origin-top"><Certificate data={query.data} /></div>
        </div>
      </div>, document.body)}
    </>}
  </div>;
}

function Detail({ en, ur, children }: { en: string; ur: string; children: ReactNode }) {
  return <div className="min-w-0 rounded-[14px] bg-[#f2efe3] px-3 py-2">
    <dt className="flex items-center justify-between gap-2 text-[7px] tracking-[0.12em] text-[#657169]"><span>{en}</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[8px] leading-[2] tracking-normal">{ur}</span></dt>
    <dd className="mx-auto mt-1 w-fit min-w-[50%] max-w-full border-b border-[#cbbd8c] px-1 text-center text-[12px] font-medium leading-snug break-words [overflow-wrap:anywhere]">{children}</dd>
  </div>;
}

function editionSummaries(books: AuthorizationCertificate["books"]) {
  const groups = new Map<string, [number, number][]>();
  for (const book of books) {
    const token = book.number.match(/-T-(\d+)-/)?.[1];
    const label = `${book.editionName}${token ? ` · ₹${token}` : ""}`;
    groups.set(label, [...(groups.get(label) ?? []), [book.receiptFrom, book.receiptTo]]);
  }
  return [...groups].map(([label, ranges]) => {
    const merged: [number, number][] = [];
    for (const [from, to] of ranges.sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
      else merged.push([from, to]);
    }
    return { label, ranges: merged.map(([from, to]) => `${from}–${to}`).join(" · ") };
  });
}

function Certificate({ data }: { data: AuthorizationCertificate }) {
  const today = indiaToday();
  const status = data.status === "ACTIVE" && today > data.expiresOn ? "EXPIRED" : data.status;
  const states = {
    ACTIVE: ["Active", "مؤثر"], EXPIRED: ["Expired", "میعاد ختم"], CLOSED: ["Closed", "بند"],
    REVOKED: ["Revoked", "منسوخ"], NOT_STARTED: ["Not yet valid", "ابھی مؤثر نہیں"],
  } as const;
  const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const variedValidity = data.scope === "FUNDRAISER" && data.books.some((book) => book.validFrom !== data.validFrom || book.validUntil !== data.validUntil);
  return <article dir="ltr" lang="en" className="relative isolate mx-auto w-full max-w-[760px] overflow-hidden border-t border-[#b49a61] bg-white font-sans text-[#173e30] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
    <div aria-hidden="true" className="pointer-events-none absolute top-[53%] left-1/2 -z-10 w-[87%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.045] mix-blend-multiply">
      <img src="/images/authorization-certificate-logo.png" alt="" width={1600} height={1600} loading="eager" className="h-auto w-full object-contain" />
    </div>
    <header className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-3 bg-[#193f30] px-5 py-1 text-white">
      <div className="min-w-0"><p className="text-[7px] tracking-[0.16em] text-[#d6c58e]">CERTIFICATE NO. · <span lang="ur" dir="rtl" className="tracking-normal">سند نمبر</span></p><strong className="block text-[11px] font-semibold tracking-[0.05em]">{data.number}</strong></div>
      <p lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[15px] leading-[2] text-[#d6c58e]">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</p>
      <span className={`flex w-fit items-center justify-self-end gap-1.5 rounded-full px-3 py-1 text-[9px] ${status === "ACTIVE" ? "bg-[#edf6ee] text-[#246245]" : "bg-[#fff0ee] text-[#9e2424]"}`}><Circle size={6} fill="currentColor" aria-hidden="true" />{states[status][0]} <span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[7px]">{states[status][1]}</span></span>
    </header>
    <div className="px-8 pb-3">
      <div className="mx-auto pt-2"><div className="aspect-[4/1] w-full overflow-hidden"><img src="/images/certificate-brand-header.png" alt="Jamia Al-Habib · A Beautiful Blend of Religious and Contemporary Education & Training" width={2132} height={738} loading="eager" className="h-full w-full object-cover object-center" /></div></div>
      <section className="text-center">
        <h2 lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[29px] leading-[1.7] tracking-[0.12em] text-[#173c63]">سندِ اجازت</h2>
        <h3 className="font-serif text-[16px] tracking-[0.075em] text-[#9b8148]">CERTIFICATE OF AUTHORIZATION</h3>
        <p className="mt-1 font-serif text-[15px] italic text-[#96998c]">This is to certify that</p>
        <div className="mx-auto mt-1 w-[60%] border-b border-[#c6b17a] pb-0.5"><strong className="block break-words font-serif text-[38px] font-normal leading-tight">{data.collectorName}</strong></div>
        <p lang="ur" dir="rtl" className="mt-1 font-[family-name:var(--font-urdu)] text-[12px] leading-[2] text-black">جامعہ الحبیب کی جانب سے چندہ جمع کرنے کا مجاز نمائندہ ہے۔</p>
        <p className="text-[11px] leading-snug">is an authorized fundraising representative of <strong className="font-semibold">Jamia Al Habib.</strong></p>
      </section>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <Detail en="FUNDRAISER ID NO." ur="شناختی نمبر">{data.collectorCode}</Detail>
        <Detail en="MOBILE NUMBER" ur="موبائل نمبر">{data.phone || "—"}</Detail>
        <Detail en="PARENTAGE (S/O, D/O, C/O)" ur="ولدیت">{data.fatherName || "—"}</Detail>
        <Detail en="ADDRESS" ur="پتہ">{data.address || "—"}</Detail>
      </dl>
      <section className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[#cbbb92] bg-[#fbf9f1]/80 px-5 py-3 text-[11px]">
        <span className="flex items-center gap-2"><CalendarDays size={15} className="text-[#9b8148]" aria-hidden="true" /><strong className="font-medium">Validity</strong><span lang="ur" dir="rtl" className="ms-2 font-[family-name:var(--font-urdu)] text-[9px]">مدت اعتبار</span></span>
        {variedValidity ? <span className="text-end text-[9px] font-medium">Individual book dates apply · ہر کتاب کی الگ مدت<br /><span className="text-[8px] font-normal">See the book list below / تفصیل نیچے درج ہے</span></span>
          : <span className="flex items-center gap-4 whitespace-nowrap font-semibold tabular-nums"><time dateTime={data.validFrom}>{date(data.validFrom)}</time><ArrowRight size={24} strokeWidth={1} className="text-[#b69a57]" aria-hidden="true" /><time dateTime={data.validUntil}>{date(data.validUntil)}</time></span>}
      </section>
      <section className="mt-2 px-2">
        <h4 className="mb-1 flex items-center justify-between px-1 text-[8px] font-semibold tracking-[0.18em] text-[#9b7638]"><span>TERMS &amp; CONDITIONS</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] tracking-normal">شرائط و ضوابط</span></h4>
        <table className="w-full border-collapse border border-[#ccb779] text-black [&_td]:border-b [&_td]:border-[#d6c594] [&_td]:px-1.5 [&_td]:py-[2px] [&_td]:align-middle"><tbody>{terms.map(([en, ur], i) => <tr key={en}>
          <td className="w-5 text-center text-[7px] text-[#9b7638]">{i + 1}.</td><td className="w-[49%] text-[8px] leading-[1.35]">{en}</td><td lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[8px] leading-[1.9]">{ur}</td>
        </tr>)}</tbody></table>
      </section>
      <div className="mt-3 grid grid-cols-2 gap-7 px-2">
        <section className="min-w-0">
          <div className="rounded-[15px] bg-[#f2efe3] px-4 py-2.5"><h4 className="mb-1 flex items-center justify-between gap-2 text-[7px] tracking-[0.12em] text-[#657169]"><span>RECEIPT BOOK NO. · {data.books.length}</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[8px] tracking-normal">رسیدی بک نمبر</span></h4>
            <ul>{data.books.map((book) => { const bookStatus = book.status === "ACTIVE" && today > book.validUntil ? "EXPIRED" : book.status; return <li key={book.id} className="border-b border-[#cbbd8c] py-0.5 text-[10px] leading-snug break-words"><strong className="font-medium">{book.number}</strong>{data.scope === "FUNDRAISER" && <span className="mt-0.5 block text-[7px] leading-relaxed text-[#657169]">{book.assignmentNumber} · {date(book.validFrom)} — {date(book.validUntil)}</span>}{bookStatus !== "ACTIVE" && (bookStatus !== status || book.validUntil !== data.validUntil) && <span className="ms-1 text-[8px] text-[#9e2424]">{states[bookStatus][0]}{data.scope === "ASSIGNMENT" && ` · ${date(book.validUntil)}`}</span>}</li>; })}</ul>
          </div>
          <img src="/images/certificate-official-stamp.jpeg" alt="Official Jamia Al-Habib stamp" width={420} height={417} loading="eager" className="mt-3 ms-1 size-[96px] object-contain mix-blend-multiply" />
        </section>
        <section className="flex min-w-0 flex-col">
          <div className="rounded-[15px] bg-[#f2efe3] px-4 py-2 text-center"><h4 className="mb-1 flex items-center justify-between gap-2 text-[7px] tracking-[0.12em] text-[#657169]"><span>EDITION · RANGE</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[8px] tracking-normal">ایڈیشن اور حد</span></h4>
            <ul className="space-y-1">{editionSummaries(data.books).map((group) => <li key={group.label} className="text-[10px] font-medium leading-snug"><span className="block">{group.label}</span><span className="mx-auto block w-fit max-w-full border-b border-[#cbbd8c] px-1 text-[9px] tabular-nums break-words">{group.ranges}</span></li>)}</ul>
          </div>
          <div className="mt-auto pt-3 text-center"><img src="/images/certificate-authorized-signature.jpeg" alt="Authorized signatory signature" width={1289} height={813} loading="eager" className="mx-auto h-[86px] w-[176px] object-contain mix-blend-multiply" />
            <div className="flex items-center justify-between gap-2 border-t border-[#40594d] pt-1 text-[9px]"><span>Authorized Signatory</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[7px] leading-[2]">مجاز دستخط کنندہ</span></div>
            <p className="mt-2 text-[10px] font-medium">Maulana Riyazat Husain Azhari</p><p className="border-b border-[#aab2a8] pb-1 text-[7px]">Chief Executive Officer &amp; Chief Functionary</p>
          </div>
        </section>
      </div>
      <footer className="mt-3 border-t border-[#c2aa70] pt-2">
        {data.historical && <p className="mb-1 text-center text-[7px] text-[#889186]">Reconstructed from historical records · Validity uses the recorded assignment date.</p>}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[7px] tracking-[0.07em]"><span className="break-words">{data.assignmentNumber}</span><p className="text-center text-[9px] leading-snug tracking-[0.13em] text-[#7c8c7e]">RASULPUR, JAGATSINGHPUR, ODISHA, INDIA<br />CONTACT / WHATSAPP: +91 97777 88 666</p><span className="text-end break-words">{data.number}</span></div>
      </footer>
    </div>
  </article>;
}
