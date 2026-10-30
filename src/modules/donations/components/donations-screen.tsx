"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowUpRight, Banknote, CreditCard, Eye, Filter, RefreshCw, Search, Wallet, ReceiptText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { displayMoney } from "@/modules/books/returns.schema";
import { receiptRequest } from "@/modules/receipts/receipts.client";
import { RECEIPT_REASON_OPTIONS } from "@/modules/receipts/receipt-options";
import { defaultDonationFilters, donationDetailSchema, donationOptionsSchema, donationPageSchema } from "@/modules/donations/donations.schema";
import type { DonationQuery, DonationRow } from "@/modules/donations/donations.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { ReactNode } from "react";

const selectClass = "h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-xs outline-none transition-colors hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/15";
const inputClass = "min-h-11 rounded-xl text-xs";
function Skeleton({ rows = 6 }: { rows?: number }) {
  return <div role="status" aria-label="Loading" className="animate-pulse space-y-3 p-5">{Array.from({length:rows},(_,i)=><div key={i} className="h-14 rounded-xl bg-muted"/>)}</div>;
}
function Field({label,children,className=""}:{label:string;children:ReactNode;className?:string}) {
  return <label className={`min-w-0 ${className}`}><span className="mb-1.5 block text-[10px] font-medium text-muted-foreground">{label}</span>{children}</label>;
}
function bookName(book:DonationRow["book"]) {
  const edition=book.editionNumber===null?"":`ED-${String(book.editionNumber).padStart(2,"0")}-`;
  const token=book.type==="TOKEN"&&book.tokenValuePaise!==null?`T-${book.tokenValuePaise/100}-`:"";
  const number=book.ordinal===null?book.number.replace(/^BOOK/i,"Book"):`Book${book.ordinal}/${book.receiptFrom}`;
  return `${edition}${token}${number}`;
}
function useCopy() {
  const {t,language}=useLanguage();
  const l=(en:string,ur:string)=>language==="ur"?ur:en;
  const named=(name:{nameEn:string;nameUr:string})=>language==="ur"?(name.nameUr||name.nameEn):name.nameEn;
  const status=(value:string)=>({VALID:l("Valid","درست"),CANCELLED:l("Cancelled","منسوخ"),TORN:l("Torn","پھٹی ہوئی"),LOST:l("Lost","گم شدہ"),BLANK:l("Blank","خالی")}[value]??value);
  const payment=(value:string)=>({CASH:l("Cash","نقد"),DIGITAL:l("Digital","ڈیجیٹل"),CHEQUE:l("Cheque","چیک")}[value]??value);
  return {t,language,l,named,status,payment,money:(paise:number)=>displayMoney(paise,language)};
}
function errorLabel(error:unknown,l:(en:string,ur:string)=>string) {
  const code=error instanceof Error?error.message:"";
  if(code==="ACCESS_DENIED")return l("You do not have access to these records.","آپ کو ان ریکارڈز تک رسائی نہیں۔");
  if(code==="DONATION_NOT_FOUND")return l("This receipt is no longer available. Refresh the ledger.","یہ رسید اب دستیاب نہیں۔ فہرست تازہ کریں۔");
  if(code==="INVALID_INPUT")return l("Check the filters and date range.","فلٹر اور تاریخوں کا وقفہ درست کریں۔");
  return l("Donation records could not be loaded. Refresh to retry.","عطیات کے ریکارڈ لوڈ نہیں ہوئے۔ تازہ کر کے دوبارہ کوشش کریں۔");
}

