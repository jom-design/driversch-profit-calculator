import { useEffect, useMemo, useRef, useState } from 'react'
import { nativeTripSettingsPayload } from './assistant/nativeSettingsSync'
import { t, translateMessage, type AppLocale, type TranslationKey } from './lib/i18n'
import { Activity, Archive, Calculator, CarFront, Check, ChevronDown, Download, FileImage, Gauge, History, LayoutDashboard, Mic, MicOff, RotateCcw, Save, Settings as SettingsIcon, ShieldCheck, Trash2, Upload, Wallet, X } from 'lucide-react'
import { calculateTrip } from './lib/calculator'
import NumericInput from './components/NumericInput'
import { normalizeBackup } from './lib/backupImport'
import AssistantInbox from './assistant/AssistantInbox'
import type { InboxItem } from './assistant/types'
import { toCalculatorTripInput } from './assistant/calculatorTransfer'
import { ocrDraftToInboxItem } from './assistant/ocrAdapter'
import VoiceCommandBar from './assistant/voice/VoiceCommandBar'
import type { VoiceIntent } from './assistant/voice/voiceCommands'
import { markInboxParseError, markInboxTransferred } from './assistant/inbox'
import { getInboxStorageErrorMessage, loadInboxItems, saveInboxChanges } from './assistant/inboxStorage'
import { deleteTrip, getSettings, getTrips, replaceAllData, saveSettings, saveTrip } from './lib/db'
import { readTripImage, type OcrDraft } from './lib/ocr'
import { DEFAULT_SETTINGS, EMPTY_TRIP, type AppName, type FareMode, type SavedTrip, type Settings, type TripInput } from './types'

