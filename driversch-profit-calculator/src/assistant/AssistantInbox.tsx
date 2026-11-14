import { useMemo, useState } from 'react'
import { AlertCircle, Archive, Check, ChevronDown, CircleHelp, ClipboardPaste, ShieldAlert, Trash2, X } from 'lucide-react'
import { createInboxItem, markInboxParsed, requestInboxReview, updateInboxDraft, confirmInboxItem, rejectInboxItem, hasRequiredReviewData, deleteInboxItem, setInboxFieldReviewed } from './inbox'
import { parseRideOffer } from './parser'
import type { InboxItem, RideOfferDraft, RideProvider } from './types'
import { detectBrowserCapabilities, type BrowserRuntimeLike } from '../platform/browserCapabilities'
import AndroidNotificationPanel from './AndroidNotificationPanel'
import NumericInput from '../components/NumericInput'
import { acceptNativeNotification, type NativeNotificationPayload } from './notificationBridge'
import './assistant-inbox.css'
import { t, translateMessage, type TranslationKey } from '../lib/i18n'

interface Props {
  locale: 'ar' | 'en'
  items: InboxItem[]
  onChange: (items: InboxItem[]) => void | Promise<boolean>
  onTransfer: (item: InboxItem) => void
}

const providerLabels: Record<RideProvider, string> = {
  uber: 'Uber', didi: 'DiDi', indrive: 'inDrive', unknown: 'غير محدد'
}
const statusLabels: Record<InboxItem['status'], string> = {
  received: 'وصل حديثًا', parsed: 'تم التحليل', 'needs-review': 'في انتظار المراجعة',
  confirmed: 'تم التأكيد', rejected: 'مرفوض', dismissed: 'محذوف', 'parse-error': 'تعذر التحليل', transferred: 'تم النقل للحاسبة'
}
const fieldLabels: Record<'fare' | 'distanceKm' | 'pickupDistanceKm' | 'durationMinutes', string> = {
  fare: 'الأجرة المعروضة', distanceKm: 'مسافة الرحلة بالراكب',
  pickupDistanceKm: 'مسافة الوصول للراكب', durationMinutes: 'المدة المتوقعة'
}
const formatValue = (field: keyof typeof fieldLabels, value: number | null, locale: 'ar' | 'en') => {
  if (value === null) return t('غير متوفر', locale)
  if (field === 'fare') return `${value.toLocaleString(locale==='ar'?'ar-EG':'en-EG')} ${t('جنيه', locale)}`
  if (field === 'durationMinutes') return `${value.toLocaleString(locale==='ar'?'ar-EG':'en-EG')} ${t('دقيقة', locale)}`
  return `${value.toLocaleString(locale==='ar'?'ar-EG':'en-EG')} ${t('كم', locale)}`
}
const newId = () => globalThis.crypto?.randomUUID?.() ?? `offer-${Date.now()}-${Math.random().toString(36).slice(2)}`

