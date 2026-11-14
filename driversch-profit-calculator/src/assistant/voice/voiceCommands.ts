import { toAsciiDigits } from '../../lib/numericInput.ts'

/**
 * Arabic voice command parser. Pure text-to-intent logic: no browser APIs, no storage.
 * Commands only navigate or read. None of them accepts, rejects, moves or deletes a trip.
 */

export type VoiceIntent =
  | 'calculate'
  | 'last-trip'
  | 'open-inbox'
  | 'unconfirmed-offers'
  | 'start-review'
  | 'cancel'
  | 'unknown'

export interface VoiceCommandResult {
  intent: VoiceIntent
  /** The transcript after normalization, shown to the user for confirmation. */
  normalized: string
}

/** Turns Arabic text into a comparable form: no diacritics, unified letters, western digits. */
export function normalizeArabicSpeech(text: string): string {
  return toAsciiDigits(text)
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '') // tashkeel and Quranic marks
    .replace(/ـ/g, '') // tatweel
    .replace(/[آأإ]/g, 'ا') // alef variants -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0)) // Persian digits
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Each rule is checked in order; the first phrase that appears in the transcript wins. */
const RULE_SOURCES: Array<{ intent: VoiceIntent; phrases: string[] }> = [
  { intent: 'cancel', phrases: ['إلغاء', 'الغ', 'الغي'] },
  { intent: 'last-trip', phrases: ['اخر رحله', 'اخر مشوار', 'اخر حاجه اتسجلت'] },
  { intent: 'unconfirmed-offers', phrases: ['غير المؤكده', 'غير مؤكده', 'الغير مؤكده', 'مش متاكد', 'مش مؤكده', 'مش مؤكد'] },
  { intent: 'start-review', phrases: ['ابدأ مراجعة', 'مراجعة رحلة', 'راجع رحلة', 'راجع العرض', 'مراجعة'] },
  { intent: 'open-inbox', phrases: ['صندوق', 'افتح الصندوق', 'صندوق الرحلات', 'الرحلات الملتقطة'] },
  { intent: 'calculate', phrases: ['احسب', 'حساب', 'صافي الربح'] }
]

// Phrases go through the same normalization as the transcript, so spelling variants match.
const RULES = RULE_SOURCES.map(rule => ({
  intent: rule.intent,
  phrases: rule.phrases.map(normalizeArabicSpeech)
}))

/** Matches whole words only, so "الغ" does not match inside "الغير". */
function containsPhrase(text: string, phrase: string): boolean {
  const padded = ` ${text} `
  return padded.includes(` ${phrase} `)
}

export function parseVoiceCommand(transcript: string): VoiceCommandResult {
  const normalized = normalizeArabicSpeech(transcript)
  if (!normalized) return { intent: 'unknown', normalized }
  for (const rule of RULES) {
    if (rule.phrases.some(phrase => containsPhrase(normalized, phrase))) {
      return { intent: rule.intent, normalized }
    }
  }
  return { intent: 'unknown', normalized }
}

/** Arabic label for a confirmed command, shown before it runs. */
export const VOICE_INTENT_LABEL: Record<VoiceIntent, string> = {
  calculate: 'احسب المشوار في الحاسبة',
  'last-trip': 'اعرض آخر رحلة محفوظة',
  'open-inbox': 'افتح صندوق الرحلات الملتقطة',
  'unconfirmed-offers': 'اعرض العروض غير المؤكدة',
  'start-review': 'ابدأ مراجعة عرض',
  cancel: 'إلغاء الأمر',
  unknown: 'الأمر غير مفهوم'
}

export const VOICE_HELP_TEXT = 'جرّب: احسب المشوار، آخر رحلة، صندوق الرحلات، العروض غير المؤكدة، ابدأ مراجعة، إلغاء.'
