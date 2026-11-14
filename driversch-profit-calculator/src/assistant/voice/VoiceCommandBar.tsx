import { useEffect, useRef, useState } from 'react'
import { Check, Mic, MicOff, X } from 'lucide-react'
import { parseVoiceCommand, VOICE_HELP_TEXT, VOICE_INTENT_LABEL, type VoiceIntent } from './voiceCommands'
import './voice-command.css'

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
interface NativeVoiceBridge {
  startSpeechRecognition: () => boolean
  stopSpeechRecognition: () => boolean
}
interface NativeVoiceEventDetail { type: string; value?: string }
declare global { interface Window { DriverAndroid?: NativeVoiceBridge } }

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const PERMISSION_TEXT = 'لم تُمنح صلاحية الميكروفون. فعّلها من إعدادات الجهاز ثم حاول مرة أخرى.'
const ERROR_TEXT: Record<string, string> = {
  'not-allowed': PERMISSION_TEXT,
  'service-not-allowed': PERMISSION_TEXT,
  'no-speech': 'ما سمعتش صوت. اضغط الزر وتكلم بعد ما يبدأ الاستماع.',
  'audio-capture': 'مفيش ميكروفون متاح على الجهاز.',
  network: 'التعرف على الصوت يحتاج اتصالًا بالإنترنت في هذا المتصفح.'
}
type Phase = 'idle' | 'listening' | 'confirm' | 'error'
interface Props { onCommand: (intent: VoiceIntent) => void }

export default function VoiceCommandBar({ onCommand }: Props) {
  const native = typeof window === 'undefined' ? undefined : window.DriverAndroid
  const nativeSupported = typeof native?.startSpeechRecognition === 'function'
  const supported = nativeSupported || getRecognitionCtor() !== null
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [intent, setIntent] = useState<VoiceIntent>('unknown')
  const [message, setMessage] = useState('')
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
        const errors: Record<string, string> = {
          'not-allowed': PERMISSION_TEXT,
          'recognition-unavailable': 'خدمة التعرف على الصوت غير متاحة على هذا الجهاز.',
          'no-speech': 'ما سمعتش صوت. اضغط الزر وتكلم بعد ما يبدأ الاستماع.',
          network: 'خدمة التعرف على الصوت واجهت مشكلة في الشبكة.',
          busy: 'خدمة التعرف على الصوت مشغولة. حاول بعد لحظة.'
        }
        setMessage(errors[detail.value ?? ''] ?? 'حصل خطأ في التعرف على الصوت. حاول مرة أخرى.')
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
      if (!native.startSpeechRecognition()) {
        setMessage('تعذر بدء التعرف الصوتي على Android.')
        setPhase('error')
      }
      return
    }
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    recognitionRef.current?.abort()
    const recognition = new Ctor()
    recognition.lang = 'ar-EG'
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
      setMessage(ERROR_TEXT[event.error] ?? 'حصل خطأ في التعرف على الصوت. حاول مرة أخرى.')
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
      setMessage('تعذر بدء الاستماع. حاول مرة أخرى.')
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

  if (!supported) return <section className="voice-bar"><p className="voice-note">التعرف على الصوت غير مدعوم في هذا المتصفح. جرّب Chrome أو تطبيق Android.</p></section>

  return (
    <section className="voice-bar" aria-live="polite">
      <div className="voice-head">
        {phase === 'listening' ? (
          <button type="button" className="subtle-btn" onClick={stopListening}><MicOff size={16} /> إيقاف الاستماع</button>
        ) : (
          <button type="button" className="primary-btn" onClick={startListening} disabled={phase === 'confirm'}><Mic size={16} /> أمر صوتي</button>
        )}
        {phase === 'listening' && <span className="voice-status">جارٍ الاستماع… تكلم الآن</span>}
      </div>
      {phase === 'confirm' && (
        <div className="voice-confirm">
          <p>سمعت: <strong>"{heard}"</strong></p>
          <p>الأمر: <strong>{VOICE_INTENT_LABEL[intent]}</strong></p>
          {intent === 'unknown' ? <p className="voice-note">{VOICE_HELP_TEXT}</p> : (
            <button type="button" className="primary-btn" onClick={confirm}><Check size={16} /> نفّذ الأمر</button>
          )}
          <button type="button" className="subtle-btn" onClick={dismiss}><X size={16} /> تجاهل</button>
        </div>
      )}
      {phase === 'error' && <p className="inline-alert" role="alert">{message}</p>}
      <p className="voice-note">
        {nativeSupported
          ? 'التعرف الصوتي الأصلي يبدأ فقط عند ضغطك على الزر. يطلب التطبيق إذن الميكروفون وقت الاستخدام ولا يحفظ التسجيل.'
          : 'التعرف يبدأ فقط عند ضغطك على الزر، ولا يعمل في الخلفية. لا يتم حفظ أي تسجيل صوتي داخل التطبيق. في Chrome قد يُرسل الصوت لخدمة التعرف عند جوجل ويحتاج اتصالًا بالإنترنت.'}
      </p>
    </section>
  )
}
