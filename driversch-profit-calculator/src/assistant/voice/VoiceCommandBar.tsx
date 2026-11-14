import { useEffect, useRef, useState } from 'react'
import { Check, Mic, MicOff, X } from 'lucide-react'
import { parseVoiceCommand, VOICE_HELP_TEXT, VOICE_INTENT_LABEL, type VoiceIntent } from './voiceCommands'
import './voice-command.css'
import { t, type TranslationKey } from '../../lib/i18n'

interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionEventLike { results: ArrayLike<ArrayLike<SpeechRecognitionAlternativeLike>> }
interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike
interface NativeVoiceEventDetail { type: string; value?: string }

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const PERMISSION_TEXT: TranslationKey = 'لم تُمنح صلاحية الميكروفون. فعّلها من إعدادات الجهاز ثم حاول مرة أخرى.'
const ERROR_TEXT: Record<string, TranslationKey> = {
  'not-allowed': PERMISSION_TEXT,
  'service-not-allowed': PERMISSION_TEXT,
  'no-speech': 'ما سمعتش صوت. اضغط الزر وتكلم بعد ما يبدأ الاستماع.' as TranslationKey,
  'audio-capture': 'مفيش ميكروفون متاح على الجهاز.',
  network: 'التعرف على الصوت يحتاج اتصالًا بالإنترنت في هذا المتصفح.'
}
type Phase = 'idle' | 'listening' | 'confirm' | 'error'
interface Props { onCommand: (intent: VoiceIntent) => void; locale: 'ar' | 'en' }

export default function VoiceCommandBar({ onCommand, locale }: Props) {
  const native = typeof window === 'undefined' ? undefined : window.DriverAndroid
  const nativeSupported = typeof native?.startSpeechRecognition === 'function'
  const supported = nativeSupported || getRecognitionCtor() !== null
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [intent, setIntent] = useState<VoiceIntent>('unknown')
  const [message, setMessage] = useState<TranslationKey | ''>('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const handleNativeVoice = (event: Event) => {
      const detail = (event as CustomEvent<NativeVoiceEventDetail>).detail
      if (!detail) return
      if (detail.type === 'result') {
        const transcript = detail.value ?? ''
        setHeard(transcript)
        setIntent(parseVoiceCommand(transcript).intent)
        setMessage('')
        setPhase('confirm')
      } else if (detail.type === 'error') {
        const errors: Record<string, TranslationKey> = {
          'not-allowed': PERMISSION_TEXT,
          'recognition-unavailable': 'خدمة التعرف على الصوت غير متاحة على هذا الجهاز.' as TranslationKey,
          'no-speech': 'ما سمعتش صوت. اضغط الزر وتكلم بعد ما يبدأ الاستماع.' as TranslationKey,
          network: 'خدمة التعرف على الصوت واجهت مشكلة في الشبكة.' as TranslationKey,
          busy: 'خدمة التعرف على الصوت مشغولة. حاول بعد لحظة.' as TranslationKey
        }
        setMessage(errors[detail.value ?? ''] ?? 'حصل خطأ في التعرف على الصوت. حاول مرة أخرى.' as TranslationKey)
        setPhase('error')
      } else if (detail.type === 'stopped') {
        setPhase(current => current === 'listening' ? 'idle' : current)
      }
    }
    window.addEventListener('driverandroidvoice', handleNativeVoice)
    return () => window.removeEventListener('driverandroidvoice', handleNativeVoice)
  }, [])

  useEffect(() => () => {
    recognitionRef.current?.abort()
    native?.stopSpeechRecognition()
  }, [native])

  const startListening = () => {
    if (nativeSupported && native) {
      setHeard('')
      setMessage('')
      setPhase('listening')
      if (!native.startSpeechRecognition(locale === 'ar' ? 'ar-EG' : 'en-US')) {
        setMessage('تعذر بدء التعرف الصوتي على Android.' as TranslationKey)
        setPhase('error')
      }
      return
    }
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    recognitionRef.current?.abort()
    const recognition = new Ctor()
    recognition.lang = locale === 'ar' ? 'ar-EG' : 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      setHeard(transcript)
      setIntent(parseVoiceCommand(transcript).intent)
      setMessage('')
      setPhase('confirm')
    }
    recognition.onerror = event => {
      if (event.error === 'aborted') { setPhase('idle'); return }
      setMessage(ERROR_TEXT[event.error] ?? 'حصل خطأ في التعرف على الصوت. حاول مرة أخرى.' as TranslationKey)
      setPhase('error')
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setPhase(current => current === 'listening' ? 'idle' : current)
    }
    recognitionRef.current = recognition
    setHeard('')
    setMessage('')
    setPhase('listening')
    try { recognition.start() } catch {
      recognitionRef.current = null
      setMessage('تعذر بدء الاستماع. حاول مرة أخرى.' as TranslationKey)
      setPhase('error')
    }
  }

  const stopListening = () => {
    if (nativeSupported) native?.stopSpeechRecognition()
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setPhase('idle')
  }
  const confirm = () => { onCommand(intent); setHeard(''); setPhase('idle') }
  const dismiss = () => { if (nativeSupported) native?.stopSpeechRecognition(); setHeard(''); setPhase('idle') }

  if (!supported) return <section className="voice-bar"><p className="voice-note">{t('التعرف على الصوت غير مدعوم في هذا المتصفح. جرّب Chrome أو تطبيق Android.', locale)}</p></section>

  return (
    <section className="voice-bar" aria-live="polite">
      <div className="voice-head">
        {phase === 'listening' ? (
          <button type="button" className="subtle-btn" onClick={stopListening}><MicOff size={16} /> {t('إيقاف الاستماع', locale)}</button>
        ) : (
          <button type="button" className="primary-btn" onClick={startListening} disabled={phase === 'confirm'}><Mic size={16} /> {t('أمر صوتي', locale)}</button>
        )}
        {phase === 'listening' && <span className="voice-status">{t('جارٍ الاستماع… تكلم الآن', locale)}</span>}
      </div>
      {phase === 'confirm' && (
        <div className="voice-confirm">
          <p>{t('سمعت:', locale)} <strong>"{heard}"</strong></p>
          <p>{t('الأمر:', locale)} <strong>{t(VOICE_INTENT_LABEL[intent] as TranslationKey, locale)}</strong></p>
          {intent === 'unknown' ? <p className="voice-note">{t(VOICE_HELP_TEXT as TranslationKey, locale)}</p> : (
            <button type="button" className="primary-btn" onClick={confirm}><Check size={16} /> {t('نفّذ الأمر', locale)}</button>
          )}
          <button type="button" className="subtle-btn" onClick={dismiss}><X size={16} /> {t('تجاهل', locale)}</button>
        </div>
      )}
      {phase === 'error' && <p className="inline-alert" role="alert">{t(message, locale)}</p>}
      <p className="voice-note">
        {nativeSupported
          ? 'التعرف الصوتي الأصلي يبدأ فقط عند ضغطك على الزر. يطلب التطبيق إذن الميكروفون وقت الاستخدام ولا يحفظ التسجيل. يطلب وضع عدم الاتصال من خدمة Android، لكن توفره يعتمد على محرك الجهاز وقد تُعالج الخدمة الصوت خارجيًا.' as TranslationKey
          : 'التعرف يبدأ فقط عند ضغطك على الزر، ولا يعمل في الخلفية. لا يتم حفظ أي تسجيل صوتي داخل التطبيق. في Chrome قد يُرسل الصوت لخدمة التعرف عند جوجل ويحتاج اتصالًا بالإنترنت.' as TranslationKey}
      </p>
    </section>
  )
}