export function DonationsScreen({account}:{account:Account}) {
  const {t,language,l,named,status,payment,money}=useCopy(); const cache=usePageDataCache();
  const scope=`${account.id}:donations:`;
  const [filters,setFilters]=usePageState<DonationQuery>(`${scope}filters`,defaultDonationFilters);
  const [draft,setDraft]=useState(filters);
  const [expanded,setExpanded]=usePageState(`${scope}expanded`,false);
  const [selected,setSelected]=useState<DonationRow|null>(null);
  const params=new URLSearchParams({...filters,page:String(filters.page)}).toString();
  const key=`${scope}query:${params}`;
  const load=useCallback(async()=>donationPageSchema.parse(await receiptRequest(`/api/v1/donations?${params}`)),[params]);
  const loadOptions=useCallback(async()=>donationOptionsSchema.parse(await receiptRequest("/api/v1/donations/options")).data,[]);
  const query=usePageQuery(key,load,{enabled:!selected});const optionsKey=`${scope}options`;
  const options=usePageQuery(optionsKey,loadOptions);
  const data=query.data;const totals=data?.data.summary;
  const heads=options.data?.categories.find(c=>c.id===draft.categoryId)?.heads??[];
  const advancedCount=[filters.editionId,filters.categoryId,filters.headId,filters.area,
    filters.status==="VALID"?"":filters.status,filters.stage==="ALL"?"":filters.stage,
    filters.checked==="ALL"?"":filters.checked,filters.kind==="ALL"?"":filters.kind,filters.sort==="RECENT"?"":filters.sort].filter(Boolean).length;
  const updating=query.loading||query.stale;
  const apply=()=>{if(draft.from&&draft.to&&draft.from>draft.to)return;setFilters({...draft,page:1});};
  return <AppShell account={account} headerTitle="donations" sampleData={false} search={draft.search} onSearchChange={value=>setDraft({...draft,search:value})}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">{t("donations")}</h1><p className="mt-2 text-sm text-muted-foreground">{l("Every saved receipt, connected to its book, Fundraiser and donation head.","ہر محفوظ رسید اپنی کتاب، چندہ کنندہ اور عطیہ کی مد سے منسلک ہے۔")}</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link href="/reports">{t("reports")}</Link></Button><Button asChild><Link href="/books/returns"><ReceiptText size={16}/>{l("Enter donations","عطیات درج کریں")}</Link></Button></div>
    </div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={updating}>
      {[
        {title:l("Total collected","کل وصولی"),value:totals?.collectedPaise,icon:<Wallet size={18}/>,tone:"border-emerald-700 bg-gradient-to-br from-emerald-800 to-emerald-600 text-white",sub:totals?`${l("Draft","مسودہ")}: ${money(totals.draftPaise)} · ${l("Finalized","مکمل")}: ${money(totals.finalizedPaise)}`:""},
        {title:l("Cash collection","نقد وصولی"),value:totals?.cashPaise,icon:<Banknote size={18}/>,tone:"border-emerald-100 bg-emerald-50/70",sub:l("From valid cash receipts","درست نقد رسیدوں سے")},
        {title:l("Digital collection","ڈیجیٹل وصولی"),value:totals?.digitalPaise,icon:<CreditCard size={18}/>,tone:"border-sky-100 bg-sky-50/70",sub:totals?`${l("Cheque","چیک")}: ${money(totals.chequePaise)}`:""},
      ].map(card=><Card key={card.title} className={`rounded-2xl p-4 ${card.tone}`}><div className="flex items-center justify-between text-xs font-medium"><span>{card.title}</span><span className="flex size-8 items-center justify-center rounded-xl bg-current/5">{card.icon}</span></div>
        {card.value!==undefined?<><p className="mt-3 text-2xl font-bold tabular-nums">{money(card.value)}</p><p className="mt-2 text-[10px] leading-5 opacity-75">{card.sub}</p></>:query.error?<p className="mt-4 text-2xl">—</p>:<div className="mt-4 h-10 animate-pulse rounded-lg bg-current/10"/>}</Card>)}
      <Card className="rounded-2xl p-4"><div className="flex items-center justify-between text-xs font-medium"><span>{l("Saved receipts","محفوظ رسیدیں")}</span><ReceiptText size={18}/></div>
        {totals?<><p className="mt-3 text-2xl font-bold tabular-nums">{totals.receipts.toLocaleString(language==="ur"?"ur-PK":"en-IN")}</p><p className="mt-2 text-[10px] leading-5 text-muted-foreground">{l("Checked","جانچ شدہ")}: {totals.checked}/{totals.valid} · {l("Cancelled","منسوخ")}: {totals.cancelled} · {l("Torn / lost / blank","پھٹی / گم / خالی")}: {totals.damaged}</p></>:query.error?<p className="mt-4 text-2xl">—</p>:<div className="mt-4 h-10 animate-pulse rounded-lg bg-muted"/>}</Card>
    </div>
    <Card className="mb-4 p-4">
      <form onSubmit={e=>{e.preventDefault();apply();}} className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Field label={t("search")} className="col-span-2"><div className="relative"><Search size={16} className="pointer-events-none absolute start-3 top-3.5 text-muted-foreground"/><Input className={`${inputClass} ps-9`} type="search" maxLength={100} placeholder={l("Donor, mobile, book, receipt or Fundraiser…","عطیہ دہندہ، موبائل، کتاب، رسید یا چندہ کنندہ…")} value={draft.search} onChange={e=>setDraft({...draft,search:e.target.value})}/></div></Field>
          <Field label={l("Book type","کتاب کی قسم")}><select className={selectClass} value={draft.bookType} onChange={e=>setDraft({...draft,bookType:e.target.value as DonationQuery["bookType"],editionId:""})}><option value="ALL">{l("All types","تمام اقسام")}</option><option value="REGULAR">{l("Regular","عام")}</option><option value="TOKEN">{l("Token","ٹوکن")}</option></select></Field>
          <Field label={l("Payment","ادائیگی")}><select className={selectClass} value={draft.payment} onChange={e=>setDraft({...draft,payment:e.target.value as DonationQuery["payment"]})}><option value="ALL">{l("All methods","تمام طریقے")}</option>{["CASH","DIGITAL","CHEQUE"].map(value=><option key={value} value={value}>{payment(value)}</option>)}</select></Field>
          {(["from","to"] as const).map(field=><Field key={field} label={field==="from"?l("Receipt date from","رسید کی تاریخ سے"):l("Receipt date to","رسید کی تاریخ تک")}><Input className={inputClass} type="date" value={draft[field]} onChange={e=>setDraft({...draft,[field]:e.target.value})}/></Field>)}
        </div>
        {expanded&&<div id="donation-extra-filters" className="grid grid-cols-2 gap-3 rounded-xl bg-muted/35 p-3 lg:grid-cols-5">
          <Field label={l("Edition","ایڈیشن")}>{!options.data&&options.loading?<div aria-label="Loading editions" className="h-11 animate-pulse rounded-xl bg-muted"/>:<select className={selectClass} disabled={!options.data} value={draft.editionId} onChange={e=>setDraft({...draft,editionId:e.target.value})}><option value="">{l("All editions","تمام ایڈیشن")}</option>{options.data?.editions.filter(row=>draft.bookType==="ALL"||row.bookType===draft.bookType).map(row=><option key={row.id} value={row.id}>{named(row)}{row.bookType==="TOKEN"?` · ₹${(row.tokenValuePaise??0)/100}`:""}</option>)}</select>}</Field>
          <Field label={l("Donation category","عطیہ کی قسم")}><select className={selectClass} disabled={!options.data} value={draft.categoryId} onChange={e=>setDraft({...draft,categoryId:e.target.value,headId:""})}><option value="">{l("All categories","تمام اقسام")}</option>{options.data?.categories.map(row=><option key={row.id} value={row.id}>{named(row)}</option>)}</select></Field>
          <Field label={l("Donation head","عطیہ کی مد")}><select className={selectClass} disabled={!draft.categoryId||!options.data} value={draft.headId} onChange={e=>setDraft({...draft,headId:e.target.value})}><option value="">{l("All heads","تمام مدات")}</option>{heads.map(row=><option key={row.id} value={row.id}>{named(row)}</option>)}</select></Field>
          <Field label={l("Receipt status","رسید کی حالت")}><select className={selectClass} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as DonationQuery["status"]})}><option value="ALL">{l("All receipts","تمام رسیدیں")}</option>{["VALID","CANCELLED","TORN","LOST","BLANK"].map(value=><option key={value} value={value}>{status(value)}</option>)}</select></Field>
          <Field label={l("Submission","جمع آوری")}><select className={selectClass} value={draft.stage} onChange={e=>setDraft({...draft,stage:e.target.value as DonationQuery["stage"]})}><option value="ALL">{l("All stages","تمام حالتیں")}</option><option value="DRAFT">{l("Draft","مسودہ")}</option><option value="FINALIZED">{l("Finalized","مکمل")}</option><option value="FLAGGED">{l("Flagged","مسئلہ نشان زد")}</option></select></Field>
          <Field label={l("Verification","جانچ")}><select className={selectClass} value={draft.checked} onChange={e=>setDraft({...draft,checked:e.target.value as DonationQuery["checked"]})}><option value="ALL">{l("All entries","تمام اندراجات")}</option><option value="CHECKED">{l("Checked","جانچ شدہ")}</option><option value="UNCHECKED">{l("Unchecked","غیر جانچ شدہ")}</option></select></Field>
          <Field label={l("Donor details","عطیہ دہندہ کی تفصیل")}><select className={selectClass} value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as DonationQuery["kind"]})}><option value="ALL">{l("All donors","تمام عطیہ دہندگان")}</option><option value="NAMED">{l("Named","نام درج ہے")}</option><option value="ANONYMOUS">{l("Anonymous","گمنام")}</option><option value="UNRECORDED">{l("Not recorded","درج نہیں")}</option></select></Field>
          <Field label={l("Area / state","علاقہ / ریاست")}><Input className={inputClass} maxLength={120} value={draft.area} onChange={e=>setDraft({...draft,area:e.target.value})} placeholder={l("Filter location…","مقام تلاش کریں…")}/></Field>
          <Field label={l("Sort by","ترتیب")}><select className={selectClass} value={draft.sort} onChange={e=>setDraft({...draft,sort:e.target.value as DonationQuery["sort"]})}><option value="RECENT">{l("Most recent","تازہ ترین")}</option><option value="OLDEST">{l("Oldest first","قدیم ترین پہلے")}</option><option value="HIGHEST">{l("Highest amount","سب سے زیادہ رقم")}</option></select></Field>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><Button type="submit" size="small" loading={query.loading} disabled={!!draft.from&&!!draft.to&&draft.from>draft.to}><Search size={14}/>{l("Search","تلاش کریں")}</Button><Button size="small" variant="outline" aria-expanded={expanded} aria-controls="donation-extra-filters" onClick={()=>setExpanded(value=>!value)}><Filter size={14}/>{l("More filters","مزید فلٹر")}{advancedCount>0&&<span className="rounded-full bg-primary/10 px-1.5 text-primary">{advancedCount}</span>}</Button><Button size="small" variant="ghost" onClick={()=>{setDraft(defaultDonationFilters);setFilters(defaultDonationFilters);}}>{l("Reset","صاف کریں")}</Button></div>
          <div className="flex items-center gap-3"><p className="text-[10px] text-muted-foreground">{l("Enter or Search applies filters","انٹر یا تلاش سے فلٹر لگائیں")}</p><Button size="icon" variant="outline" aria-label={t("usersRefresh")} loading={query.loading||options.loading} onClick={()=>{cache.invalidate(key);cache.invalidate(optionsKey);}}><RefreshCw size={16}/></Button></div>
        </div>
        {draft.from&&draft.to&&draft.from>draft.to&&<p role="alert" className="text-xs text-[var(--danger)]">{l("The end date must be on or after the start date.","آخری تاریخ پہلی تاریخ کے بعد یا برابر ہو۔")}</p>}
      </form>
    </Card>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{data?`${data.meta.total} ${l("receipts","رسیدیں")}`:l("Loading receipts…","رسیدیں لوڈ ہورہی ہیں…")}</span><span>{updating?l("Loading…","لوڈ ہورہا ہے…"):l("Amounts include saved drafts · Cancelled / damaged receipts are excluded from totals","رقم میں محفوظ مسودے شامل ہیں؛ منسوخ یا خراب رسیدیں رقم میں شامل نہیں")}</span></div>
    {(query.error!=null||options.error!=null)&&<p role="alert" className="mb-4 text-sm text-[var(--danger)]">{errorLabel(query.error??options.error,l)}</p>}
    <Card className="overflow-hidden rounded-2xl" aria-busy={updating}>
      {!data&&!query.error?<Skeleton/>:<div className="overflow-x-auto [scrollbar-width:thin]"><table className="w-full min-w-[1250px] table-fixed text-xs">
        <colgroup><col className="w-[110px]"/><col className="w-[175px]"/><col className="w-[140px]"/><col className="w-[190px]"/><col className="w-[175px]"/><col className="w-[85px]"/><col className="w-[115px]"/><col className="w-[170px]"/><col className="w-[65px]"/></colgroup>
        <thead className="bg-muted/60 text-muted-foreground"><tr>{[l("Receipt / date","رسید / تاریخ"),l("Donor","عطیہ دہندہ"),l("Fundraiser","چندہ کنندہ"),l("Book / edition","کتاب / ایڈیشن"),l("Donation head","عطیہ کی مد"),l("Payment","ادائیگی"),l("Amount","رقم"),t("status"),l("View","دیکھیں")].map((label,i)=><th key={label} className={`px-4 py-3 font-medium ${i===6?"text-end":"text-start"}`}>{label}</th>)}</tr></thead>
        <tbody>{data?.data.rows.map(row=><tr key={row.id} className="border-t border-border hover:bg-muted/25">
          <td className="px-4 py-4 align-middle"><strong className="block text-sm">#{row.number}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{row.date}</span></td>
          <td className="px-4 py-4 align-middle"><strong className="block truncate" title={row.name}>{row.kind==="ANONYMOUS"?l("Anonymous","گمنام"):row.name||l("Not recorded","درج نہیں")}</strong>{row.phone&&<p dir="ltr" className="mt-1 text-start text-[10px] text-muted-foreground">{row.phone}</p>}<p className="mt-1 truncate text-[10px] text-muted-foreground" title={[row.area,row.state].filter(Boolean).join(", ")}>{[...new Set([row.area,row.state].filter(Boolean))].join(", ")||"—"}</p></td>
          <td className="px-4 py-4 align-middle"><strong className="block truncate" title={row.fundraiser.name}>{row.fundraiser.name}</strong><p className="mt-1 text-[10px] text-muted-foreground">{row.fundraiser.code}</p></td>
          <td className="px-4 py-4 align-middle"><strong className="block truncate" title={bookName(row.book)}>{bookName(row.book)}</strong><p className="mt-1 truncate text-[10px] text-muted-foreground">{language==="ur"?(row.book.editionUr||row.book.editionEn):row.book.editionEn}</p>{row.historical&&<span className="mt-1 inline-block text-[9px] text-amber-700">{l("Historical summary","تاریخی خلاصہ")}</span>}</td>
          <td className="px-4 py-4 align-middle"><p className="truncate" title={named(row.head)}>{row.headCount>1?l("Multiple heads","متعدد مدات"):named(row.head)||l("Not recorded","درج نہیں")}</p>{named(row.category)&&<p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{named(row.category)}</p>}</td>
          <td className="px-4 py-4 align-middle">{row.status==="VALID"?payment(row.payment):"—"}</td>
          <td className="px-4 py-4 text-end align-middle font-semibold tabular-nums text-primary">{row.status==="VALID"&&row.amountPaise!==null?money(row.amountPaise):"—"}</td>
          <td className="px-4 py-4 align-middle"><div className="flex flex-wrap gap-1"><Badge tone={row.status!=="VALID"?"danger":row.checked?"success":"warning"}>{row.status!=="VALID"?status(row.status):row.checked?l("Checked","جانچ شدہ"):l("Unchecked","غیر جانچ شدہ")}</Badge>{row.flagged&&<Badge tone="danger">{l("Flagged","مسئلہ")}</Badge>}</div><p className="mt-1 text-[10px] text-muted-foreground">{row.finalized?l("Finalized book","مکمل کتاب"):l("Draft submission","مسودہ جمع آوری")}</p></td>
          <td className="px-4 py-4 align-middle"><Button variant="outline" size="icon" aria-label={l(`View receipt ${row.number}`,`رسید ${row.number} دیکھیں`)} onClick={()=>setSelected(row)}><Eye size={15}/></Button></td>
        </tr>)}
        {data&&!data.data.rows.length&&<tr><td colSpan={9} className="p-12 text-center text-muted-foreground">{l("No receipts match these filters. Entries appear here after saving them in Book Submission.","ان فلٹروں میں کوئی رسید نہیں۔ کتاب جمع آوری میں محفوظ رسیدیں یہاں نظر آئیں گی۔")}</td></tr>}
        </tbody></table></div>}
    </Card>
    {data&&<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{l("Page","صفحہ")} {data.meta.page}/{Math.max(1,Math.ceil(data.meta.total/data.meta.pageSize))}</span><div className="flex gap-2"><Button size="small" variant="outline" disabled={updating||data.meta.page<=1} onClick={()=>setFilters({...filters,page:data.meta.page-1})}>{l("Previous","پچھلا")}</Button><Button size="small" variant="outline" disabled={updating||data.meta.page*data.meta.pageSize>=data.meta.total} onClick={()=>setFilters({...filters,page:data.meta.page+1})}>{l("Next","اگلا")}</Button></div></div>}
    {selected&&<DonationDialog key={selected.id} account={account} row={selected} onClose={()=>setSelected(null)}/>}
  </AppShell>;
}

