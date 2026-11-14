import { useMemo, useState } from 'react'
import { AlertCircle, Archive, Check, ChevronDown, CircleHelp, ClipboardPaste, RotateCcw, ShieldAlert, Trash2, X } from 'lucide-react'
import { createInboxItem, markInboxParsed, requestInboxReview, updateInboxDraft, confirmInboxItem, rejectInboxItem, hasRequiredReviewData } from './inbox'
import { parseRideOffer } from './parser'
import type { InboxItem, RideFieldName, RideOfferDraft, RideProvider } from './types'
import './assistant-inbox.css'

interface Props {
  items: InboxItem[]
  onChange: (items: InboxItem[]) => void
  onTransfer: (item: InboxItem) => void
}

const providerLabels: Record<RideProvider, string> = {
  uber: 'Uber', didi: 'DiDi', indrive: 'inDrive', unknown: 'غير محدد'
}
const statusLabels: Record<InboxItem['status'], string> = {
  received: 'وصل حديثًا', parsed: 'تم التحليل', 'needs-review': 'في انتظار المراجعة',
  confirmed: 'تم التأكيد', rejected: 'مرفوض', dismissed: 'محذوف', 'parse-error': 'تعذر التحليل'
}
const fieldLabels: Record<'fare' | 'distanceKm' | 'pickupDistanceKm' | 'durationMinutes', string> = {
  fare: 'الأجرة المعروضة', distanceKm: 'مسافة الرحلة بالراكب',
  pickupDistanceKm: 'مسافة الوصول للراكب', durationMinutes: 'المدة المتوقعة'
}
const formatValue = (field: keyof typeof fieldLabels, value: number | null) => {
  if (value === null) return 'غير متوفر'
  if (field === 'fare') return `${value.toLocaleString('ar-EG')} جنيه`
  if (field === 'durationMinutes') return `${value.toLocaleString('ar-EG')} دقيقة`
  return `${value.toLocaleString('ar-EG')} كم`
}
const newId = () => globalThis.crypto?.randomUUID?.() ?? `offer-${Date.now()}-${Math.random().toString(36).slice(2)}`

