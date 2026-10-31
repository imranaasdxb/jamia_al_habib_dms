"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { receiptRequest } from "@/modules/receipts/receipts.client";
import { notificationResponseSchema, searchResponseSchema } from "@/modules/navigation/navigation.schema";
import type { NavigationItem } from "@/modules/navigation/navigation.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { RefObject } from "react";

const scrollClass="overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent]";
function useDismiss(root:RefObject<HTMLDivElement|null>,open:boolean,close:()=>void){
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent|FocusEvent)=>{if(e.target instanceof Node&&!root.current?.contains(e.target))close();};
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")close();};
  document.addEventListener("pointerdown",outside);document.addEventListener("focusin",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("focusin",outside);document.removeEventListener("keydown",escape);};
 },[root,open,close]);
}
function useNavigation(account:Account){
 const router=useRouter();const pathname=usePathname();const cache=usePageDataCache();
 return (item:NavigationItem)=>{
  const base=`${account.id}:`;const target=item.target;const write=(key:string,value:unknown)=>cache.write(base+key,value);
  if(item.kind==="FUNDRAISER"){write("people:search",target.search??item.title);write("people:status","ALL");write("people:page",1);write("people:tab","collectors");}
  if(item.kind==="USER"){write("users:search",target.search??item.title);write("users:role","ALL");write("users:page",1);}
  if(item.kind==="BOOK"){write("books:filters:search",target.search??item.title);write("books:filters:type",target.bookType??"REGULAR");write("books:filters:edition",target.editionId??"");write("books:filters:token","");write("books:filters:page",1);}
  if(item.kind==="ASSIGNMENT"){write("assignments:search",target.search??item.title);write("assignments:status","ALL");write("assignments:page",1);}
  if(item.kind==="LEFTOVER"){write("leftovers:search",target.search??item.title);write("leftovers:status","ALL");write("leftovers:page",1);}
  if(item.kind==="OVERDUE"){write("returns:search",target.search??"");write("returns:tab","OPEN");write("returns:collector","");write("returns:overdue","ALL");write("returns:page",1);}
  if(target.returnId&&target.number){
   if(pathname===item.href){window.dispatchEvent(new CustomEvent("dms:open-receipt",{detail:{returnId:target.returnId,number:target.number}}));return;}
   write(`receipts:book:${target.returnId}:resume-number`,target.number);
  }
  if(item.kind==="MASTER"&&target.masterKind){
   const kind=target.masterKind;write("masters:category",kind);write(`masters:${kind}:search`,target.search??"");
   write(`masters:${kind}:status${kind==="DONATION_HEAD"?":grouped":""}`,"ALL");write(`masters:${kind}:level`,"");write(`masters:${kind}:page`,1);
  }
  if(target.reviewKind){
   const mode=target.reviewKind==="PROFILE_EDIT"||target.reviewKind==="RECEIPT_EDIT"?"EDITS":"ISSUES";
   write(`receipt-review:${mode}:kind`,target.reviewKind);
   const filters={search:target.search??"",status:target.reviewStatus??"ACTIVE",from:"",to:"",page:1};
   write(`receipt-review:${mode}:filters`,filters);write(`receipt-review:${mode}:draft`,filters);
  }
  router.push(item.href);
 };
}
function useWords(){
 const {t,language}=useLanguage();const l=(en:string,ur:string)=>language==="ur"?ur:en;
 const kind=(value:NavigationItem["kind"])=>({
  FUNDRAISER:l("Fundraiser","چندہ کنندہ"),USER:l("Admin user","منتظم"),BOOK:l("Book stock","کتاب کا اسٹاک"),
  EDITION:l("Edition","ایڈیشن"),ASSIGNMENT:l("Book assignment","کتاب کی تفویض"),SUBMISSION:l("Book submission","کتاب جمع آوری"),LEFTOVER:l("Leftover book","باقی کتاب"),RECEIPT:l("Receipt / donation","رسید / عطیہ"),
  MASTER:l("Master record","ماسٹر ریکارڈ"),RECEIPT_EDIT:l("Receipt edit request","رسید میں ترمیم کی درخواست"),
  PROFILE_EDIT:l("Profile edit request","پروفائل میں ترمیم کی درخواست"),RECEIPT_ISSUE:l("Receipt issue","رسید کا مسئلہ"),
  BOOK_FLAG:l("Book flag","کتاب کا مسئلہ"),OVERDUE:l("Overdue book","واپسی کی مدت گزر گئی"),
 }[value]);
 return{t,l,kind};
}
function LoadingRows(){return <div role="status" aria-label="Loading" className="space-y-2 p-3 animate-pulse">{[0,1,2].map(i=><div key={i} className="h-14 rounded-xl bg-muted"/>)}</div>;}

