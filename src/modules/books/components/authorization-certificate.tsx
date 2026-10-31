"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  ["Donations shall be collected only through official serial-numbered receipts.", "چندہ صرف ادارہ کی مجاز اور نمبر وار رسید کے ذریعے وصول کیا جائے گا۔"],
  ["This authorization is personal, temporary, and non-transferable.", "یہ سند شخصی، عارضی اور ناقابلِ انتقال ہے۔"],
  ["All collected funds and receipts are held in trust for the Institution and must be\nsubmitted within the prescribed period.", "وصول شدہ رقوم اور رسیدات ادارہ کی امانت ہیں اور مقررہ مدت میں جمع کرانا لازم ہوگا۔"],
  ["Unauthorized use of the Institution's name, seal, receipts, or this certificate is\nprohibited.", "ادارہ کے نام، مہر، رسید یا اس سند کا غیر مجاز استعمال ممنوع ہے۔"],
  ["Any financial irregularity, misrepresentation, or breach of trust may result in\nimmediate cancellation and legal action.", "مالی بے ضابطگی، غلط بیانی یا خیانتِ امانت کی صورت میں یہ سند فوری طور پر منسوخ کی جا سکتی ہے\n اور قانونی کارروائی کی جا سکتی ہے۔"],
  ["The bearer shall comply with the Institution's By-Laws and applicable laws of India.", "حاملِ سند ادارہ کے بائی لاز اور قابلِ اطلاق قوانینِ ہند کا پابند ہوگا۔"],
  ["Donors may verify this authorization directly with the Institution.", " عطیہ دہندگان اس سند کی تصدیق دفترِ ادارہ سے کر سکتے ہیں۔"],
] as const;

const importantNote = {
  en: "This certificate remains the property of the Institution and may be suspended, revoked, or recalled at any time by the Institution.",
  ur: "یہ سند ادارہ کی ملکیت ہے۔ ادارہ کسی بھی وقت اس سند کو منسوخ،\nمعطل یا واپس لینے کا حق محفوظ رکھتا ہے۔"
} as const;

