import { useEffect, useRef, useState } from 'react'
import { Check, Mic, MicOff, X } from 'lucide-react'
import { parseVoiceCommand, VOICE_HELP_TEXT, VOICE_INTENT_LABEL, type VoiceIntent } from './voiceCommands'
import './voice-command.css'

/* Minimal typings for the Web Speech API, which TypeScript's DOM lib does not include. */
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

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const PERMISSION_TEXT = 'لم تُمنح صلاحية الميكروفون. فعّلها من إعدادات المتصفح ثم حاول مرة أخرى.'
const ERROR_TEXT: Record<string, string> = {
  'not-allowed': PERMISSION_TEXT,
  'service-not-allowed': PERMISSION_TEXT,
  'no-speech': 'ما سمعتش صوت. اضغط الزر وتكلم بعد ما يبدأ الاستماع.',
  'audio-capture': 'مفيش ميكروفون متاح على الجهاز.',
  network: 'التعرف على الصوت يحتاج اتصالًا بالإنترنت في هذا المتصفح.'
}

type Phase = 'idle' | 'listening' | 'confirm' | 'error'

interface Props {
  /** Runs only after the user confirms the heard command. Commands never change trip data. */
  onCommand: (intent: VoiceIntent) => void
}

export default function VoiceCommandBar({ onCommand }: Props) {
  const supported = getRecognitionCtor() !== null
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [intent, setIntent] = useState<VoiceIntent>('unknown')
  const [message, setMessage] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // Stop listening when the screen is left, so the microphone never stays open in the background.
  useEffect(() => () => { recognitionRef.current?.abort() }, [])

  const startListening = () => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    recognitionRef.current?.abort()
    const recognition = new Ctor()
    recognition.lang = 'ar-EG'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = event => {
      const text = event.results[0]?.[0]?.transcript ?? ''
      setHeard(text)
      setIntent(parseVoiceCommand(text).intent)
      setMessage('')
      setPhase('confirm')
    }
    recognition.onerror = event => {
      if (event.error === 'aborted') {
        setPhase('idle')
        return
      }
      setMessage(ERROR_TEXT[event.error] ?? 'حصل خطأ في التعرف على الصوت. حاول مرة أخرى.')
      setPhase('error')
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setPhase(current => (current === 'listening' ? 'idle' : current))
    }
    recognitionRef.current = recognition
    setHeard('')
    setMessage('')
    setPhase('listening')
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setMessage('تعذر بدء الاستماع. حاول مرة أخرى.')
      setPhase('error')
    }
  }

  const stopListening = () => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setPhase('idle')
  }

  const confirm = () => {
    onCommand(intent)
    setHeard('')
    setPhase('idle')
  }

  const dismiss = () => {
    setHeard('')
    setPhase('idle')
  }

  if (!supported) {
    return (
      <section className="voice-bar">
        <p className="voice-note">التعرف على الصوت غير مدعوم في هذا المتصفح. جرّب Chrome على الأندرويد أو الكمبيوتر.</p>
      </section>
    )
  }

  return (
    <section className="voice-bar" aria-live="polite">
      <div className="voice-head">
        {phase === 'listening' ? (
          <button type="button" className="subtle-btn" onClick={stopListening}>
            <MicOff size={16} /> إيقاف الاستماع
          </button>
        ) : (
          <button type="button" className="primary-btn" onClick={startListening} disabled={phase === 'confirm'}>
            <Mic size={16} /> أمر صوتي
          </button>
        )}
        {phase === 'listening' && <span className="voice-status">جارٍ الاستماع… تكلم الآن</span>}
      </div>

      {phase === 'confirm' && (
        <div className="voice-confirm">
          <p>سمعت: <strong>"{heard}"</strong></p>
          <p>الأمر: <strong>{VOICE_INTENT_LABEL[intent]}</strong></p>
          {intent === 'unknown' ? (
            <p className="voice-note">{VOICE_HELP_TEXT}</p>
          ) : (
            <button type="button" className="primary-btn" onClick={confirm}>
              <Check size={16} /> نفّذ الأمر
            </button>
          )}
          <button type="button" className="subtle-btn" onClick={dismiss}>
            <X size={16} /> تجاهل
          </button>
        </div>
      )}

      {phase === 'error' && <p className="inline-alert" role="alert">{message}</p>}

      <p className="voice-note">
        التعرف يبدأ فقط عند ضغطك على الزر، ولا يعمل في الخلفية. لا يتم حفظ أي تسجيل صوتي داخل التطبيق.
        في Chrome قد يُرسل الصوت لخدمة التعرف عند جوجل ويحتاج اتصالًا بالإنترنت.
      </p>
    </section>
  )
}