export function GlobalSearch({account}:{account:Account}){
 const {t,l,kind}=useWords();const cache=usePageDataCache();const navigate=useNavigation(account);const router=useRouter();
 const root=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);const listId=useId();
 const [text,setText]=useState("");const [open,setOpen]=useState(false);const [composing,setComposing]=useState(false);const [active,setActive]=useState(-1);
 const term=text.trim();const allowed=term.length>=2;const key=`${account.id}:header:search:${encodeURIComponent(term.toLowerCase())}`;
 const load=useCallback(async()=>searchResponseSchema.parse(await receiptRequest(`/api/v1/search?q=${encodeURIComponent(term)}`)).data,[term]);
 const query=usePageQuery(key,load,{enabled:open&&allowed&&!composing,delay:350});
 const close=useCallback(()=>{setOpen(false);setActive(-1);},[]);useDismiss(root,open,close);
 const modules=[
  {title:t("dashboard"),href:"/dashboard",keywords:"dashboard overview خلاصہ ڈیش بورڈ"},
  {title:t("peopleCollectors"),href:"/people",keywords:"fundraisers collectors people fundraiser چندہ کنندہ"},
  {title:t("booksStock"),href:"/books",keywords:"books book stock receipt کتاب اسٹاک"},
  {title:t("assignBooks"),href:"/books/assignments",keywords:"assign assignment books تفویض"},
  {title:t("returnsScreen"),href:"/books/returns",keywords:"submission returns submit books جمع واپسی"},
  {title:t("donations"),href:"/donations",keywords:"donations donation receipts عطیات رسیدیں"},
  {title:t("donors"),href:"/donors",keywords:"donors donor giving عطیہ دہندگان"},
  {title:t("reports"),href:"/reports",keywords:"reports summary collections commission رپورٹ خلاصہ کمیشن"},
  {title:t("approvals"),href:"/approvals",keywords:"approvals requests edits review منظوری درخواست ترمیم"},
  {title:t("flags"),href:"/flags",keywords:"flags issue problems مسائل"},
  ...(account.role==="SUPER_ADMIN"?[
   {title:t("users"),href:"/users",keywords:"admins users accounts منتظم صارف"},
   {title:t("mastersEditions"),href:"/books/editions",keywords:"editions printing edition ایڈیشن"},
   {title:t("leftoversScreen"),href:"/books/leftovers",keywords:"leftovers reassign unused باقی دوبارہ"},
   {title:t("masters"),href:"/masters",keywords:"masters categories heads areas banks ماسٹر مدات علاقے"},
   {title:t("settings"),href:"/settings",keywords:"settings configuration ترتیبات"},
  ]:[]),
 ].filter(module=>!term||`${module.title} ${module.keywords}`.toLowerCase().includes(term.toLowerCase())).slice(0,term?4:6);
 const records=allowed?query.data??[]:[];
 const options=[...modules.map(module=>({key:module.href,title:module.title,detail:l("Open module","ماڈیول کھولیں"),kind:l("Module","ماڈیول"),go:()=>router.push(module.href)})),
  ...records.map(record=>({key:`${record.kind}:${record.id}`,title:record.title,detail:record.detail,kind:kind(record.kind),go:()=>navigate(record)}))];
 function choose(index:number){const item=options[index];if(!item)return;item.go();setText("");close();}
 function submit(){setOpen(true);if(allowed&&!composing&&(query.data===undefined||query.error))void cache.load(key,load);}
 useEffect(()=>{
  const shortcut=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();input.current?.focus();setOpen(true);}};
  document.addEventListener("keydown",shortcut);return()=>document.removeEventListener("keydown",shortcut);
 },[]);
 return <div ref={root} className="relative min-w-0 flex-1 max-w-[520px]">
  <form role="search" onSubmit={e=>{e.preventDefault();submit();}} className="relative">
   <Input ref={input} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={listId}
    aria-activedescendant={open&&active>=0&&active<options.length?`${listId}-${active}`:undefined}
    aria-label={l("Search across all modules","تمام ماڈیولز میں تلاش کریں")}
    className="min-h-10 rounded-full border-white/70 bg-white ps-4 pe-24 text-xs hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15"
    placeholder={l("Search books, receipts, Fundraisers…","کتابیں، رسیدیں، چندہ کنندہ تلاش کریں…")}
    maxLength={80} autoComplete="off" value={text}
    onFocus={()=>setOpen(true)} onChange={e=>{setText(e.target.value);setActive(-1);setOpen(true);}}
    onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}
    onKeyDown={e=>{
     if(e.nativeEvent.isComposing)return;
     if(e.key==="ArrowDown"){e.preventDefault();setOpen(true);setActive(index=>Math.min(options.length-1,index+1));}
     if(e.key==="ArrowUp"){e.preventDefault();setActive(index=>Math.max(0,index-1));}
     if(e.key==="Enter"&&open&&active>=0){e.preventDefault();choose(active);}
     if(e.key==="Escape"){e.preventDefault();close();}
    }}/>
   <div className="absolute end-1 top-1 flex items-center gap-0.5">
    {text&&<button type="button" aria-label={l("Clear search","تلاش صاف کریں")} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={()=>{setText("");setActive(-1);input.current?.focus();}}><X size={14}/></button>}
    <button type="submit" aria-label={t("search")} className="flex size-8 items-center justify-center rounded-full bg-primary/5 text-primary hover:bg-primary/10">{query.loading&&allowed?<LoaderCircle size={16} className="animate-spin"/>:<Search size={16}/>}</button>
   </div>
  </form>
  {open&&<div className="absolute inset-x-0 top-full z-50 mt-2 min-w-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-popover)]">
   <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-[10px] text-muted-foreground"><span>{l("Search across modules","تمام ماڈیولز میں تلاش")}</span><kbd>Ctrl K</kbd></div>
   <div id={listId} role="listbox" aria-label={t("search")} className={`max-h-[min(480px,65dvh)] ${scrollClass}`}>
    {options.map((option,index)=><button key={option.key} id={`${listId}-${index}`} type="button" role="option" aria-selected={active===index} tabIndex={-1} onMouseEnter={()=>setActive(index)} onClick={()=>choose(index)}
     className={`flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-start transition-colors last:border-0 ${active===index?"bg-primary/10":"hover:bg-muted/60"}`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><Search size={14}/></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{option.title}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{option.detail}</span></span><span className="max-w-28 shrink-0 text-[9px] text-muted-foreground">{option.kind}</span>
    </button>)}
    {allowed&&!query.data&&!query.error&&<LoadingRows/>}
    {allowed&&query.error!=null&&<div role="alert" className="p-4 text-xs text-[var(--danger)]">{l("Search is unavailable. Please retry.","تلاش دستیاب نہیں۔ دوبارہ کوشش کریں۔")}<Button variant="ghost" size="small" onClick={()=>cache.invalidate(key)}>{t("usersRefresh")}</Button></div>}
    {allowed&&query.data&&!options.length&&<p className="p-6 text-center text-xs text-muted-foreground">{l("No matching records. Try a name, code, book or receipt number.","کوئی ریکارڈ نہیں ملا۔ نام، کوڈ، کتاب یا رسید نمبر لکھیں۔")}</p>}
    {!allowed&&<p className="px-4 py-3 text-[10px] text-muted-foreground">{l("Type at least 2 characters to search records.","ریکارڈ تلاش کرنے کے لیے کم از کم 2 حروف لکھیں۔")}</p>}
   </div>
   <p className="border-t border-border px-4 py-2 text-[9px] text-muted-foreground">{l("↑ ↓ select · Enter search/open · Esc close","↑ ↓ انتخاب · انٹر تلاش/کھولیں · Esc بند کریں")}</p>
  </div>}
 </div>;
}