export default function AssistantInbox({ items, onChange, onTransfer }: Props) {
  const [sourceText, setSourceText] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [reviewed, setReviewed] = useState<Record<string, string[]>>({})
  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId])
  const active = items.filter(item => item.status !== 'dismissed' && item.status !== 'rejected')
  const addOffer = () => {
    const text = sourceText.trim()
    if (!text) { setError('الصق نص إشعار أو تفاصيل العرض أولًا.'); return }
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
          warnings: ['تعذر تحليل النص. يمكنك إدخال البيانات يدويًا.'], createdAt: now.toISOString()
        },
        createdAt: now.toISOString(), updatedAt: now.toISOString()
      }
      onChange([failed, ...items]); setSelectedId(failed.id); setError('')
    }
  }
  const update = (item: InboxItem, draft: RideOfferDraft) =>
    onChange(items.map(current => current.id === item.id ? updateInboxDraft(current, draft) : current))
  const setManualField = (item: InboxItem, field: 'fare' | 'distanceKm' | 'pickupDistanceKm' | 'durationMinutes', raw: string) => {
    const value = raw === '' ? null : Number(raw)
    if (value !== null && (!Number.isFinite(value) || value < 0)) return
    const evidence = value === null ? [] : [{ text: 'تم الإدخال أو التصحيح يدويًا', start: 0, end: 0 }]
    const draft: RideOfferDraft = {
      ...item.draft,
      fields: { ...item.draft.fields, [field]: {
        value, confidence: value === null ? 0 : 1, evidence,
        status: value === null ? 'missing' : 'candidate'
      }}
    }
    update(item, draft)
  }
  const setProvider = (item: InboxItem, provider: RideProvider) =>
    update(item, { ...item.draft, provider, providerConfidence: provider === 'unknown' ? 0 : 1 })
  const confirm = (item: InboxItem) => {
    const next = confirmInboxItem(item, (reviewed[item.id] ?? []) as Array<'fare' | 'pickupDistanceKm' | 'distanceKm' | 'durationMinutes'>)
    if (next.status !== 'confirmed') { setError('لا يمكن التأكيد قبل إدخال الأجرة والمسافة والمدة ومراجعتها.'); return }
    onChange(items.map(current => current.id === item.id ? next : current))
    setError('')
  }
  const reject = (item: InboxItem) => {
    if (!window.confirm('هل تريد رفض هذا العرض؟ سيظل ظاهرًا في العناصر المرفوضة.')) return
    onChange(items.map(current => current.id === item.id ? rejectInboxItem(current) : current))
    setSelectedId(null)
  }
  const remove = (item: InboxItem) => {
    if (!window.confirm('حذف العرض من صندوق الوارد؟ لا يمكن التراجع عن الحذف.')) return
    onChange(items.filter(current => current.id !== item.id))
    setSelectedId(null)
  }
  const transfer = (item: InboxItem) => {
    if (item.status !== 'confirmed') { setError('أكد العرض بعد مراجعته قبل نقله للحاسبة.'); return }
    onTransfer(item)
  }

  return <section className="panel assistant-inbox" dir="rtl" aria-labelledby="inbox-title">
    <div className="panel-head">
      <div><span className="eyebrow">مراجعة قبل الحساب</span><h2 id="inbox-title"><Archive/> صندوق الرحلات الملتقطة</h2>
        <p>العروض هنا لا تُحفظ في سجل الرحلات ولا تُرسل للحاسبة إلا بعد تأكيدك.</p></div>
      <span className="inbox-count" aria-label={`عدد العروض ${active.length}`}>{active.length} عرض</span>
    </div>

    <div className="inbox-capture">
      <label htmlFor="ride-offer-text">إضافة عرض يدويًا أو لصق نص إشعار</label>
      <textarea id="ride-offer-text" rows={3} value={sourceText} onChange={event => setSourceText(event.target.value)}
        placeholder="الصق نص العرض هنا… مثال: inDrive — القبول مقابل 165 جنيه — 22 كم — 40 دقيقة" />
      <div className="inbox-capture-actions"><small>المتصفح لا يستطيع قراءة إشعارات تطبيقات Android الأخرى تلقائيًا.</small>
        <button className="primary-btn" type="button" onClick={addOffer}><ClipboardPaste size={16}/> تحليل وإضافة للإنبوكس</button></div>
      {error && <p className="inbox-error" role="alert"><AlertCircle size={15}/>{error}</p>}
    </div>

    <div className="inbox-layout">
      <div className="inbox-list" aria-label="قائمة العروض">
        {items.length === 0 ? <div className="empty-state"><Archive size={34}/><strong>صندوق الوارد فارغ</strong>
          <p>الصق نص عرض رحلة في الأعلى لبدء المراجعة. لا توجد بيانات تجريبية محفوظة.</p></div> :
          items.map(item => <button type="button" key={item.id} className={`inbox-row ${selectedId === item.id ? 'is-selected' : ''}`}
            onClick={() => { setSelectedId(item.id); setError('') }}>
            <span className="inbox-row-top"><strong>{providerLabels[item.draft.provider]}</strong><span className={`inbox-status status-${item.status}`}>{statusLabels[item.status]}</span></span>
            <span>{formatValue('fare', item.draft.fields.fare.value)} · {formatValue('distanceKm', item.draft.fields.distanceKm.value)}</span>
            <small>{new Date(item.createdAt).toLocaleString('ar-EG')}</small>
          </button>)}
      </div>

      <div className="inbox-detail">
        {!selected ? <div className="inbox-hint"><CircleHelp size={30}/><strong>اختار عرض من القائمة</strong><span>هتظهر هنا تفاصيل الاستخراج والمراجعة.</span></div> :
          <div className="inbox-review">
            <div className="inbox-review-head"><div><span className="eyebrow">تفاصيل العرض</span><h3>{providerLabels[selected.draft.provider]}</h3></div>
              <span className={`inbox-status status-${selected.status}`}>{statusLabels[selected.status]}</span></div>
            <label className="inbox-field"><span>تطبيق النقل</span><select value={selected.draft.provider} disabled={selected.status === 'confirmed' || selected.status === 'rejected'}
              onChange={event => setProvider(selected, event.target.value as RideProvider)}>
              <option value="unknown">غير محدد — اختر يدويًا</option><option value="uber">Uber</option><option value="didi">DiDi</option><option value="indrive">inDrive</option>
            </select></label>
            <div className="inbox-fields">
              {(['fare', 'pickupDistanceKm', 'distanceKm', 'durationMinutes'] as const).map(field => {
                const candidate = selected.draft.fields[field]
                const needsReview = candidate.value === null || candidate.confidence < 0.85 || candidate.status !== 'candidate'
                return <label className={`inbox-field ${needsReview ? 'needs-review' : ''}`} key={field}>
                  <span>{fieldLabels[field]} {needsReview && <b>مطلوب مراجعة</b>}</span>
                  <div className="inbox-input"><input type="number" min="0" step="any" inputMode="decimal" value={candidate.value ?? ''}
                    disabled={selected.status === 'confirmed' || selected.status === 'rejected'}
                    onChange={event => setManualField(selected, field, event.target.value)} placeholder="أدخل القيمة"/>
                    <small>{field === 'fare' ? 'جنيه' : field === 'durationMinutes' ? 'دقيقة' : 'كم'}</small></div>
                  <label className="inbox-reviewed"><input type="checkbox" checked={(reviewed[selected.id] ?? []).includes(field)} disabled={selected.status === 'confirmed' || selected.status === 'rejected'} onChange={event => setReviewed(current => ({ ...current, [selected.id]: event.target.checked ? [...(current[selected.id] ?? []), field] : (current[selected.id] ?? []).filter(value => value !== field) }))}/> راجعت هذه القيمة وأؤكدها</label>
                  <small className="inbox-confidence">الثقة: {Math.round(candidate.confidence * 100)}% · {candidate.evidence.length ? 'الدليل: ' + candidate.evidence.map(e => e.text).join('، ') : 'لا يوجد دليل مستخرج'}</small>
                </label>
              })}
            </div>
            <div className="inbox-source"><strong>مصدر البيانات</strong><span>{selected.draft.source === 'notification' ? 'إشعار مستلم من جسر Android' : selected.draft.source === 'screenshot' ? 'صورة شاشة' : 'إدخال أو لصق يدوي'}</span>
              <details><summary>عرض النص الأصلي للمراجعة</summary><pre>{selected.draft.rawText}</pre></details>
            </div>
            {selected.draft.warnings.map((warning, index) => <p className="inbox-warning" key={index}><ShieldAlert size={15}/>{warning}</p>)}
            {selected.status !== 'confirmed' && selected.status !== 'rejected' && <div className="inbox-actions">
              <button className="primary-btn" type="button" onClick={() => confirm(selected)} disabled={!hasRequiredReviewData(selected) || (reviewed[selected.id] ?? []).length < 4}><Check size={16}/> تأكيد العرض بعد المراجعة</button>
              <button className="subtle-btn" type="button" onClick={() => reject(selected)}><X size={16}/> رفض</button>
              <button className="inbox-delete" type="button" onClick={() => remove(selected)}><Trash2 size={16}/> حذف</button>
            </div>}
            {selected.status === 'confirmed' && <div className="inbox-actions"><button className="primary-btn" type="button" onClick={() => transfer(selected)}><ChevronDown size={16}/> نقل العرض المؤكد للحاسبة</button>
              <button className="inbox-delete" type="button" onClick={() => remove(selected)}><Trash2 size={16}/> حذف</button></div>}
            {selected.status === 'rejected' && <div className="inbox-actions"><button className="inbox-delete" type="button" onClick={() => remove(selected)}><Trash2 size={16}/> حذف نهائي</button></div>}
          </div>}
      </div>
    </div>
    <div className="inbox-native-note"><ShieldAlert size={17}/><p><strong>تكامل Android لاحقًا:</strong> استقبال الإشعارات يتطلب تطبيقًا أصليًا يستخدم NotificationListenerService بعد موافقة المستخدم. صفحة الويب لا تقرأ إشعارات Uber أو DiDi أو inDrive بنفسها.</p></div>
  </section>
}

function emptyField<T>() {
  return { value: null as T | null, confidence: 0, evidence: [], status: 'missing' as const }
}