function OrnamentalFrame({ horizontal = false, bandHeight = 44, className }: { horizontal?: boolean; bandHeight?: number; className: string }) {
  const patternId = `certificate-engraved-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" className={`pointer-events-none select-none ${className}`}>
    <defs><pattern id={patternId} width={horizontal ? 96 : 24} height={horizontal ? bandHeight : 96} patternUnits="userSpaceOnUse">
      <g transform={horizontal ? `translate(0 ${bandHeight}) scale(1 ${bandHeight / 24}) rotate(-90)` : undefined} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" width="18" height="96" fill="#f2efe3" fillOpacity="0.35" />
        <path d="M1.5 0V96M3 0V96M21 0V96M22.5 0V96" fill="none" stroke="#203a62" strokeWidth="0.45" opacity="0.8" />
        <path d="M5 -12L19 0L5 12L19 24L5 36L19 48L5 60L19 72L5 84L19 96L5 108" fill="none" stroke="#203a62" strokeWidth="0.7" />
        <path d="M19 -12L5 0L19 12L5 24L19 36L5 48L19 60L5 72L19 84L5 96L19 108" fill="none" stroke="#21852b" strokeWidth="0.7" />
        <path d="M12 -24C0 -18 0 -6 12 0S24 18 12 24S0 42 12 48S24 66 12 72S0 90 12 96S24 114 12 120" fill="none" stroke="#203a62" strokeWidth="0.45" opacity="0.8" />
        <path d="M12 -24C24 -18 24 -6 12 0S0 18 12 24S24 42 12 48S0 66 12 72S24 90 12 96S0 114 12 120" fill="none" stroke="#21852b" strokeWidth="0.45" opacity="0.8" />
        {[0, 24, 48, 72, 96].map(y => <path key={y} d={`M12 ${y - 4}L15 ${y}L12 ${y + 4}L9 ${y}Z`} fill="none" stroke="#203a62" strokeWidth="0.45" />)}
      </g>
    </pattern></defs>
    <rect width="100%" height="100%" fill={`url(#${patternId})`} />
  </svg>;
}

export function AuthorizationCertificateView({ accountId, assignmentId, scope = "ASSIGNMENT", fundraiserId }: {
  accountId: string; assignmentId: string; scope?: CertificateScope; fundraiserId?: string;
}) {
  const { t } = useLanguage(); const cache = usePageDataCache();
  const printArea = useRef<HTMLDivElement>(null);
  const printDocument = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const fitPrint = useCallback(() => {
    const area = printArea.current; const content = printDocument.current;
    const certificate = content?.querySelector("article");
    if (!area || !content || !certificate) return;
    const width = area.clientWidth - 2; const height = area.clientHeight - 2;
    if (width <= 0 || height <= 0) return;
    content.style.transform = "none";
    content.style.width = `${width}px`;
    certificate.style.minHeight = "0";
    let scale = 1;
    // Reflow wide content before scaling so long book lists do not produce a
    // narrow certificate centered inside the A4 page.
    for (let pass = 0; pass < 6; pass += 1) {
      if (content.scrollHeight * scale <= height) break;
      scale = Math.min(scale, height / content.scrollHeight);
      content.style.width = `${width / scale}px`;
    }
    certificate.style.minHeight = `${height / scale}px`;
    content.style.transformOrigin = "top left";
    content.style.transform = `scale(${scale})`;
  }, []);
  useEffect(() => {
    window.addEventListener("beforeprint", fitPrint);
    return () => window.removeEventListener("beforeprint", fitPrint);
  }, [fitPrint]);
  async function printCertificate() {
    if (printing || !query.data) return;
    const previousTitle = document.title;
    setPrinting(true);
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(printDocument.current?.querySelectorAll("img") ?? []).map((image) => image.decode().catch(() => undefined)));
      fitPrint();
      document.title = `${query.data.collectorName.trim() || query.data.number} - Certificate`;
      window.print();
    } finally {
      document.title = previousTitle;
      setPrinting(false);
    }
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
      {createPortal(<div id="authorization-certificate-print-root" aria-hidden="true" className="pointer-events-none invisible fixed -left-[10000px] top-0 box-border h-[296mm] w-[210mm] overflow-hidden bg-white p-[8mm] print:visible print:static print:m-0 print:break-inside-avoid print:rounded-none">
        {/* Page size and printer margins require @page; certificate styling stays in Tailwind. */}
        <style>{`@media print {
          @page { size: A4 portrait; margin: 0; }
          body:has(> #authorization-certificate-print-root),
          html:has(#authorization-certificate-print-root) {
            margin: 0 !important; padding: 0 !important; min-width: 0 !important;
            min-height: 0 !important; height: auto !important;
            width: 210mm !important; background: white !important;
          }
          body:has(> #authorization-certificate-print-root) > :not(#authorization-certificate-print-root) {
            display: none !important;
          }
          #authorization-certificate-print-root {
            position: relative !important; inset: auto !important;
            visibility: visible !important; pointer-events: auto !important;
            margin: 0 !important; width: 210mm !important; height: 296mm !important;
            padding: 8mm !important; box-sizing: border-box !important;
            overflow: hidden !important; break-inside: avoid !important;
          }
        }`}</style>
        <div ref={printArea} className="relative h-full w-full overflow-hidden">
          <div ref={printDocument} className="absolute left-0 top-0 w-full origin-top-left"><Certificate data={query.data} printLayout /></div>
        </div>
      </div>, document.body)}
    </>}
  </div>;
}