export default function AssistantInbox({ items, onChange, onTransfer, locale }: Props) {
  const [sourceText, setSourceText] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const capabilities = detectBrowserCapabilities(window as unknown as BrowserRuntimeLike)
  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId])
  const active = items.filter(item => item.status !== 'dismissed' && item.status !== 'rejected' && item.status !== 'transferred')
  const addOffer = () => {
    const text = sourceText.trim()
    if (!text) { setError('الصق نص إشعار أو تفاصيل العرض أولًا.' as TranslationKey); return }
    try {
      const draft = parseRideOffer({ text, source: 'manual' })
      const now = new Date()
      const item = requestInboxReview(markInboxParsed(createInboxItem(draft, newId(), now), now), now)
      onChange([item, ...items])
      setSelectedId(item.id)
      setSourceText('')
      setError('')
    } catch {
      const now = new Date()
      const failed: InboxItem = {
        id: newId(), status: 'parse-error',
        draft: {
          provider: 'unknown', providerConfidence: 0, source: 'manual', rawText: text,
          fields: {
            fare: emptyField(), distanceKm: emptyField(), durationMinutes: emptyField(),
            pickupDistanceKm: emptyField(), currency: { ...emptyField<'EGP'>(), value: null }
          },
          warnings: [t('تعذر تحليل النص. يمكنك إدخال البيانات يدويًا.', locale)], createdAt: now.toISOString()
        },
        createdAt: now.toISOString(), updatedAt: now.toISOString(), reviewedFields: []
      }
      onChange([failed, ...items]); setSelectedId(failed.id); setError('')
    }
  }
  const update = (item: InboxItem, draft: RideOfferDraft) =>
    onChange(items.map(current => current.id === item.id ? updateInboxDraft(current, draft) : current))
  const setManualField = (item: InboxItem, field: 'fare' | 'distanceKm' | 'pickupDistanceKm' | 'durationMinutes', value: number | null) => {
    if (value !== null && (!Number.isFinite(value) || value < 0)) return
    const evidence = value === null ? [] : [{ text: '__manual_review__', start: 0, end: 0 }]
    const draft: RideOfferDraft = {
      ...item.draft,
      fields: { ...item.draft.fields, [field]: {
        value, confidence: value === null ? 0 : 1, evidence,
        status: value === null ? 'missing' : 'candidate'
      }}
    }
    const corrected = updateInboxDraft(item, draft)
    onChange(items.map(current => current.id === item.id ? setInboxFieldReviewed(corrected, field, false) : current))
  }
  const setProvider = (item: InboxItem, provider: RideProvider) =>
    update(item, { ...item.draft, provider, providerConfidence: provider === 'unknown' ? 0 : 1 })
  const setFieldReviewed = (item: InboxItem, field: 'fare' | 'pickupDistanceKm' | 'distanceKm' | 'durationMinutes', checked: boolean) =>
    onChange(items.map(current => current.id === item.id ? setInboxFieldReviewed(current, field, checked) : current))
  const confirm = (item: InboxItem) => {
    const next = confirmInboxItem(item, item.reviewedFields ?? [])
    if (next.status !== 'confirmed') { setError('لا يمكن التأكيد قبل إدخال الأجرة والمسافة والمدة ومراجعتها.' as TranslationKey); return }
    onChange(items.map(current => current.id === item.id ? next : current))
    setError('')
  }
  const reject = (item: InboxItem) => {
    if (!window.confirm(t('هل تريد رفض هذا العرض؟ سيظل ظاهرًا في العناصر المرفوضة.', locale))) return
    onChange(items.map(current => current.id === item.id ? rejectInboxItem(current) : current))
    setSelectedId(null)
  }
  const remove = (item: InboxItem) => {
    if (!window.confirm(t('حذف العرض من صندوق الوارد؟ لا يمكن التراجع عن الحذف.', locale))) return
    onChange(deleteInboxItem(items, item.id))
    setSelectedId(null)
  }
  const importNativeNotifications = async (payloads: NativeNotificationPayload[]): Promise<boolean> => {
    const seen = new Set(items.map(item => item.id))
    const next = [...items]
    for (const payload of payloads) {
      const item = acceptNativeNotification(payload, seen)
      if (item) next.unshift(item)
    }
    if (next.length === items.length) return true
    const saved = await onChange(next)
    return saved !== false
  }
  const transfer = (item: InboxItem) => {
    if (item.status !== 'confirmed') { setError('أكد العرض بعد مراجعته قبل نقله للحاسبة.' as TranslationKey); return }
    onTransfer(item)
  }

  return <section className="panel assistant-inbox" dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-labelledby="inbox-title">
    <div className="panel-head">
      <div><span className="eyebrow">{t('مراجعة قبل الحساب', locale)}</span><h2 id="inbox-title"><Archive/> {t('صندوق الرحلات الملتقطة', locale)}</h2>
        <p>{t('العروض هنا لا تُحفظ في سجل الرحلات ولا تُرسل للحاسبة إلا بعد تأكيدك.', locale)}</p></div>
      <span className="inbox-count" aria-label={`${t('عدد العروض', locale)} ${active.length}`}>{active.length} {t('عرض', locale)}</span>
    </div>

    <AndroidNotificationPanel onImport={importNativeNotifications} locale={locale} />

    <div className="inbox-capabilities" aria-label={t('قدرات المتصفح الحالية', locale)}>
      <span>{t('رفع الصور: متاح', locale)}</span>
      <span>{t('الميكروفون:', locale)} {capabilities.microphone ? t('واجهة API متاحة بعد الإذن', locale) : t('غير مدعوم', locale)}</span>
      <span>{t('التعرف الصوتي:', locale)} {capabilities.speechRecognition ? t('مدعوم', locale) : t('غير مدعوم', locale)}</span>
      <span>{t('مشاركة الشاشة:', locale)} {capabilities.screenCapture ? t('واجهة API متاحة بعد الإذن', locale) : t('غير مدعوم', locale)}</span>
    </div>

    <div className="inbox-capture">
      <label htmlFor="ride-offer-text">{t('إضافة عرض يدويًا أو لصق نص إشعار', locale)}</label>
      <textarea id="ride-offer-text" dir="auto" rows={3} value={sourceText} onChange={event => setSourceText(event.target.value)}
        placeholder={t('الصق نص العرض هنا… مثال: inDrive — القبول مقابل 165 جنيه — 22 كم — 40 دقيقة', locale)} />
      <div className="inbox-capture-actions"><small>{t('المتصفح لا يستطيع قراءة إشعارات تطبيقات Android الأخرى تلقائيًا.', locale)}</small>
        <button className="primary-btn" type="button" onClick={addOffer}><ClipboardPaste size={16}/> {t('تحليل وإضافة للإنبوكس', locale)}</button></div>
      {error && <p className="inbox-error" role="alert"><AlertCircle size={15}/>{error ? t(error as TranslationKey, locale) : ''}</p>}
    </div>

    <div className="inbox-layout">
      <div className="inbox-list" aria-label={t('قائمة العروض', locale)}>
        {items.length === 0 ? <div className="empty-state"><Archive size={34}/><strong>{t('صندوق الوارد فارغ', locale)}</strong>
          <p>{t('الصق نص عرض رحلة في الأعلى لبدء المراجعة. لا توجد بيانات تجريبية محفوظة.', locale)}</p></div> :
          items.map(item => <button type="button" key={item.id} className={`inbox-row ${selectedId === item.id ? 'is-selected' : ''}`}
            onClick={() => { setSelectedId(item.id); setError('') }}>
            <span className="inbox-row-top"><strong>{t(providerLabels[item.draft.provider] as TranslationKey, locale)}</strong><span className={`inbox-status status-${item.status}`}>{t(statusLabels[item.status] as TranslationKey, locale)}</span></span>
            <span>{formatValue('fare', item.draft.fields.fare.value, locale)} · {formatValue('distanceKm', item.draft.fields.distanceKm.value, locale)}</span>
            <small>{new Date(item.createdAt).toLocaleString(locale==='ar'?'ar-EG':'en-EG')}</small>
          </button>)}
      </div>

      <div className="inbox-detail">
        {!selected ? <div className="inbox-hint"><CircleHelp size={30}/><strong>{t('اختار عرض من القائمة', locale)}</strong><span>{t('هتظهر هنا تفاصيل الاستخراج والمراجعة.', locale)}</span></div> :
          <div className="inbox-review">
            <div className="inbox-review-head"><div><span className="eyebrow">{t('تفاصيل العرض', locale)}</span><h3>{t(providerLabels[selected.draft.provider] as TranslationKey, locale)}</h3></div>
              <span className={`inbox-status status-${selected.status}`}>{t(statusLabels[selected.status] as TranslationKey, locale)}</span></div>
            <label className="inbox-field"><span>{t('تطبيق النقل', locale)}</span><select value={selected.draft.provider} disabled={selected.status === 'confirmed' || selected.status === 'rejected' || selected.status === 'transferred'}
              onChange={event => setProvider(selected, event.target.value as RideProvider)}>
              <option value="unknown">{t('غير محدد — اختر يدويًا', locale)}</option><option value="uber">Uber</option><option value="didi">DiDi</option><option value="indrive">inDrive</option>
            </select></label>
            {selected.draft.nativeAnalysis && <section className="inbox-native-analysis" aria-live="polite">
              <strong>{t('تقدير مبدئي من محرك الربحية', locale)}</strong>
              <p>{t('مراجعة مطلوبة: التقدير لا يشمل مسافة العودة أو المصروفات الإضافية، وتأكد من نسبة العمولة.', locale)}</p>
              <div className="inbox-native-analysis-grid">
                <span>{t('صافي الربح التقديري', locale)}<b>{selected.draft.nativeAnalysis.netProfit.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 })} {t('جنيه', locale)}</b></span>
                <span>{t('الربح بالساعة', locale)}<b>{selected.draft.nativeAnalysis.hourlyProfit.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 })} {t('جنيه', locale)}</b></span>
                <span>{t('التكلفة التشغيلية', locale)}<b>{selected.draft.nativeAnalysis.totalCost.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 })} {t('جنيه', locale)}</b></span>
                <span>{t('الأجرة المطلوبة', locale)}<b>{selected.draft.nativeAnalysis.requiredFare.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 })} {t('جنيه', locale)}</b></span>
              </div>
            </section>}
            <div className="inbox-fields">
              {(['fare', 'pickupDistanceKm', 'distanceKm', 'durationMinutes'] as const).map(field => {
                const candidate = selected.draft.fields[field]
                const needsReview = candidate.value === null || candidate.confidence < 0.85 || candidate.status !== 'candidate'
                return <div className={`inbox-field ${needsReview ? 'needs-review' : ''}`} key={field}>
                  <span id={`inbox-field-label-${selected.id}-${field}`}>{t(fieldLabels[field] as TranslationKey, locale)} {needsReview && <b>{t('مطلوب مراجعة', locale)}</b>}</span>
                  <div className="inbox-input"><NumericInput allowEmpty aria-labelledby={`inbox-field-label-${selected.id}-${field}`} value={candidate.value}
                    disabled={selected.status === 'confirmed' || selected.status === 'rejected' || selected.status === 'transferred'}
                    onValueChange={value => setManualField(selected, field, value)} placeholder={t('أدخل القيمة', locale)}/>
                    <small>{field === 'fare' ? t('جنيه', locale) : field === 'durationMinutes' ? t('دقيقة', locale) : t('كم', locale)}</small></div>
                  <label className="inbox-reviewed"><input type="checkbox" checked={(selected.reviewedFields ?? []).includes(field)} disabled={selected.status === 'confirmed' || selected.status === 'rejected' || selected.status === 'transferred'} onChange={event => setFieldReviewed(selected, field, event.target.checked)}/> {t('راجعت هذه القيمة وأؤكدها', locale)}</label>
                  <small className="inbox-confidence">{t('الثقة:', locale)} {Math.round(candidate.confidence * 100)}% · {candidate.evidence.length ? t('الدليل:', locale) + ' ' + candidate.evidence.map(e => e.text === '__manual_review__' || e.text === 'تم الإدخال أو التصحيح يدويًا' ? t('تم الإدخال أو التصحيح يدويًا', locale) : e.text).join('، ') : t('لا يوجد دليل مستخرج', locale)}</small>
                </div>
              })}
            </div>
            <div className="inbox-source"><strong>{t('مصدر البيانات', locale)}</strong><span>{selected.draft.source === 'notification' ? t('إشعار مستلم من جسر Android', locale) : selected.draft.source === 'screenshot' ? t('صورة شاشة', locale) : t('إدخال أو لصق يدوي', locale)}</span>
              {selected.draft.sourceAppPackage && <span>{t('معرّف التطبيق:', locale)} {selected.draft.sourceAppPackage}</span>}
              {selected.draft.sourceTimestamp && <span>{t('وقت الإشعار:', locale)} {new Date(selected.draft.sourceTimestamp).toLocaleString(locale==='ar'?'ar-EG':'en-EG')}</span>}
              <details><summary>{t('عرض النص الأصلي للمراجعة', locale)}</summary><pre>{selected.draft.rawText}</pre></details>
            </div>
            {selected.draft.warnings.map((warning, index) => <p className="inbox-warning" key={index}><ShieldAlert size={15}/>{translateMessage(warning, locale)}</p>)}
            {selected.status !== 'confirmed' && selected.status !== 'rejected' && selected.status !== 'transferred' && <div className="inbox-actions">
              <button className="primary-btn" type="button" onClick={() => confirm(selected)} disabled={!hasRequiredReviewData(selected) || (selected.reviewedFields ?? []).length < 4}><Check size={16}/> {t('تأكيد العرض بعد المراجعة', locale)}</button>
              <button className="subtle-btn" type="button" onClick={() => reject(selected)}><X size={16}/> {t('رفض', locale)}</button>
              <button className="inbox-delete" type="button" onClick={() => remove(selected)}><Trash2 size={16}/> {t('حذف', locale)}</button>
            </div>}
            {selected.status === 'confirmed' && <div className="inbox-actions"><button className="primary-btn" type="button" onClick={() => transfer(selected)}><ChevronDown size={16}/> {t('نقل العرض المؤكد للحاسبة', locale)}</button>
              <button className="inbox-delete" type="button" onClick={() => remove(selected)}><Trash2 size={16}/> {t('حذف', locale)}</button></div>}
            {selected.status === 'rejected' && <div className="inbox-actions"><button className="inbox-delete" type="button" onClick={() => remove(selected)}><Trash2 size={16}/> {t('حذف نهائي', locale)}</button></div>}
            {selected.status === 'transferred' && <p className="inbox-success" role="status">{t('تم نقل هذا العرض للحاسبة بالفعل. لن يظهر زر النقل مرة أخرى.', locale)}</p>}
          </div>}
      </div>
    </div>
    <div className="inbox-native-note"><ShieldAlert size={17}/><p><strong>{t('تكامل Android لاحقًا:', locale)}</strong> {t('استقبال الإشعارات يتطلب تطبيقًا أصليًا يستخدم NotificationListenerService بعد موافقة المستخدم. صفحة الويب لا تقرأ إشعارات Uber أو DiDi أو inDrive بنفسها.', locale)}</p></div>
  </section>
}

function emptyField<T>() {
  return { value: null as T | null, confidence: 0, evidence: [], status: 'missing' as const }
}