export function HeaderNotifications({account,defer=false}:{account:Account;defer?:boolean}){
 const {t,l,kind}=useWords();const cache=usePageDataCache();const navigate=useNavigation(account);const root=useRef<HTMLDivElement>(null);const id=useId();
 const [open,setOpen]=useState(false);const key=`${account.id}:header:notifications`;
 const load=useCallback(async()=>({snapshot:notificationResponseSchema.parse(await receiptRequest("/api/v1/notifications")).data,loadedAt:Date.now()}),[]);
 const query=usePageQuery(key,load,{enabled:!defer||open});const data=query.data?.snapshot;
 const close=useCallback(()=>setOpen(false),[]);useDismiss(root,open,close);
 function toggle(){
  if(!open&&query.data&&Date.now()-query.data.loadedAt>60000)cache.invalidate(key);
  setOpen(value=>!value);
 }
 return <div ref={root} className="relative">
  <Button variant="ghost" size="icon" className="relative size-9 min-h-9 rounded-full bg-white text-primary hover:bg-white/80"
   aria-label={`${t("notifications")}${data?.total?` (${data.total})`:""}`} aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={toggle}>
   <Bell size={19}/>{(data?.total??0)>0&&<span aria-hidden="true" className="absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full border-2 border-white bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground">{data&&data.total>99?"99+":data?.total}</span>}
  </Button>
  {open&&<div id={id} role="dialog" aria-label={t("notifications")} className="absolute end-0 top-full z-50 mt-3 w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-popover)]">
   <div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="text-sm font-semibold">{t("notifications")}</h2><p className="mt-1 text-[10px] text-muted-foreground">{data?`${data.total} ${l("pending work items","زیر التوا کام")}`:l("Loading pending work…","زیر التوا کام لوڈ ہورہے ہیں…")}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" className="size-8 min-h-8" loading={query.loading} aria-label={t("usersRefresh")} onClick={()=>cache.invalidate(key)}><RefreshCw size={15}/></Button><Button variant="ghost" size="icon" className="size-8 min-h-8" aria-label={t("close")} onClick={close}><X size={15}/></Button></div></div>
   <div className={`max-h-[min(440px,65dvh)] ${scrollClass}`}>
    {!data&&!query.error?<LoadingRows/>:data?.items.map(item=><button key={`${item.kind}:${item.id}`} type="button" onClick={()=>{navigate(item);close();}} className="flex w-full items-start gap-3 border-b border-border/60 p-4 text-start transition-colors hover:bg-muted/50 last:border-0">
     <span className={`mt-1 size-2 shrink-0 rounded-full ${["RECEIPT_ISSUE","BOOK_FLAG"].includes(item.kind)?"bg-red-400":"bg-emerald-500"}`}/>
     <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold text-primary">{kind(item.kind)}</span><span className="mt-1 block truncate text-xs font-medium">{item.title}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.detail}</span></span><ChevronRight size={14} className="mt-2 text-muted-foreground rtl:rotate-180"/>
    </button>)}
    {data&&!data.items.length&&<p className="p-8 text-center text-xs text-muted-foreground">{l("You have no pending work.","آپ کا کوئی کام زیر التوا نہیں۔")}</p>}
    {query.error!=null&&<p role="alert" className="p-4 text-xs text-[var(--danger)]">{l("Notifications could not be loaded. Use Refresh to retry.","اطلاعات لوڈ نہیں ہوئیں۔ تازہ کر کے کوشش کریں۔")}</p>}
   </div>
   <p className="border-t border-border px-4 py-3 text-[10px] leading-5 text-muted-foreground">{l("Live pending work; resolved items leave this list. Showing up to 12 items. Refreshes on changes and when reopened after a minute.","زیر التوا کام؛ حل شدہ اندراجات فہرست سے نکل جاتے ہیں۔ زیادہ سے زیادہ 12 اندراجات۔ تبدیلی پر اور ایک منٹ بعد دوبارہ کھولنے پر تازہ ہوتی ہے۔")}</p>
  </div>}
 </div>;
}