type Page = 'calculator' | 'assistant' | 'inbox' | 'history' | 'reports' | 'settings'
const money = (n: number, locale: AppLocale = 'ar') => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t('ج.م', locale)}`
const templates: {name:string; desc:string; trip:TripInput}[] = [
  { name:'المثال المرجعي', desc:'22 كم — 165 جنيه — 40 دقيقة', trip:{...EMPTY_TRIP} },
  { name:'مشوار قصير وسط البلد', desc:'5 كم — 70 جنيه', trip:{...EMPTY_TRIP, fare:70, passengerKm:5, totalMinutes:20} },
  { name:'مشوار أطراف القاهرة', desc:'عودة فارغة 35 كم', trip:{...EMPTY_TRIP, fare:350, pickupKm:8, passengerKm:25, returnKm:35, totalMinutes:100} },
  { name:'مشوار خاسر', desc:'أجرة ضعيفة لاختبار الرفض', trip:{...EMPTY_TRIP, fare:35, passengerKm:12, totalMinutes:45} }
]
const nav: {id:Page;label:string;icon:any}[] = [
  {id:'calculator',label:'حاسبة المشوار',icon:Calculator},{id:'assistant',label:'المساعد الذكي',icon:FileImage},
  {id:'inbox',label:'الرحلات الملتقطة',icon:Archive},{id:'history',label:'سجل الرحلات',icon:History},
  {id:'reports',label:'التقارير',icon:LayoutDashboard},{id:'settings',label:'الإعدادات',icon:SettingsIcon}
]
function Field({label,value,onChange,unit='',allowEmpty=false}:{label:string;value:number|null|undefined;onChange:(v:number|null)=>void;unit?:string;allowEmpty?:boolean}) {
  return <label className="field"><span>{label}</span><div className="input-wrap"><NumericInput value={value} onValueChange={onChange} allowEmpty={allowEmpty}/><small>{unit}</small></div></label>
}
export default function App() {
  const [page,setPage]=useState<Page>('calculator')
  const [locale,setLocale]=useState<AppLocale>(()=>{try{return localStorage.getItem('driver.locale')==='en'?'en':'ar'}catch{return 'ar'}})
  const tr=(key:string)=>t(key as TranslationKey,locale)
  const [theme,setTheme]=useState<'light'|'dark'>(()=>{try{const saved=localStorage.getItem('driver.theme');if(saved==='light'||saved==='dark')return saved;return window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark'}catch{return 'dark'}})
  const [settings,setSettings]=useState<Settings>(DEFAULT_SETTINGS)
  const [savedSettings,setSavedSettings]=useState<Settings>(DEFAULT_SETTINGS)
  const [trip,setTrip]=useState<TripInput>(EMPTY_TRIP)
  const [trips,setTrips]=useState<SavedTrip[]>([])
  const [inbox,setInbox]=useState<InboxItem[]>([])
  const [inboxReady,setInboxReady]=useState(false)
  const [inboxStorageMessage,setInboxStorageMessage]=useState('')
  const [inboxSaveFailed,setInboxSaveFailed]=useState(false)
  const invalidInboxCountRef=useRef(0)
  const persistedInboxRef=useRef<InboxItem[]>([])
  const inboxWriteQueueRef=useRef<Promise<void>>(Promise.resolve())
  const [draft,setDraft]=useState<OcrDraft|null>(null)
  const [busy,setBusy]=useState(false)
  const [progress,setProgress]=useState(0)
  const [toast,setToast]=useState('')
  const [speaking,setSpeaking]=useState(false)
  const result=useMemo(()=>calculateTrip(trip,settings),[trip,settings])
  const moneyText=(value:number)=>money(value,locale)
  useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';document.documentElement.dataset.locale=locale;document.title=tr('حاسبة عدالة المشاوير');document.querySelector('meta[name="description"]')?.setAttribute('content',tr('حاسبة مجانية لمساعدة سائقي تطبيقات النقل على حساب صافي ربح الرحلات.'));try{localStorage.setItem('driver.locale',locale)}catch{}},[locale])
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f3f7fc':'#080e20');try{localStorage.setItem('driver.theme',theme)}catch{}},[theme])
  useEffect(()=>{const bridge=(window as Window & {DriverAndroid?:{setVoiceLanguage?:(tag:string)=>boolean;setSystemTheme?:(theme:string)=>boolean}}).DriverAndroid;bridge?.setVoiceLanguage?.(locale==='ar'?'ar-EG':'en-US');bridge?.setSystemTheme?.(theme)},[locale])
  useEffect(()=>{(async()=>{const loaded=await getSettings();setSettings(loaded);setSavedSettings(loaded);setTrips(await getTrips())})()},[])
  useEffect(()=>{
    const bridge=(window as Window & {DriverAndroid?:{setTripAnalysisSettings?:(json:string)=>boolean}}).DriverAndroid
    // Native analysis receives only saved settings; unsaved edits on the settings page never reach it.
    bridge?.setTripAnalysisSettings?.(nativeTripSettingsPayload(savedSettings,trip.app,trip.fareMode))
  },[savedSettings,trip.app,trip.fareMode])
  useEffect(()=>{
    let active=true
    void loadInboxItems().then(({items,invalidCount})=>{
      if(!active)return
      persistedInboxRef.current=items
      setInbox(items)
      invalidInboxCountRef.current=invalidCount
      if(invalidCount>0)setInboxStorageMessage(`تم تجاهل ${invalidCount} سجل غير صالح داخل مخزن الإنبوكس. لم يتم حذف السجلات التالفة.`)
    }).catch(error=>{if(active){setInboxStorageMessage(getInboxStorageErrorMessage(error));setInboxSaveFailed(true)}})
      .finally(()=>{if(active)setInboxReady(true)})
    return ()=>{active=false}
  },[])
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3200);return()=>clearTimeout(t)},[toast])
  useEffect(()=>{
    const handleVoiceEvent=(event:Event)=>{
      const detail=(event as CustomEvent<{type:string}>).detail
      if(detail?.type==='speak-ended'||detail?.type==='speak-stopped'||detail?.type==='speak-error')setSpeaking(false)
    }
    window.addEventListener('driverandroidvoice',handleVoiceEvent)
    return()=>window.removeEventListener('driverandroidvoice',handleVoiceEvent)
  },[])
  const commitInbox=(next:InboxItem[]):Promise<boolean>=>{
    setInbox(next)
    const operation=inboxWriteQueueRef.current.then(async()=>{
      await saveInboxChanges(persistedInboxRef.current,next)
      persistedInboxRef.current=next
      setInboxStorageMessage(invalidInboxCountRef.current>0?`تم تجاهل ${invalidInboxCountRef.current} سجل غير صالح داخل مخزن الإنبوكس. لم يتم حذف السجلات التالفة.`:'')
      setInboxSaveFailed(false)
      return true
    }).catch(error=>{
      const message=getInboxStorageErrorMessage(error)
      setInboxStorageMessage(message)
      setInboxSaveFailed(true)
      setToast(message)
      return false
    })
    inboxWriteQueueRef.current=operation.then(()=>undefined)
    return operation
  }
  const patch=(key:keyof TripInput,value:any)=>setTrip(t=>({...t,[key]:value}))
  const updateSettings=(key:keyof Settings,value:number)=>setSettings(s=>({...s,[key]:value}))
  const persistSettings=async()=>{await saveSettings(settings);setSavedSettings(settings);setToast('تم حفظ الإعدادات محليًا')}
  const loadTemplate=(t:TripInput)=>{setTrip({...t});setPage('calculator')}
  const saveCurrent=async()=> {
    if(trip.totalMinutes<=0 || trip.fare<0 || [trip.pickupKm,trip.passengerKm,trip.returnKm,trip.extraExpenses].some(v=>v<0)){setToast('راجع بيانات الرحلة قبل الحفظ');return}
    if(trip.fareMode==='unknown'){setToast('حدد هل الأجرة صافية أم إجمالية أولًا');return}
    const saved:SavedTrip={...trip,...result,calculationSettings:{...settings,commission:{...settings.commission}},id:crypto.randomUUID(),createdAt:new Date().toISOString()}
    await saveTrip(saved);setTrips(await getTrips());setToast('تم حفظ الرحلة على جهازك')
  }
  const removeTrip=async(id:string)=>{await deleteTrip(id);setTrips(await getTrips())}
  const uploadImage=async(file?:File)=>{
    if(!file)return
    if(!inboxReady){setToast('انتظر استعادة صندوق الرحلات قبل معالجة صورة جديدة.');return}
    setBusy(true);setProgress(0);setDraft(null)
    try{setDraft(await readTripImage(file,setProgress));setToast('انتهت قراءة الصورة؛ راجع البيانات قبل اعتمادها')}
    catch(e){const failed=markInboxParseError(crypto.randomUUID(),'screenshot','');await commitInbox([failed,...inbox]);setPage('inbox');setToast('تعذرت قراءة الصورة؛ أضف البيانات يدويًا في عنصر الخطأ داخل صندوق المراجعة.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{
    const handleSharedImage=(event:Event)=>{
      const dataUrl=(event as CustomEvent<{dataUrl?:string}>).detail?.dataUrl
      if(!dataUrl?.startsWith('data:image/'))return
      setPage('assistant')
      void fetch(dataUrl).then(response=>{
        if(!response.ok)throw new Error('shared image unavailable')
        return response.blob()
      }).then(blob=>uploadImage(new File([blob], 'shared-trip-screenshot.jpg', {type:blob.type||'image/jpeg'})))
        .catch(()=>setToast('تعذر استلام الصورة المشاركة. حاول مشاركتها مرة أخرى.'))
    }
    const handleShareError=()=>setToast('تعذر فتح الصورة المشاركة. جرّب صورة PNG أو JPG أصغر حجمًا.')
    window.addEventListener('driverandroidshareimage',handleSharedImage)
    window.addEventListener('driverandroidshareerror',handleShareError)
    return ()=>{
      window.removeEventListener('driverandroidshareimage',handleSharedImage)
      window.removeEventListener('driverandroidshareerror',handleShareError)
    }
  },[inboxReady,inbox])
  const useDraft=async()=>{
    if(!draft)return
    if(!inboxReady){setToast('انتظر استعادة صندوق الرحلات قبل إضافة العرض.');return}
    const item=ocrDraftToInboxItem(draft,crypto.randomUUID())
    await commitInbox([item,...inbox])
    setPage('inbox')
    setDraft(null)
    setToast('تمت إضافة الصورة لصندوق المراجعة. راجع كل الحقول وأكدها قبل الحساب.')
  }
  const transferConfirmedOffer=async(item:InboxItem)=>{
    const current=inbox.find(entry=>entry.id===item.id)
    const nextTrip=current?.status==='confirmed'?toCalculatorTripInput(current):null
    if(!nextTrip){setToast('لا يمكن نقل عرض غير مؤكد أو ناقص البيانات');return}
    const nextInbox=inbox.map(entry=>entry.id===item.id?markInboxTransferred(entry):entry)
    const persisted=await commitInbox(nextInbox)
    if(!persisted){setInbox(inbox);setToast('تعذر تثبيت حالة النقل محليًا؛ لم يتم إرسال العرض للحاسبة.');return}
    setTrip(current=>({...current,...nextTrip}))
    setPage('calculator')
    setToast('تم نقل العرض المؤكد للحاسبة. لم يتم حفظه في سجل الرحلات.')
  }
  const speak=()=>{
    const nativeVoice=(window as Window & {DriverAndroid?:{speakText:(text:string)=>boolean;stopSpeaking:()=>boolean}}).DriverAndroid
    if(speaking){
      if(nativeVoice)nativeVoice.stopSpeaking()
      else if('speechSynthesis'in window)speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const decision=decisionLabel[result.decision]
    const reason=translateMessage(result.decisionReason,locale)
    const text=result.decision==='accept'?`${decision}. ${tr('صافي الربح')} ${moneyText(result.netProfit)}`:result.decision==='review'?`${decision}. ${reason}`:`${decision}. ${tr('صافي الربح')} ${moneyText(result.netProfit)}`
    if(nativeVoice){nativeVoice.speakText(text);setSpeaking(true);return}
    if(!('speechSynthesis'in window)){setToast('ميزة الصوت غير مدعومة في هذا الجهاز');return}
    const utter=new SpeechSynthesisUtterance(text);utter.lang=locale==='ar'?'ar-EG':'en-US';utter.onend=()=>setSpeaking(false);utter.onerror=()=>setSpeaking(false);speechSynthesis.speak(utter);setSpeaking(true)
  }
  const exportBackup=async()=>{
    const payload={schemaVersion:1,exportedAt:new Date().toISOString(),settings,trips}
    downloadFile(JSON.stringify(payload,null,2),'driver-profit-backup.json','application/json')
  }
  const importBackup=async(file?:File)=>{
    if(!file)return
    let data:unknown
    try{data=JSON.parse(await file.text())}catch{setToast('ملف النسخة الاحتياطية غير صالح أو غير متوافق');return}
    // Everything is validated before anything is stored. Numbers in any digit system are accepted.
    const checked=normalizeBackup(data,DEFAULT_SETTINGS)
    if(!checked.ok){setToast(checked.reason);return}
    const {settings:nextSettings,trips:nextTrips,skippedTrips}=checked.value
    if(!confirm(translateMessage(`سيتم استيراد ${nextTrips.length} رحلة واستبدال السجل الحالي. هل تريد المتابعة؟`,locale)))return
    try{
      await replaceAllData(nextTrips,nextSettings);setTrips(await getTrips());const reloaded=await getSettings();setSettings(reloaded);setSavedSettings(reloaded)
      setToast(skippedTrips?`تم استيراد النسخة. تم تجاهل ${skippedTrips} رحلة تالفة`:'تم استيراد النسخة الاحتياطية')
    }catch{setToast('تعذر حفظ النسخة الاحتياطية على هذا الجهاز')}
  }
  const exportCsv=()=>{
    const headers=locale==='ar'?['التاريخ','التطبيق','الأجرة المدخلة','صافي الأجرة','المسافة كم','الوقت دقيقة','التكلفة','صافي الربح','ربح الساعة','القرار']:['Date','Platform','Entered fare','Net fare','Distance km','Time minutes','Cost','Net profit','Hourly profit','Decision']
    const rows=trips.map(t=>[t.createdAt,t.app,t.fare,t.netFare,t.totalKm,t.totalMinutes,t.totalCost,t.netProfit,t.hourlyProfit,t.decision])
    const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n')
    downloadFile('\ufeff'+csv,'driver-trips.csv','text/csv;charset=utf-8')
  }
  const decisionKey={accept:'اقبل الرحلة',review:'راجع الرحلة',reject:'ارفض الرحلة'} as const
  const decisionLabel={accept:tr(decisionKey.accept),review:tr(decisionKey.review),reject:tr(decisionKey.reject)}
  const decisionClass={accept:'good',review:'warn',reject:'bad'}
  const savedProfit=trips.reduce((s,t)=>s+t.netProfit,0)
  // Voice commands only navigate or report. They never accept, reject, move or delete a trip.
  const runVoiceCommand=(intent:VoiceIntent)=>{
    switch(intent){
      case 'calculate':
        setPage('calculator')
        setToast(`${decisionKey[result.decision]}. صافي الربح ${moneyText(result.netProfit)}`)
        break
      case 'last-trip': {
        if(trips.length===0){setToast('لا توجد رحلات محفوظة بعد');break}
        const last=[...trips].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]
        setPage('history')
        setToast(`آخر رحلة: ${decisionKey[last.decision]} · صافي الربح ${moneyText(last.netProfit)}`)
        break
      }
      case 'open-inbox':
        setPage('inbox')
        break
      case 'unconfirmed-offers': {
        const unconfirmedStatuses=['received','parsed','needs-review','parse-error']
        const open=inbox.filter(item=>unconfirmedStatuses.includes(item.status)).length
        setPage('inbox')
        setToast(open?`عندك ${open} عرض غير مؤكد`:'مفيش عروض غير مؤكدة')
        break
      }
      case 'start-review':
        setPage('inbox')
        setToast('اختر العرض وراجع الحقول قبل التأكيد')
        break
      case 'cancel':
        setToast('تم إلغاء الأمر')
        break
      case 'unknown':
        setToast('الأمر غير مفهوم')
        break
    }
  }
  return <div className="app-shell" data-locale={locale}>
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><ScaleIcon/></div><div><strong>{tr('حاسبة عدالة المشاوير')}</strong><small>DRIVER PROFIT CALCULATOR</small></div></div>
      <div className="top-actions"><button type="button" className="utility-btn" onClick={()=>setLocale(v=>v==="ar"?"en":"ar")} aria-label={tr(locale==='ar'?'التبديل إلى الإنجليزية':'التبديل إلى العربية')}>{locale==='ar'?'English':tr('العربية')}</button><button type="button" className="utility-btn" onClick={()=>setTheme(v=>v==="dark"?"light":"dark")} aria-label={tr(theme==='dark'?(locale==='ar'?'التبديل للوضع الفاتح':'التبديل للوضع الداكن'):(locale==='ar'?'التبديل للوضع الداكن':'التبديل للوضع الفاتح'))}>{tr(theme==='dark'?'الوضع الفاتح':'الوضع الداكن')}</button><span className="free-tag"><ShieldCheck size={14}/> {tr('مجاني 100%')}</span><span className="local-tag"><span/> {tr('حفظ محلي')}</span></div>
    </header>
    <nav className="nav" aria-label={tr('التنقل الرئيسي')}>{nav.map(n=><button key={n.id} className={page===n.id?'active':''} aria-current={page===n.id?'page':undefined} onClick={()=>setPage(n.id)}><n.icon size={17}/>{tr(n.label)}{n.id==='inbox'&&inbox.filter(item=>item.status!=='rejected'&&item.status!=='dismissed'&&item.status!=='transferred').length>0?<b>{inbox.filter(item=>item.status!=='rejected'&&item.status!=='dismissed'&&item.status!=='transferred').length}</b>:null}</button>)}</nav>
    <main className={`main main-${page}`} id="main-content">
      {inboxStorageMessage&&<div className="inbox-storage-alert" role="alert"><span>{translateMessage(inboxStorageMessage,locale)}</span>{inboxSaveFailed&&<button type="button" onClick={()=>void commitInbox(inbox)}>{tr('إعادة محاولة الحفظ')}</button>}</div>}
      <VoiceCommandBar onCommand={runVoiceCommand} locale={locale}/>
      {page==='calculator'&&<><section className="hero"><div><span className="eyebrow">{tr('قرار أذكى • ربح أوضح')}</span><h1>{tr('احسبها قبل ما تقبل المشوار')}</h1><p>{tr('اعرف تكلفة الرحلة وصافي ربحك الحقيقي في ثوانٍ.')}</p></div><div className="hero-stat"><Gauge size={26}/><span>{tr('القرار بيتحسب تلقائيًا')}</span></div></section>
        <section className="templates"><div className="section-head"><h2>{tr('نماذج جاهزة للاختبار السريع')}</h2><span>{tr('اضغط لملء الحقول')}</span></div><div className="template-grid">{templates.map(t=><button className="template" key={t.name} onClick={()=>loadTemplate(t.trip)}><strong>{tr(t.name)}</strong><small>{tr(t.desc)}</small></button>)}</div></section>
        <div className="work-grid"><section className="panel form-panel"><div className="panel-head"><div><span className="eyebrow">{tr('بيانات العرض')}</span><h2><CarFront/> {tr('بيانات المشوار المقترح')}</h2></div><button className="subtle-btn" onClick={()=>setTrip(EMPTY_TRIP)}><RotateCcw size={15}/> {tr('تفريغ الحقول')}</button></div>
          <div className="app-select">{(['Uber','DiDi','inDrive','أخرى'] as AppName[]).map(a=><button key={a} className={trip.app===a?'selected':''} aria-pressed={trip.app===a} onClick={()=>{patch('app',a);patch('commissionRate',settings.commission[a]??0);patch('fareMode',a==='Uber'?'net':'unknown')}}>{a==='أخرى'?tr('أخرى'):a}</button>)}</div>
          <Field label={tr('الأجرة المعروضة')} value={trip.fare} onChange={v=>patch('fare',v??0)} unit={tr('ج.م')}/>
          <div className="field"><span>{tr('نوع الأجرة')}</span><div className="choice-row">
            <button className={trip.fareMode==='net'?'chosen':''} aria-pressed={trip.fareMode==='net'} onClick={()=>patch('fareMode','net')}>{tr('صافي للسائق')}</button>
            <button className={trip.fareMode==='gross'?'chosen':''} aria-pressed={trip.fareMode==='gross'} onClick={()=>patch('fareMode','gross')}>{tr('إجمالي قبل العمولة')}</button>
            <button className={trip.fareMode==='unknown'?'chosen':''} aria-pressed={trip.fareMode==='unknown'} onClick={()=>patch('fareMode','unknown')}>{tr('غير متأكد')}</button>
          </div></div>
          {trip.fareMode==='gross'&&<Field label={tr('نسبة عمولة التطبيق')} value={trip.commissionRate} onChange={v=>patch('commissionRate',v??0)} unit="%"/>}
          <div className="field-grid">
            <Field label={tr('مسافة الوصول للراكب')} value={trip.pickupKm} onChange={v=>patch('pickupKm',v??0)} unit={tr('كم')}/>
            <Field label={tr('مسافة الرحلة بالراكب')} value={trip.passengerKm} onChange={v=>patch('passengerKm',v??0)} unit="كم"/>
            <Field label={tr('العودة الفارغة')} value={trip.returnKm} onChange={v=>patch('returnKm',v??0)} unit="كم"/>
            <Field label={tr('الوقت الإجمالي')} value={trip.totalMinutes} onChange={v=>patch('totalMinutes',v??0)} unit={tr('دقيقة')}/>
            <Field label={tr('مصروفات إضافية')} value={trip.extraExpenses} onChange={v=>patch('extraExpenses',v??0)} unit="ج.م"/>
          </div>
          <label className="field"><span>{tr('ملاحظات اختيارية')}</span><textarea rows={2} dir="auto" value={trip.notes} onChange={e=>patch('notes',e.target.value)} placeholder={tr('أي تفاصيل تساعدك في مراجعة الرحلة...')}/></label>
          {trip.fareMode==='unknown'&&<div className="inline-alert">{tr('حدد نوع الأجرة قبل حفظ الرحلة. لن نفترض أن المبلغ صافي أو نخصم عمولة تلقائيًا.')}</div>}
          <button className="primary-btn full" onClick={saveCurrent}><Save size={17}/> {tr('حفظ الرحلة في السجل')}</button>
        </section>
        <section className="panel result-panel"><div className="panel-head"><div><span className="eyebrow">{tr('التحليل المالي')}</span><h2><Activity/> {tr('قرار الرحلة النهائي')}</h2></div><button className="icon-btn" onClick={speak} title={tr('نطق القرار')}>{speaking?<MicOff/>:<Mic/>}</button></div>
          <div className={`decision ${decisionClass[result.decision]}`}><div className="decision-mark">{result.decision==='accept'?'✓':result.decision==='review'?'!':'×'}</div><div><strong>{decisionLabel[result.decision]}</strong><p>{translateMessage(result.decisionReason,locale)}</p></div></div>
          <div className="profit-highlight"><small>{trip.fareMode==='unknown'?tr('ربح تقديري — أكد نوع الأجرة أولًا'):tr('صافي ربحك المتوقع')}</small><strong className={result.netProfit>=0?'positive':'negative'}>{moneyText(result.netProfit)}</strong><span>{tr('بعد الوقود والصيانة والمصروفات')}</span></div>
          <div className="metric-grid">
            <Metric label={tr('إجمالي المسافة')} value={`${result.totalKm.toFixed(2)} ${tr('كم')}`}/>
            <Metric label={tr('تكلفة الوقود')} value={moneyText(result.fuelCost)}/>
            <Metric label={tr('الصيانة والإهلاك')} value={moneyText(result.maintenanceCost)}/>
            <Metric label={tr('إجمالي تكلفة التشغيل')} value={moneyText(result.totalCost)}/>
            <Metric label={tr('صافي الأجرة')} value={moneyText(result.netFare)}/>
            <Metric label={tr('الربح في الساعة')} value={moneyText(result.hourlyProfit)}/>
          </div>
          <div className="required-fare"><div><span>{tr('الحد الأدنى للأجرة المطلوبة')}</span><strong>{moneyText(result.requiredFare)}</strong></div><div><span>{tr('الفرق عن الأجرة الحالية')}</span><strong className={result.fareGap<=0?'positive':'negative'}>{result.fareGap<=0?'+'+moneyText(Math.abs(result.fareGap)):'-'+moneyText(result.fareGap)}</strong></div></div>
          <p className="formula-note">{trip.fareMode==='unknown'?tr('الأرقام المعروضة تقديرية مؤقتًا بافتراض أن الأجرة صافية؛ لا تعتمد القرار ولا تحفظ الرحلة قبل تحديد نوع الأجرة.'):tr('الحساب يفترض أن كل المسافات المدخلة فعلية، وأن الأجرة الصافية لا تُخصم منها عمولة مرة ثانية.')}</p>
        </section></div>
      </>}
      {page==='assistant'&&<section className="panel assistant-panel"><div className="panel-head"><div><span className="eyebrow">{tr('قراءة بموافقتك')}</span><h2><FileImage/> {tr('المساعد الذكي لالتقاط الرحلات')}</h2><p>{tr('ارفع Screenshot واضحة من شاشة العرض. راجع القيم قبل إرسالها للحاسبة.')}</p></div></div>
        <div className="capture-info"><ShieldCheck/><div><strong>{tr('خصوصيتك أولًا')}</strong><p>{tr('المعالجة تتم داخل المتصفح. لا يتم حفظ صورة الرحلة أو نصها الخام في سجل الرحلات.')}</p></div></div>
        <label className="upload-zone"><Upload size={32}/><strong>{tr('اختر Screenshot من جهازك')}</strong><span>{tr('PNG أو JPG — يفضل لقطة شاشة أصلية وليست صورة بالكاميرا')}</span><input type="file" accept="image/png,image/jpeg" onChange={e=>{void uploadImage(e.target.files?.[0]);e.currentTarget.value=''}}/></label>
        <div className="capture-share-hint"><strong>{tr('مشاركة Screenshot من تطبيق الرحلات')}</strong><p>{tr('خذ لقطة شاشة من تطبيق الرحلات، افتحها في المعرض، ثم اضغط مشاركة واختر حاسبة عدالة المشاوير. ستصل الصورة هنا تلقائيًا لمراجعتها.')}</p></div>
        {busy&&<div className="progress-wrap"><span>{translateMessage(`جاري قراءة الصورة ${progress}%`,locale)}</span><div><i style={{width:`${progress}%`}}/></div></div>}
        <div className="capture-warning"><strong>{tr('تنبيه بخصوص Android')}</strong><p>{tr('لا نراقب شاشة التطبيقات الأخرى ولا نلتقطها في الخلفية. استقبل فقط الصورة التي تختار مشاركتها معنا من قائمة مشاركة Android، أو اخترها من جهازك.')}</p></div>
        {draft&&<div className="ocr-review"><div className="section-head"><h3>{tr('راجع البيانات المستخرجة')}</h3><span>{tr('ثقة OCR:')} {Math.round(draft.confidence)}%</span></div>
          <div className="field-grid">
            <div className="field"><span>{tr('التطبيق')}</span><select value={draft.app} onChange={e=>setDraft({...draft,app:e.target.value as AppName})}>{['Uber','DiDi','inDrive','أخرى'].map(x=><option key={x}>{x==='أخرى'?tr('أخرى'):x}</option>)}</select></div>
            <Field label={tr('الأجرة')} allowEmpty value={draft.fare} onChange={v=>setDraft({...draft,fare:v})} unit="ج.م"/>
            <div className="field"><span>{tr('نوع الأجرة')}</span><select value={draft.fareMode} onChange={e=>setDraft({...draft,fareMode:e.target.value as FareMode})}><option value="unknown">{tr('غير متأكد')}</option><option value="net">{tr('صافي')}</option><option value="gross">{tr('إجمالي')}</option></select></div>
            <Field label={tr('مسافة الوصول')} allowEmpty value={draft.pickupKm} onChange={v=>setDraft({...draft,pickupKm:v})} unit="كم"/>
            <Field label={tr('مسافة الرحلة')} allowEmpty value={draft.passengerKm} onChange={v=>setDraft({...draft,passengerKm:v})} unit="كم"/>
            <Field label={tr('الوقت')} allowEmpty value={draft.totalMinutes} onChange={v=>setDraft({...draft,totalMinutes:v})} unit="دقيقة"/>
          </div>
          {draft.warnings.map((w,index)=><div className="inline-alert" key={index}>{translateMessage(w,locale)}</div>)}
          <details><summary>{tr('عرض نص OCR للمراجعة فقط')}</summary><pre>{draft.rawText}</pre></details>
          <button className="primary-btn" onClick={useDraft}><Check size={17}/> {tr('إضافة لصندوق المراجعة')}</button>
          <button className="subtle-btn" onClick={()=>setDraft(null)}><X size={16}/> {tr('إلغاء')}</button>
        </div>}
      </section>}
      {page==='inbox'&&!inboxReady&&<section className="panel" role="status">{tr('جارٍ استعادة صندوق الرحلات المحفوظ على هذا الجهاز…')}</section>}
      {page==='inbox'&&inboxReady&&<AssistantInbox items={inbox} onChange={commitInbox} onTransfer={transferConfirmedOffer} locale={locale}/>}
      {page==='history'&&<section className="panel"><div className="panel-head"><div><span className="eyebrow">{tr('بيانات محفوظة على جهازك')}</span><h2><History/> {tr('سجل الرحلات')}</h2></div><button className="subtle-btn" onClick={exportCsv}><Download size={16}/> {tr('تصدير CSV')}</button></div>
        {trips.length===0?<Empty title={tr('لسه مفيش رحلات محفوظة')} text={tr('احسب أول مشوار واحفظه علشان يظهر هنا.')}/>:<div className="table-wrap"><table><thead><tr><th>{tr('التاريخ')}</th><th>{tr('التطبيق')}</th><th>{tr('الأجرة')}</th><th>{tr('المسافة')}</th><th>{tr('صافي الربح')}</th><th>{tr('القرار')}</th><th></th></tr></thead><tbody>{trips.map(t=><tr key={t.id}><td>{new Date(t.createdAt).toLocaleString(locale==='ar'?'ar-EG':'en-EG')}</td><td>{t.app}</td><td>{moneyText(t.fare)}</td><td>{t.totalKm.toFixed(1)} {tr('كم')}</td><td className={t.netProfit>=0?'positive':'negative'}>{moneyText(t.netProfit)}</td><td><span className={`pill ${decisionClass[t.decision]}`}>{decisionLabel[t.decision]}</span></td><td><button className="danger-icon" onClick={()=>removeTrip(t.id)} title={tr('حذف')}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>}
      </section>}
      {page==='reports'&&<section className="panel"><div className="panel-head"><div><span className="eyebrow">{tr('ملخص السجل المحفوظ')}</span><h2><LayoutDashboard/> {tr('التقارير والإحصائيات')}</h2></div></div>
        <div className="report-grid"><Metric label={tr('عدد الرحلات')} value={String(trips.length)}/><Metric label={tr('إجمالي الأجرة الصافية')} value={moneyText(trips.reduce((s,t)=>s+t.netFare,0))}/><Metric label={tr('إجمالي التشغيل')} value={moneyText(trips.reduce((s,t)=>s+t.totalCost,0))}/><Metric label={tr('صافي الربح')} value={moneyText(savedProfit)}/><Metric label={tr('إجمالي المسافات')} value={`${trips.reduce((s,t)=>s+t.totalKm,0).toFixed(1)} ${tr('كم')}`}/><Metric label={tr('إجمالي الوقت')} value={`${trips.reduce((s,t)=>s+t.totalMinutes,0)} ${tr('دقيقة')}`}/></div>
        <div className="section-head"><h3>{tr('مقارنة حسب التطبيق')}</h3></div><div className="table-wrap"><table><thead><tr><th>{tr('التطبيق')}</th><th>{tr('عدد الرحلات')}</th><th>{tr('صافي الربح')}</th><th>{tr('متوسط الربح')}</th></tr></thead><tbody>{(['Uber','DiDi','inDrive','أخرى'] as AppName[]).map(a=>{const list=trips.filter(t=>t.app===a);const sum=list.reduce((s,t)=>s+t.netProfit,0);return <tr key={a}><td>{a==='أخرى'?tr('أخرى'):a}</td><td>{list.length}</td><td>{moneyText(sum)}</td><td>{moneyText(list.length?sum/list.length:0)}</td></tr>})}</tbody></table></div>
      </section>}
      {page==='settings'&&<section className="panel"><div className="panel-head"><div><span className="eyebrow">{tr('تحكم في افتراضات الحساب')}</span><h2><SettingsIcon/> {tr('الإعدادات')}</h2></div><button className="primary-btn" onClick={persistSettings}><Save size={16}/> {tr('حفظ الإعدادات')}</button></div>
        <div className="field-grid settings-grid">
          <Field label={tr('سعر لتر البنزين')} value={settings.fuelPrice} onChange={v=>updateSettings('fuelPrice',v??0)} unit="ج.م"/>
          <Field label={tr('استهلاك السيارة لكل 100 كم')} value={settings.consumptionPer100} onChange={v=>updateSettings('consumptionPer100',v??0)} unit={tr('لتر')}/>
          <Field label={tr('الصيانة والإهلاك لكل كم')} value={settings.maintenancePerKm} onChange={v=>updateSettings('maintenancePerKm',v??0)} unit="ج.م"/>
          <Field label={tr('الحد الأدنى لصافي الرحلة')} value={settings.minNetProfit} onChange={v=>updateSettings('minNetProfit',v??0)} unit="ج.م"/>
          <Field label={tr('هدف الربح في الساعة')} value={settings.hourlyTarget} onChange={v=>updateSettings('hourlyTarget',v??0)} unit="ج.م"/>
          <Field label={tr('مسافة العودة الافتراضية')} allowEmpty value={settings.defaultReturnKm} onChange={v=>setSettings(s=>({...s,defaultReturnKm:v}))} unit="كم"/>
          <Field label={tr('المصروفات الإضافية للرحلة')} allowEmpty value={settings.defaultExtraExpenses} onChange={v=>setSettings(s=>({...s,defaultExtraExpenses:v}))} unit="ج.م"/>
        </div>
        <p className="formula-note">{tr('مسافة العودة والمصروفات الإضافية لا تأتي من الإشعار. اتركها فارغة إن لم تعرفها؛ التطبيق لا يفترض لها صفرًا ولا يعرض صافي ربح قبل تحديدها. صفر قيمة مقصودة.')}</p>
        <div className="section-head"><h3>{tr('عمولة التطبيقات (اختيارية)')}</h3><span>{tr('كل تطبيق له نسبته المستقلة. القيمة 0% افتراضية حتى تُدخل نسبتك، وتُستخدم عند اختيار أجرة إجمالية')}</span></div>
        <div className="field-grid">{(['Uber','inDrive','DiDi','أخرى'] as const).map(a=><Field label={`${tr('عمولة')} ${a==='أخرى'?tr('أخرى'):a}`} value={settings.commission[a]} onChange={v=>setSettings(s=>({...s,commission:{...s.commission,[a]:v??0}}))} unit="%"/>)}</div>
        <div className="backup-actions"><button className="subtle-btn" onClick={exportBackup}><Download size={16}/> {tr('تصدير نسخة احتياطية')}</button><label className="subtle-btn file-button"><Upload size={16}/> {tr('استيراد نسخة احتياطية')}<input type="file" accept="application/json" onChange={e=>importBackup(e.target.files?.[0])}/></label><button className="subtle-btn" onClick={()=>{if(confirm(tr('إعادة الإعدادات الافتراضية؟')))setSettings(DEFAULT_SETTINGS)}}><RotateCcw size={16}/> {tr('استعادة الافتراضي')}</button></div>
        <p className="formula-note">{tr('البيانات محفوظة محليًا في هذا المتصفح باستخدام IndexedDB. مسح بيانات المتصفح قد يؤدي إلى حذفها؛ صدّر نسخة احتياطية بانتظام.')}</p>
      </section>}
    </main>
    <footer><span>{tr('حاسبة عدالة المشاوير')}</span><span>{tr('مجانية 100% • بياناتك على جهازك')}</span></footer>
    {toast&&<div className="toast" role="status" aria-live="polite">{translateMessage(toast,locale)}</div>}
  </div>
}
function Metric({label,value}:{label:string;value:string}){return <div className="metric"><span>{label}</span><strong>{value}</strong></div>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty-state"><Archive size={32}/><strong>{title}</strong><p>{text}</p></div>}
function ScaleIcon(){return <Wallet size={24}/>}
function downloadFile(content:string,name:string,type:string){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
