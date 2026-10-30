"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Eye, RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { receiptRequest } from "@/modules/receipts/receipts.client";
import { reviewPageSchema, reviewDetailSchema } from "@/modules/reviews/reviews.schema";
import type { ReviewKind, ReviewRow } from "@/modules/reviews/reviews.schema";
import { collectorLabels } from "@/modules/people/people.client";
import { displayMoney } from "@/modules/books/returns.schema";
import type { Account } from "@/modules/auth/auth.types";

function Skeleton() { return <div role="status" aria-label="Loading" className="space-y-3 p-5 animate-pulse">{Array.from({length:5},(_,i)=><div key={i} className="h-16 rounded-xl bg-muted"/>)}</div>; }
export function ReceiptReviewScreen({account,mode}:{account:Account;mode:"EDITS"|"ISSUES"}) {
  const {t,language}=useLanguage(); const l=(en:string,ur:string)=>language==="ur"?ur:en;
  const cache=usePageDataCache(); const base=`${account.id}:receipt-review:${mode}`;
  const kinds:readonly [ReviewKind,ReviewKind]=mode==="EDITS"?["RECEIPT_EDIT","PROFILE_EDIT"]:["RECEIPT_ISSUE","BOOK_FLAG"];
  const [kind,setKind]=usePageState<ReviewKind>(`${base}:kind`,kinds[0]);
  const initial={search:"",status:"ACTIVE",from:"",to:"",page:1};
  const [filter,setFilter]=usePageState(`${base}:filters`,initial);
  const [draft,setDraft]=useState(filter); const [selected,setSelected]=useState<ReviewRow|null>(null);
  const [notice,setNotice]=useState("");
  const params=new URLSearchParams({...filter,page:String(filter.page),kind}).toString();
  const key=`${account.id}:receipt-review:queue:${params}`;
  const load=useCallback(async()=>reviewPageSchema.parse(await receiptRequest(`/api/v1/reviews?${params}`)),[params]);
  const query=usePageQuery(key,load,{enabled:!selected}); const data=query.data;
  const title=(value:ReviewKind)=>value==="RECEIPT_EDIT"?l("Receipt edits","رسید کی ترامیم"):value==="PROFILE_EDIT"?l("Fundraiser profile edits","چندہ کنندہ پروفائل کی ترامیم"):value==="RECEIPT_ISSUE"?l("Receipt issues","رسید کے مسائل"):l("Book flags","کتاب کے مسائل");
  const states=kind==="RECEIPT_EDIT"?["PENDING","APPROVED","REJECTED","USED"]:kind==="PROFILE_EDIT"?["PENDING","APPROVED","REJECTED"]:kind==="BOOK_FLAG"?["OPEN","UNDER_REVIEW","RESOLVED"]:["OPEN","RESOLVED"];
  const stateLabel=(value:string)=>({ACTIVE:l("Awaiting action","کارروائی کا منتظر"),ALL:l("All statuses","تمام حالتیں"),PENDING:l("Pending","زیر التوا"),APPROVED:l("Approved","منظور"),REJECTED:l("Rejected","مسترد"),USED:l("Edit used","ترمیم استعمال ہوئی"),OPEN:l("Open","کھلا"),UNDER_REVIEW:l("Under review","زیرِ جائزہ"),RESOLVED:l("Resolved","حل شدہ")}[value]??value);
  const errorText=(error:unknown)=>{const code=error instanceof Error?error.message:"";
    if(code==="REVIEW_CHANGED"||code==="STALE_COLLECTOR")return l("This record changed. Refresh and review it again.","ریکارڈ بدل گیا ہے۔ تازہ کر کے دوبارہ جائزہ لیں۔");
    if(code==="REVIEW_FINALIZE_FIRST")return l("Finalize the submission before resolving this book flag.","کتاب کا مسئلہ حل کرنے سے پہلے جمع آوری مکمل کریں۔");
    if(code==="REVIEW_OPEN_ISSUES")return l("Resolve this book's receipt issues first.","پہلے اس کتاب کی رسیدوں کے مسائل حل کریں۔");
    return l("Unable to load or save this review. Please refresh and retry.","جائزہ لوڈ یا محفوظ نہیں ہوا۔ تازہ کر کے دوبارہ کوشش کریں۔");
  };
  return <AppShell account={account} headerTitle={mode==="EDITS"?"approvals":"flags"} sampleData={false}>
    <div className="mb-5"><h1 className="text-2xl font-bold">{t(mode==="EDITS"?"approvals":"flags")}</h1><p className="mt-2 text-sm text-muted-foreground">{mode==="EDITS"?l("Review requested changes before the original record can be edited.","اصل ریکارڈ میں ترمیم سے پہلے درخواستوں کا جائزہ لیں۔"):l("Resolve receipt issues first, then finalize submissions and reconcile book flags.","پہلے رسیدوں کے مسائل، پھر جمع آوری مکمل کر کے کتابوں کے مسائل حل کریں۔")}</p></div>
    <div className="mb-5 flex flex-wrap gap-2">{kinds.map(value=><Button key={value} variant={kind===value?"default":"outline"} onClick={()=>{setKind(value);setFilter({...filter,status:"ACTIVE",page:1});setDraft({...filter,status:"ACTIVE",page:1});setNotice("");}}>{title(value)}</Button>)}</div>
    <div className="mb-5 grid grid-cols-3 gap-3">{[l("Total requests","کل درخواستیں"),l("Awaiting action","کارروائی کا منتظر"),l("Reviewed / completed","جائزہ مکمل")].map((label,i)=><Card key={label} className="p-4"><p className="text-xs text-muted-foreground">{label}</p>{data?<p className="mt-2 text-2xl font-bold tabular-nums">{[data.data.summary.total,data.data.summary.active,data.data.summary.completed][i]}</p>:<div className="mt-3 h-7 w-16 animate-pulse rounded bg-muted"/>}</Card>)}</div>
    <Card className="mb-4 p-3"><form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();setFilter({...draft,page:1});setNotice("");}}>
      <label className="min-w-48 flex-1"><span className="mb-1 block text-xs text-muted-foreground">{t("search")}</span><Input value={draft.search} maxLength={100} placeholder={l("Name, book, receipt or reason…","نام، کتاب، رسید یا وجہ…")} onChange={e=>setDraft({...draft,search:e.target.value})}/></label>
      <label><span className="mb-1 block text-xs text-muted-foreground">{t("status")}</span><select className="h-[47px] rounded-xl border border-border bg-card px-3 text-sm" value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{["ACTIVE","ALL",...states].map(s=><option key={s} value={s}>{stateLabel(s)}</option>)}</select></label>
      {(["from","to"] as const).map(field=><label key={field}><span className="mb-1 block text-xs text-muted-foreground">{field==="from"?l("From","سے"):l("To","تک")}</span><Input type="date" value={draft[field]} onChange={e=>setDraft({...draft,[field]:e.target.value})}/></label>)}
      <Button type="submit" variant="outline" aria-label={t("search")} disabled={!!draft.from&&!!draft.to&&draft.from>draft.to}><Search size={17}/></Button>
      <Button variant="outline" size="icon" loading={query.loading} aria-label={t("usersRefresh")} onClick={()=>cache.invalidate(key)}><RefreshCw size={16}/></Button>
    </form></Card>
    {notice&&<p role="status" className="mb-3 text-sm text-emerald-700">{notice}</p>}
    {query.error!=null&&<p role="alert" className="mb-3 text-sm text-[var(--danger)]">{errorText(query.error)}</p>}
    <Card className="overflow-hidden" aria-busy={query.loading}>{!data&&!query.error?<Skeleton/>:<div className="overflow-x-auto"><table className="w-full min-w-[780px] table-fixed text-start text-sm"><colgroup><col className="w-[22%]"/><col className="w-[31%]"/><col className="w-[20%]"/><col className="w-[17%]"/><col className="w-[10%]"/></colgroup><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[l("Fundraiser / reference","چندہ کنندہ / حوالہ"),l("Reason","وجہ"),l("Requested by / date","درخواست گزار / تاریخ"),t("status"),l("Review","جائزہ")].map(label=><th key={label} className="px-4 py-3 text-start font-medium">{label}</th>)}</tr></thead><tbody>{data?.data.rows.map(row=><tr key={row.id} className="border-t border-border hover:bg-muted/25"><td className="px-4 py-4"><strong className="block truncate">{row.subject}</strong><p className="mt-1 text-xs text-muted-foreground">{row.reference}{row.receiptNumber!==null?` · #${row.receiptNumber}`:""}</p>{row.expectedPaise!==null&&<p className="mt-1 text-xs">{l("Expected / found","متوقع / موصول")}: {displayMoney(row.expectedPaise,language)} / {displayMoney(row.foundPaise??0,language)}</p>}</td><td className="px-4 py-4"><p className="line-clamp-3 whitespace-pre-wrap">{row.reason}</p></td><td className="px-4 py-4"><p className="truncate">{row.actor||"—"}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleDateString(language==="ur"?"ur-PK":"en-IN",{timeZone:"Asia/Kolkata"})}</p></td><td className="px-4 py-4"><Badge tone={["REJECTED","OPEN"].includes(row.status)?"danger":["APPROVED","RESOLVED","USED"].includes(row.status)?"success":"warning"}>{stateLabel(row.status)}</Badge></td><td className="px-4 py-4"><Button variant="outline" size="icon" aria-label={l("View review","جائزہ دیکھیں")} onClick={()=>setSelected(row)}><Eye size={16}/></Button></td></tr>)}{data&&!data.data.rows.length&&<tr><td colSpan={5} className="p-12 text-center text-muted-foreground">{t("submissionNoReviews")}</td></tr>}</tbody></table></div>}</Card>
    {data&&<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{data.meta.total} · {l("Page","صفحہ")} {data.meta.page}/{Math.max(1,Math.ceil(data.meta.total/20))}</span><div className="flex gap-2"><Button size="small" variant="outline" disabled={query.loading||data.meta.page<=1} onClick={()=>setFilter({...filter,page:data.meta.page-1})}>{l("Previous","پچھلا")}</Button><Button size="small" variant="outline" disabled={query.loading||data.meta.page*20>=data.meta.total} onClick={()=>setFilter({...filter,page:data.meta.page+1})}>{l("Next","اگلا")}</Button></div></div>}
    {selected&&<ReviewDialog key={selected.id} account={account} row={selected} title={title(selected.kind)} stateLabel={stateLabel} errorText={errorText} onClose={()=>setSelected(null)} onSaved={()=>{for(const module of ["receipt-review:","receipts:book:","receipts:queue:","returns:","people:","leftovers:","books:query:","edition-summary:","assignments:"])cache.invalidate(`${account.id}:${module}`);setSelected(null);setNotice(l("Review saved successfully.","جائزہ محفوظ ہوگیا۔"));}}/>}
  </AppShell>;
}
function ReviewDialog({account,row,title,stateLabel,errorText,onClose,onSaved}:{account:Account;row:ReviewRow;title:string;stateLabel:(s:string)=>string;errorText:(e:unknown)=>string;onClose:()=>void;onSaved:()=>void}) {
  const {t,language}=useLanguage();const l=(en:string,ur:string)=>language==="ur"?ur:en;const cache=usePageDataCache();
  const key=`${account.id}:receipt-review:detail:${row.kind}:${row.id}:${row.status}`;
  const load=useCallback(async()=>reviewDetailSchema.parse(await receiptRequest(`/api/v1/reviews/${row.id}?kind=${row.kind}`)).data,[row.id,row.kind]);
  const query=usePageQuery(key,load);const data=query.data;const [note,setNote]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState<unknown>(null);
  const edits=row.kind==="RECEIPT_EDIT"||row.kind==="PROFILE_EDIT";
  async function save(decision:"APPROVED"|"REJECTED"|"RESOLVED") {
    if(busy||!data||note.trim().length<3)return;setBusy(true);setError(null);
    try{await receiptRequest("/api/v1/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.id,kind:row.kind,decision,note})});onSaved();}
    catch(e){setError(e);cache.invalidate(`${account.id}:receipt-review:queue:`);}finally{setBusy(false);}
  }
  return <Dialog open busy={busy} onOpenChange={open=>{if(!open)onClose();}} title={title} description={`${row.subject} · ${row.reference}`} className="w-[min(760px,calc(100vw-2rem))]">
    {!data&&!query.error?<Skeleton/>:data&&<div className="space-y-4"><Badge tone="neutral">{stateLabel(row.status)}</Badge><div className="rounded-xl bg-muted/40 p-4"><p className="mb-1 text-xs text-muted-foreground">{l("Requested reason","درخواست کی وجہ")}</p><p className="whitespace-pre-wrap text-sm">{data.reason||"—"}</p></div>
    {data.changes.length>0&&<div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-muted/40"><tr>{[l("Field","خانہ"),l("Before","پہلے"),l("Requested","مجوزہ")].map(s=><th key={s} className="p-3 text-start text-xs">{s}</th>)}</tr></thead><tbody>{data.changes.map(change=><tr key={change.field} className="border-t border-border"><td className="p-3">{change.field in collectorLabels?t(collectorLabels[change.field as keyof typeof collectorLabels]):change.field}</td><td className="max-w-52 break-words p-3 text-muted-foreground">{change.before||"—"}</td><td className="max-w-52 break-words p-3">{change.after||"—"}</td></tr>)}</tbody></table></div>}
    {data.photoChanged&&<div className="grid grid-cols-2 gap-4">{[false,true].map(proposed=><div key={String(proposed)} className="rounded-xl border border-border p-3 text-center text-xs"><p className="mb-3">{proposed?l("Requested photo","مجوزہ تصویر"):l("Current photo","موجودہ تصویر")}</p>{(proposed?data.proposedHasPhoto:data.currentHasPhoto)?<img alt={proposed?"Requested profile":"Current profile"} src={`/api/v1/people/${row.personId}/photo${proposed?`?request=${row.id}`:""}`} className="mx-auto h-24 w-24 rounded-xl object-cover"/>:<span>{l("No photo","تصویر نہیں")}</span>}</div>)}</div>}
    {data.receipt&&<Card className="grid grid-cols-2 gap-3 p-4 text-sm"><div>{l("Current receipt amount","موجودہ رسید کی رقم")}<strong className="mt-1 block">{displayMoney(data.receipt.amountPaise??0,language)}</strong></div><div>{l("Donor","عطیہ دہندہ")}<p>{data.receipt.anonymous?l("Anonymous","گمنام"):data.receipt.name||l("Not recorded","درج نہیں")}</p></div><p>{data.receipt.date} · {data.receipt.payment}</p><p>{data.receipt.checked?l("Checked","جانچ شدہ"):l("Draft","مسودہ")}</p></Card>}
    {data.note&&<p className="whitespace-pre-wrap text-sm">{l("Review note","جائزہ نوٹ")}: {data.note}</p>}
    {row.blocked&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{row.blocked==="STALE"?l("The original record changed. Reject this request and ask for a fresh one.","اصل ریکارڈ بدل گیا۔ درخواست مسترد کر کے نئی درخواست منگوائیں۔"):row.blocked==="FINALIZE_FIRST"?l("Finalize this submission before resolving its book flag.","کتاب کا مسئلہ حل کرنے سے پہلے جمع آوری مکمل کریں۔"):l("Resolve the open receipt issues for this book first.","پہلے اس کتاب کی رسیدوں کے کھلے مسائل حل کریں۔")}</p>}
    {account.role==="SUPER_ADMIN"&&row.canReview&&<label className="block text-xs">{l("Review / resolution note (required)","جائزہ / حل کا نوٹ (ضروری)")}<textarea className="mt-2 w-full rounded-xl border border-border bg-card p-3 text-sm" rows={3} minLength={3} maxLength={row.kind==="PROFILE_EDIT"?500:1000} value={note} onChange={e=>setNote(e.target.value)}/></label>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">{row.returnId?<Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.returnId}`}>{t("submissionOpenReceipt")}</Link></Button>:<span/>}
    {account.role==="SUPER_ADMIN"&&row.canReview&&<div className="flex gap-2">{edits&&<Button size="small" variant="outline" loading={busy} disabled={note.trim().length<3||error!=null} onClick={()=>void save("REJECTED")}>{t("submissionReject")}</Button>}<Button size="small" loading={busy} disabled={note.trim().length<3||error!=null||(edits&&!row.canApprove)} onClick={()=>void save(edits?"APPROVED":"RESOLVED")}>{t(edits?"submissionApprove":"submissionResolve")}</Button></div>}</div>
    </div>}
    {(query.error!=null||error!=null)&&<div role="alert" className="mt-4 text-sm text-[var(--danger)]">{errorText(error??query.error)}<Button size="small" variant="outline" className="ms-2" onClick={()=>{setError(null);cache.invalidate(key);}}>{t("usersRefresh")}</Button></div>}
  </Dialog>;
}