function Detail({ en, ur, children, className = "" }: { en: string; ur: string; children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-lg border border-[#cbbd8c]/45 bg-[#f2efe3]/75 px-2.5 py-1.5 ${className}`}>
    <dt className="flex items-center justify-between gap-2 text-[7px] tracking-[0.12em] text-[#657169]"><span>{en}</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[8px] leading-[2] tracking-normal">{ur}</span></dt>
    <dd className="mt-0.5 text-center text-[11px] font-medium leading-[1.3] break-words [overflow-wrap:anywhere]">{children}</dd>
  </div>;
}

function Certificate({ data, printLayout = false }: { data: AuthorizationCertificate; printLayout?: boolean }) {
  const today = indiaToday();
  const status = data.status === "ACTIVE" && today > data.expiresOn ? "EXPIRED" : data.status;
  const states = {
    ACTIVE: ["Active", "مؤثر"], EXPIRED: ["Expired", "میعاد ختم"], CLOSED: ["Closed", "بند"],
    REVOKED: ["Revoked", "منسوخ"], NOT_STARTED: ["Not yet valid", "ابھی مؤثر نہیں"],
  } as const;
  const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const variedValidity = data.scope === "FUNDRAISER" && data.books.some((book) => book.validFrom !== data.validFrom || book.validUntil !== data.validUntil);
  return <article dir="ltr" lang="en" className={`relative isolate mx-auto w-full overflow-hidden border-t border-[#b49a61] bg-white font-sans text-[#173e30] [print-color-adjust:exact] [-webkit-print-color-adjust:exact] ${printLayout ? "flex max-w-none flex-col" : "max-w-[760px]"}`}>
    <OrnamentalFrame className="absolute bottom-0 left-0 top-11 h-[calc(100%_-_44px)] w-6" />
    <OrnamentalFrame className="absolute bottom-0 right-0 top-11 h-[calc(100%_-_44px)] w-6 -scale-x-100" />
    <div aria-hidden="true" className="pointer-events-none absolute top-[53%] left-1/2 -z-10 w-[87%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.045] mix-blend-multiply">
      <img src="/images/authorization-certificate-logo.png" alt="" width={1600} height={1600} loading="eager" className="h-auto w-full object-contain" />
    </div>
    <header className="relative isolate grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-3 overflow-hidden bg-[#193f30] px-5 py-1 text-white">
      <OrnamentalFrame horizontal className="absolute inset-0 -z-10 h-full w-full opacity-45" />
      <div className="min-w-0"><p className="text-[7px] tracking-[0.16em] text-[#d6c58e]">CERTIFICATE NO. · <span lang="ur" dir="rtl" className="tracking-normal">سند نمبر</span></p><strong className="block text-[11px] font-semibold tracking-[0.05em]">{data.number}</strong></div>
      <div className="relative h-[34px] w-[140px] overflow-hidden mix-blend-screen">
        <img src="/images/certificate-bismillah.png" alt="بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ" width={1080} height={1920} loading="eager"
          className="absolute left-1/2 top-1/2 h-auto w-[140px] max-w-none -translate-x-1/2 -translate-y-1/2 [filter:invert(1)_sepia(1)_saturate(1.5)_brightness(0.85)]" />
      </div>
      <span className={`flex w-fit items-center justify-self-end gap-1.5 rounded-full px-3 py-1 text-[9px] ${status === "ACTIVE" ? "bg-[#edf6ee] text-[#246245]" : "bg-[#fff0ee] text-[#9e2424]"}`}><Circle size={6} fill="currentColor" aria-hidden="true" />{states[status][0]} <span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[7px]">{states[status][1]}</span></span>
    </header>
    <div className={`px-8 pb-2 ${printLayout ? "flex flex-1 flex-col" : ""}`}>
      <div className="mx-auto grid grid-cols-[minmax(0,1fr)_176px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-[#cbbd8c] pb-3 pt-3">
        <div lang="en" dir="ltr" className="min-w-0 text-center text-[#173c63]">
          <p className="whitespace-nowrap text-[24px] font-extrabold leading-[1.1] tracking-[-0.04em]">JAMIA AL HABIB</p>
          <p className="mt-1 text-[8px] font-medium leading-[1.4] tracking-[0.04em]">RASULPUR, JAGATSINGHPUR, ODISHA, INDIA</p>
        </div>
        <div className="mx-auto h-[140px] w-[122px] overflow-hidden"><img src="/images/authorization-certificate-logo.png" alt="Jamia Al Habib logo" width={1600} height={1600} loading="eager" className="h-full w-full scale-[1.33] object-cover object-center" /></div>
        <div className="relative aspect-[17/10] w-full min-w-0 max-w-[190px] justify-self-end overflow-hidden">
          <img src="/images/certificate-urdu-heading.png" alt="یادگار تاج الشریعہ علیہ الرحمہ — جامعۃ الحبیب — رسول پور، جگت سنگھ پور، اڈیشا، انڈیا"
            width={2000} height={1412} loading="eager"
            className="absolute left-1/2 top-1/2 h-auto w-[220%] max-w-none -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="col-span-3 mt-1 text-center text-[10px] leading-[1.5] text-[#173c63]">A Beautiful Blend of Religious and Contemporary Education &amp; Training.</p>
      </div>
      <section className="text-center">
        <h2 lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[29px] leading-[1.7] tracking-[0.12em] text-[#173c63]">سندِ اجازت</h2>
        <h3 className="font-serif text-[16px] tracking-[0.075em] text-[#9b8148]">CERTIFICATE OF AUTHORIZATION</h3>
        <div className="mx-auto mt-2 w-[60%] border-b border-[#c6b17a] pb-0.5"><strong className="block break-words font-serif text-[38px] font-normal leading-tight">{data.collectorName}</strong></div>
        <p className="mx-auto mt-2 max-w-[600px] text-[10px] leading-[1.5]">
          This is to certify that the above-named person has been authorized by the Institution<br />
          to collect donations and charitable contributions for a limited period.
        </p>
      </section>
      <dl className="mt-2 grid grid-cols-2 gap-1.5">
        <Detail en="FUNDRAISER ID NO." ur="شناختی نمبر">{data.collectorCode}</Detail>
        <Detail en="MOBILE NUMBER" ur="موبائل نمبر">{data.phone || "—"}</Detail>
        <Detail en="PARENTAGE (S/O, D/O, C/O)" ur="ولدیت">{data.fatherName || "—"}</Detail>
        <Detail en="ADDRESS" ur="پتہ">{data.address || "—"}</Detail>
      </dl>
      <section className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[#cbbb92] bg-[#fbf9f1]/80 px-3 py-2 text-[10px]">
        <span className="flex items-center gap-2"><CalendarDays size={15} className="text-[#9b8148]" aria-hidden="true" /><strong className="font-medium">Validity</strong><span lang="ur" dir="rtl" className="ms-2 font-[family-name:var(--font-urdu)] text-[9px]">مدت اعتبار</span></span>
        {variedValidity ? <span className="text-end text-[9px] font-medium">Individual book dates apply · ہر کتاب کی الگ مدت<br /><span className="text-[8px] font-normal">See the book list below / تفصیل نیچے درج ہے</span></span>
          : <span className="flex items-center gap-4 whitespace-nowrap font-semibold tabular-nums"><time dateTime={data.validFrom}>{date(data.validFrom)}</time><ArrowRight size={24} strokeWidth={1} className="text-[#b69a57]" aria-hidden="true" /><time dateTime={data.validUntil}>{date(data.validUntil)}</time></span>}
      </section>
      <section className="mt-2 px-2">
        <h4 className="mb-1 flex items-center justify-between px-1 text-[8px] font-semibold text-[#9b7638]"><span>Terms &amp; Conditions</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)]">شرائط و ضوابط</span></h4>
        <table className="w-full table-fixed border-collapse border border-[#ccb779] text-black [&_td]:border-b [&_td]:border-[#d6c594] [&_td]:px-1.5 [&_td]:py-1 [&_td]:align-top"><colgroup><col className="w-1/2" /><col className="w-1/2" /></colgroup><tbody>{terms.map(([en, ur]) => <tr key={en}>
          <td lang="en" dir="ltr" className="text-left text-[8px] leading-[1.5]"><div className="flex items-start gap-1"><span aria-hidden="true" className="shrink-0 text-[#9b7638]">.</span><span className="min-w-0 whitespace-pre-line">{en}</span></div></td>
          <td lang="ur" dir="rtl" className="text-right font-[family-name:var(--font-urdu)] text-[8px] leading-[2.2]"><div className="flex items-start gap-1"><span aria-hidden="true" className="shrink-0 text-[#9b7638]">•</span><span className="min-w-0 whitespace-pre-line">{ur}</span></div></td>
        </tr>)}</tbody></table>
        <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-[#ccb779] bg-[#fbf9f1]/80 px-2 py-2 text-black">
          <div lang="en" dir="ltr" className="text-left"><h5 className="mb-1 text-[8px] font-semibold tracking-[0.12em] text-[#9b7638]">IMPORTANT</h5><p className="whitespace-pre-line text-[8px] leading-[1.5]">{importantNote.en}</p></div>
          <div lang="ur" dir="rtl" className="text-right font-[family-name:var(--font-urdu)]"><h5 className="mb-1 text-[8px] font-semibold leading-[2] text-[#9b7638]">اہم نوٹ</h5><p className="whitespace-pre-line text-[8px] leading-[2.2]">{importantNote.ur}</p></div>
          
        </div>
      </section>
      <section className="mt-2 rounded-lg border border-[#cbbd8c]/50 bg-[#f2efe3]/75 px-3 py-2">
        <h4 className="mb-1.5 flex items-center justify-between gap-2 text-[7px] tracking-[0.1em] text-[#657169]"><span>RECEIPT BOOK NO. · {data.books.length}</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[8px] leading-[1.8] tracking-normal">رسید بک نمبر</span></h4>
        <ul className="flex flex-wrap gap-x-2 gap-y-1.5">{data.books.map(book => {
          const bookStatus = book.status === "ACTIVE" && today > book.validUntil ? "EXPIRED" : book.status;
          return <li key={book.id} className="min-w-0 max-w-full rounded-md border border-[#cbbd8c]/65 bg-white/75 px-2 py-1 text-[9px] leading-[1.3] break-words">
            <strong className="font-medium">{book.number}</strong>
            {data.scope === "FUNDRAISER" && <span className="mt-0.5 block text-[7px] text-[#657169]">{book.assignmentNumber}</span>}
            {variedValidity && <span className="mt-0.5 block text-[7px] text-[#657169]">{date(book.validFrom)} — {date(book.validUntil)}</span>}
            {bookStatus !== "ACTIVE" && (bookStatus !== status || book.validUntil !== data.validUntil) && <span className="ms-1 text-[7px] text-[#9e2424]">{states[bookStatus][0]}{data.scope === "ASSIGNMENT" && ` · ${date(book.validUntil)}`}</span>}
          </li>;
        })}</ul>
      </section>
      <div className="mt-2 flex items-end justify-between gap-4 px-3">
        <img src="/images/certificate-official-stamp.jpeg" alt="Official Jamia Al-Habib stamp" width={420} height={417} loading="eager" className="size-16 shrink-0 object-contain mix-blend-multiply" />
        <section className="w-[240px] max-w-[65%] text-center">
          <img src="/images/certificate-authorized-signature.jpeg" alt="Authorized signatory signature" width={1289} height={813} loading="eager" className="mx-auto h-12 w-[132px] object-contain mix-blend-multiply" />
          <div className="flex items-center justify-between gap-2 border-t border-[#40594d] pt-0.5 text-[8px]"><span>Authorized Signatory</span><span lang="ur" dir="rtl" className="font-[family-name:var(--font-urdu)] text-[7px] leading-[1.8]">مجاز دستخط کنندہ</span></div>
          <p className="mt-1 text-[9px] font-medium">Maulana Riyazat Husain Azhari</p><p className="border-b border-[#aab2a8] pb-0.5 text-[7px]">Chief Executive Officer &amp; Chief Functionary</p>
        </section>
      </div>
      <footer className={`border-t border-[#c2aa70] pt-2 ${printLayout ? "mt-auto" : "mt-2"}`}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[7px] tracking-[0.07em]"><span className="break-words">{data.assignmentNumber}</span><p className="text-center text-[9px] leading-snug tracking-[0.13em] text-[#7c8c7e]">RASULPUR, JAGATSINGHPUR, ODISHA, INDIA<br />CONTACT / WHATSAPP: +91 97777 88 666</p><span className="text-end break-words">{data.number}</span></div>
      </footer>
    </div>
    <OrnamentalFrame horizontal bandHeight={24} className="block h-6 w-full" />
  </article>;
}
