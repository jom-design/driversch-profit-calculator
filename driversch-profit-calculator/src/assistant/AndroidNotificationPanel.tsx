import { useCallback, useEffect, useState } from 'react'
import { BellRing, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import { isNativePayloadShape, type NativeNotificationPayload } from './notificationBridge'
import './android-notification-panel.css'
import { t, translateMessage, type TranslationKey } from '../lib/i18n'

interface NativeBridge {
  getStatusJson: () => string
  getPendingNotificationsJson: () => string
  acknowledgeNotification: (id: string) => boolean
  setProviderEnabled: (id: string, enabled: boolean) => boolean
  openNotificationAccessSettings: () => boolean
  startSpeechRecognition: (languageTag: string) => boolean
  setVoiceLanguage: (languageTag: string) => boolean
  setSystemTheme: (theme: string) => boolean
  stopSpeechRecognition: () => boolean
  speakText: (text: string) => boolean
  stopSpeaking: () => boolean
}
declare global {
  interface Window { DriverAndroid?: NativeBridge }
}
interface Status {
  isAndroid: boolean
  hasNotificationAccess: boolean
  serviceConnected: boolean
  enabledProviders: string[]
  lastReceivedAt: string
  queueHealthy: boolean
  /** Events journaled and waiting for processing. */
  queuedEvents?: number
  /** Aggregate counters from the native capture service. Names match CaptureCounterNames. */
  captureCounters?: Record<string, number>
}
/** Counters that mean an event was not stored or not processed. Duplicates and unsupported apps are normal. */
const FAILURE_COUNTERS = ['persistenceFailure', 'processingException', 'journalWriteFailed', 'journalReadFailed',
  'journalOverflow', 'journalDroppedStale', 'journalDroppedFailed', 'journalDroppedCorrupt']
function failureTotal(counters: Record<string, number> | undefined): number {
  return FAILURE_COUNTERS.reduce((sum, name) => sum + (typeof counters?.[name] === 'number' ? counters[name] : 0), 0)
}
interface Props {
  locale: 'ar' | 'en'
  onImport: (payloads: NativeNotificationPayload[]) => Promise<boolean>
}
const providers = [
  { id: 'uber', label: 'Uber Driver' },
  { id: 'didi', label: 'DiDi Driver' },
  { id: 'indrive', label: 'inDrive' }
] as const
export default function AndroidNotificationPanel({ onImport, locale }: Props) {
  const bridge = typeof window === 'undefined' ? undefined : window.DriverAndroid
  const [status, setStatus] = useState<Status | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [message, setMessage] = useState<TranslationKey | ''>('')
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    if (!bridge) return
    try {
      const next = JSON.parse(bridge.getStatusJson()) as Status
      const pending = JSON.parse(bridge.getPendingNotificationsJson()) as unknown
      setStatus(next)
      setPendingCount(Array.isArray(pending) ? pending.filter(isNativePayloadShape).length : 0)
      setMessage('')
    } catch {
      setMessage('تعذر قراءة حالة خدمة Android. أغلق التطبيق وافتحه مرة أخرى.' as TranslationKey)
    }
  }, [bridge])

  useEffect(() => { refresh() }, [refresh])

  const toggleProvider = (id: string, enabled: boolean) => {
    if (!bridge?.setProviderEnabled(id, enabled)) {
      setMessage('تعذر حفظ إعداد التطبيق على هذا الجهاز.' as TranslationKey)
      return
    }
    refresh()
  }

  const importPending = async () => {
    if (!bridge || !status?.hasNotificationAccess) return
    setBusy(true)
    setMessage('')
    try {
      const raw = JSON.parse(bridge.getPendingNotificationsJson()) as unknown
      const payloads = Array.isArray(raw) ? raw.filter(isNativePayloadShape) : []
      if (payloads.length === 0) {
        setMessage('لا توجد إشعارات رحلات جديدة في انتظار الاستيراد.' as TranslationKey)
        return
      }
      const saved = await onImport(payloads)
      if (!saved) {
        setMessage('لم يتم تأكيد الحفظ المحلي؛ ستظل الإشعارات في قائمة الانتظار لإعادة المحاولة.' as TranslationKey)
        return
      }
      let acknowledged = 0
      for (const payload of payloads) {
        if (bridge.acknowledgeNotification(payload.notificationId)) acknowledged += 1
      }
      setImportedCount(acknowledged)
      setMessage('تم استيراد إشعارات' as TranslationKey)
      refresh()
    } catch {
      setMessage('تعذر استيراد الإشعارات. لم يتم حذف قائمة الانتظار الأصلية.' as TranslationKey)
    } finally {
      setBusy(false)
    }
  }

  if (!bridge) return <section className="android-capture-panel">
    <div className="android-capture-heading"><BellRing/><div><strong>{t('التقاط إشعارات Android', locale)}</strong><p>{t('الميزة متاحة داخل تطبيق Android الأصلي فقط. نسخة المتصفح لا تستطيع قراءة إشعارات التطبيقات الأخرى.', locale)}</p></div></div>
    <p className="android-capture-note">{t('يمكنك الاستمرار في لصق نص العرض أو رفع Screenshot من هنا.', locale)}</p>
  </section>

  return <section className="android-capture-panel" aria-labelledby="android-capture-title">
    <div className="android-capture-heading"><ShieldCheck/><div><strong id="android-capture-title">{t('ربط إشعارات الرحلات', locale)}</strong><p>{t('لا تتم قراءة أي تطبيق إلا بعد تفعيله ومنح إذن Android صراحةً.', locale)}</p></div></div>
    <div className="android-capture-status">
      <span className={status?.hasNotificationAccess && status.serviceConnected ? 'is-connected' : 'is-disconnected'}>
        {status?.hasNotificationAccess ? (status.serviceConnected ? t('خدمة قراءة الإشعارات متصلة', locale) : t('الإذن مفعّل والخدمة غير متصلة بعد', locale)) : t('إذن قراءة الإشعارات غير مفعّل', locale)}
      </span>
      <button type="button" className="subtle-btn" onClick={refresh}><RefreshCw size={15}/> {t('تحديث الحالة', locale)}</button>
    </div>
    {(status?.queuedEvents ?? 0) > 0 && <p className="android-capture-message" role="status">{t('إشعارات بانتظار المعالجة', locale)}: {status?.queuedEvents}</p>}
    {(status?.captureCounters?.duplicate ?? 0) > 0 && <p className="android-capture-message" role="status">{t('تم تجاهل إشعارات مكررة ولم تُعالج مرتين', locale)}: {status?.captureCounters?.duplicate}</p>}
    {failureTotal(status?.captureCounters) > 0 && <p className="android-capture-message" role="alert">{t('تعذر حفظ أو معالجة بعض الإشعارات. تفاصيل العدادات محفوظة محليًا ولم يُحذف شيء من بيانات الرحلات.', locale)}: {failureTotal(status?.captureCounters)}</p>}
    <div className="android-provider-list">
      {providers.map(provider => <label key={provider.id} className="android-provider">
        <span>{provider.label}{provider.id === 'didi' && <small className="android-provider-note"> {t('غير مُتحقق منه على جهاز حقيقي؛ الالتقاط معطّل افتراضيًا', locale)}</small>}</span>
        <input type="checkbox" checked={status?.enabledProviders.includes(provider.id) ?? false}
          onChange={event => toggleProvider(provider.id, event.target.checked)} />
      </label>)}
    </div>
    <div className="android-capture-actions">
      <button type="button" className="subtle-btn" onClick={() => bridge.openNotificationAccessSettings()}>
        <ExternalLink size={15}/> {t('فتح إعدادات إذن الإشعارات', locale)}
      </button>
      <button type="button" className="primary-btn" disabled={busy || !status?.hasNotificationAccess || !status?.queueHealthy}
        onClick={importPending}><BellRing size={15}/> {busy ? t('جارٍ الاستيراد…', locale) : `${t('استيراد الإشعارات', locale)} (${pendingCount})`}</button>
    </div>
    {!status?.queueHealthy && <p className="android-capture-message" role="alert">{t('تعذر فك تشفير قائمة الإشعارات المحلية. تم إيقاف الاستيراد لحماية البيانات؛ لا تحذف بيانات التطبيق قبل تصدير ما يلزم.', locale)}</p>}
    {status?.lastReceivedAt && <small>{t('آخر إشعار مؤهل:', locale)} {new Date(status.lastReceivedAt).toLocaleString(locale==='ar'?'ar-EG':'en-EG')}</small>}
    <p className="android-capture-note">{t('الإشعارات المؤهلة تُحفظ مؤقتًا مشفّرة على الجهاز، ثم تُحذف من قائمة الانتظار بعد نجاح حفظها في IndexedDB. لا يوجد إرسال إلى خادم.', locale)}</p>
    {message && <p className="android-capture-message" role="status">{message === 'تم استيراد إشعارات' ? translateMessage(`تم استيراد ${importedCount?.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG') ?? 0} إشعار إلى صندوق المراجعة.`, locale) : t(message, locale)}</p>}
  </section>
}