function DonationDialog({account,row,onClose}:{account:Account;row:DonationRow;onClose:()=>void}) {
  const {t,l,named,status,payment,money}=useCopy();const cache=usePageDataCache();
  const key=`${account.id}:donations:detail:${row.id}:${row.version}`;
  const load=useCallback(async()=>donationDetailSchema.parse(await receiptRequest(`/api/v1/donations/${row.id}`)).data,[row.id]);
  const query=usePageQuery(key,load);const data=query.data;
  const name=data?.anonymous?l("Anonymous donor","گمنام عطیہ دہندہ"):data?.donorName||l("Donor not recorded","عطیہ دہندہ درج نہیں");
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}} title={l(`Receipt #${row.number}`,`رسید #${row.number}`)} description={`${bookName(row.book)} · ${row.fundraiser.name}`} className="w-[min(820px,calc(100vw-2rem))]">
    {!data&&!query.error?<Skeleton rows={5}/>:data&&<div className="space-y-4">
      {row.historical&&<p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{l("Historical summary with an assumed receipt number. Missing donor or head details were not invented; review the source records before marking it checked.","یہ تاریخی خلاصہ فرضی رسید نمبر کے ساتھ ہے۔ نامعلوم عطیہ دہندہ یا مدات خود سے نہیں بنائی گئیں۔ جانچ سے پہلے اصل ریکارڈ دیکھیں۔")}</p>}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${data.status==="VALID"?"border-emerald-100 bg-emerald-50/70":"border-red-100 bg-red-50"}`}><div><p className="text-xs text-muted-foreground">{name}</p><p className="mt-2 text-2xl font-bold">{data.status==="VALID"&&data.amountPaise!==null?money(data.amountPaise):status(data.status)}</p>{data.status==="VALID"&&data.amountWords&&<p className="mt-2 text-[10px] text-muted-foreground">{data.amountWords}</p>}</div><div className="flex flex-wrap gap-2"><Badge tone={data.status==="VALID"?"success":"danger"}>{status(data.status)}</Badge><Badge tone={data.checked?"success":"warning"}>{data.checked?l("Checked","جانچ شدہ"):l("Unchecked","غیر جانچ شدہ")}</Badge></div></div>
      <div className="grid gap-3 sm:grid-cols-2"><Card className="p-4"><h3 className="mb-3 text-xs font-semibold">{l("Donor & location","عطیہ دہندہ اور مقام")}</h3><p className="text-sm font-medium">{name}</p>{data.phone&&<p dir="ltr" className="mt-2 text-start text-xs text-muted-foreground">{data.phone}</p>}<p className="mt-2 text-xs leading-5 text-muted-foreground">{data.address||[...new Set([row.area,row.state].filter(Boolean))].join(", ")||l("Address not recorded","پتہ درج نہیں")}</p></Card>
        <Card className="p-4"><h3 className="mb-3 text-xs font-semibold">{l("Book & entry","کتاب اور اندراج")}</h3><p className="text-xs font-medium">{bookName(row.book)}</p><p className="mt-2 text-xs text-muted-foreground">{row.fundraiser.name} · {row.fundraiser.code}</p><p className="mt-2 text-xs text-muted-foreground">{row.date} · {l("Entry by","اندراج کنندہ")}: {data.entryBy||"—"}</p><p className="mt-2 text-xs">{data.finalized?l("Finalized submission","مکمل جمع آوری"):l("Draft submission","مسودہ جمع آوری")}</p></Card></div>
      {data.status==="VALID"?<>
        <Card className="overflow-hidden"><div className="border-b border-border px-4 py-3 text-xs font-semibold">{l("Donation category & head","عطیہ کی قسم اور مد")}</div>{data.heads.length?<div className="divide-y divide-border">{data.heads.map((head,i)=><div key={i} className="flex items-start justify-between gap-3 p-4 text-xs"><div><strong>{named(head)||l("Not recorded","درج نہیں")}</strong><p className="mt-1 text-muted-foreground">{named(head.category)}</p>{head.purpose&&<p className="mt-2 whitespace-pre-wrap text-muted-foreground">{head.purpose}</p>}</div>{head.amountPaise!==null&&<strong className="shrink-0 tabular-nums">{money(head.amountPaise)}</strong>}</div>)}</div>:<p className="p-4 text-xs text-muted-foreground">{l("Donation head not recorded.","عطیہ کی مد درج نہیں۔")}</p>}</Card>
        <Card className="p-4"><h3 className="mb-3 text-xs font-semibold">{l("Payment details","ادائیگی کی تفصیل")}</h3><dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">{l("Method","طریقہ")}</dt><dd className="mt-1 font-medium">{payment(data.payment)}</dd></div>
          {data.payment==="DIGITAL"&&<><div><dt className="text-muted-foreground">{l("UPI app","یو پی آئی ایپ")}</dt><dd className="mt-1">{named(data.upiApp)||"—"}</dd></div><div><dt className="text-muted-foreground">{l("Transaction reference","ٹرانزیکشن حوالہ")}</dt><dd className="mt-1 break-all">{data.reference||"—"}</dd></div><div><dt className="text-muted-foreground">{l("Transaction date","ٹرانزیکشن کی تاریخ")}</dt><dd className="mt-1">{data.transactionDate||"—"}</dd></div></>}
          {data.payment==="CHEQUE"&&<><div><dt className="text-muted-foreground">{l("Cheque number","چیک نمبر")}</dt><dd className="mt-1">{data.chequeNumber||"—"}</dd></div><div><dt className="text-muted-foreground">{l("Bank / branch","بینک / برانچ")}</dt><dd className="mt-1">{[named(data.bank),data.branch].filter(Boolean).join(" · ")||"—"}</dd></div><div><dt className="text-muted-foreground">{l("Cheque date","چیک کی تاریخ")}</dt><dd className="mt-1">{data.chequeDate||"—"}</dd></div></>}
        </dl></Card>
      </>:<p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{l("Reason","وجہ")}: {named(data.reason)||named(RECEIPT_REASON_OPTIONS.find(reason=>reason.code===data.status)??{nameEn:status(data.status),nameUr:status(data.status)})}</p>}
      {(data.openIssues>0||data.pendingEdits>0)&&<div className="flex flex-wrap gap-2">{data.openIssues>0&&<Badge tone="danger">{data.openIssues} {l("open issues","کھلے مسائل")}</Badge>}{data.pendingEdits>0&&<Badge tone="warning">{data.pendingEdits} {l("pending edit requests","ترمیم کی زیر التوا درخواستیں")}</Badge>}</div>}
      {data.remarks&&<div className="rounded-xl bg-muted/40 p-4"><p className="mb-2 text-xs font-semibold">{l("Remarks","نوٹ")}</p><p className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{data.remarks}</p></div>}
      <div className="sticky -bottom-5 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-1 py-3"><div className="flex gap-2"><Button size="small" variant="outline" onClick={onClose}>{t("close")}</Button><Button size="small" variant="ghost" loading={query.loading} onClick={()=>cache.invalidate(key)}><RefreshCw size={14}/>{t("usersRefresh")}</Button></div><div className="flex flex-wrap gap-2">{data.openIssues>0&&<Button asChild size="small" variant="outline"><Link href="/flags">{t("flags")}</Link></Button>}{data.pendingEdits>0&&<Button asChild size="small" variant="outline"><Link href="/approvals">{t("approvals")}</Link></Button>}<Button asChild size="small"><Link href={`/receipt-entry/${data.returnId}`} onClick={()=>cache.write(`${account.id}:receipts:book:${data.returnId}:resume-number`,data.number)}>{l("Open receipt in submission","جمع آوری میں رسید کھولیں")}<ArrowUpRight size={14}/></Link></Button></div></div>
    </div>}
    {query.error!=null&&<p role="alert" className="mt-3 text-sm text-[var(--danger)]">{errorLabel(query.error,l)}</p>}
    {!data&&<div className="mt-3 flex justify-end"><Button size="small" variant="outline" loading={query.loading} onClick={()=>cache.invalidate(key)}><RefreshCw size={14}/>{t("usersRefresh")}</Button></div>}
  </Dialog>;
}
