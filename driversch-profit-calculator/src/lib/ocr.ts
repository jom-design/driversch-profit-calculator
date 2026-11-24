import { createWorker } from 'tesseract.js'
import { normalizeDigits, parseLocalizedNumber, parseDistance, parseDuration } from './numberParser'
import type { AppName, FareMode } from '../types'

export interface OcrDraft {
  app: AppName
  fare: number | null
  fareMode: FareMode
  pickupKm: number | null
  passengerKm: number | null
  totalMinutes: number | null
  rawText: string
  confidence: number
  warnings: string[]
}
function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) { const m = text.match(p); if (m?.[1]) return m[1] }
  return null
}

/**
 * OCR must not infer which of two unlabelled distances is pickup vs passenger distance.
 * Only explicit labels are accepted; ambiguous screenshots leave the fields for manual review.
 */
export function extractOcrDistances(text: string): { pickupKm: number | null; passengerKm: number | null } {
  const normalized = normalizeDigits(text)
  const distance = (patterns: RegExp[]) => {
    const value = firstMatch(normalized, patterns)
    return value ? parseDistance(value) : null
  }
  return {
    pickupKm: distance([
      /(?:مسافة\\s+(?:الوصول|الاستلام)|المسافة\\s+إلى\\s+الراكب|pickup(?:\\s+distance)?|to\\s+pickup)\\s*[:：-]?\\s*([\\d.,]+\\s*(?:متر|م\\b|كم|كلم|كيلومتر|km\\b))/i
    ]),
    passengerKm: distance([
      /(?:مسافة\\s+(?:الرحلة|الركاب)|المسافة\\s+بالراكب|trip\\s+distance|passenger\\s+distance)\\s*[:：-]?\\s*([\\d.,]+\\s*(?:متر|م\\b|كم|كلم|كيلومتر|km\\b))/i
    ])
  }
}
export async function readTripImage(file: File, onProgress?: (p: number) => void): Promise<OcrDraft> {
  const worker = await createWorker('ara+eng', 1, {
    logger: m => { if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100)) }
  })
  try {
    const { data } = await worker.recognize(file)
    const rawText = normalizeDigits(data.text)
    const lower = rawText.toLowerCase()
    const app: AppName = /uberx|uber|صافي رسوم الخدمة/i.test(lower) ? 'Uber'
      : /indrive|in drive|اقترح أجرتك|القبول مقابل/i.test(lower) ? 'inDrive'
      : /didi|ديدي/i.test(lower) ? 'DiDi' : 'أخرى'

    let fareText: string | null = null
    if (app === 'inDrive') {
      fareText = firstMatch(rawText, [
        /القبول\s*مقابل\s*([\d٠-٩۰-۹.,]+)\s*(?:EGP|جنيه|ج\.م)?/i,
        /قبول\s*مقابل\s*([\d٠-٩۰-۹.,]+)/i
      ])
    } else if (app === 'Uber') {
      fareText = firstMatch(rawText, [
        /صافي\s*رسوم\s*الخدمة[^\d]{0,20}([\d٠-٩۰-۹.,]+)/i,
        /(?:EGP|ج\.م|جنيه)\s*([\d٠-٩۰-۹.,]+)/i
      ])
    } else {
      fareText = firstMatch(rawText, [/(?:الأجرة|السعر|المبلغ)[^\d]{0,20}([\d٠-٩۰-۹.,]+)/i])
    }
    const fare = fareText ? parseLocalizedNumber(fareText) : null
    const distances = extractOcrDistances(rawText)
    const totalMinutes = parseDuration(rawText)
    const warnings: string[] = []
    if (fare === null) warnings.push('لم أتمكن من تحديد الأجرة بشكل موثوق؛ أدخلها يدويًا.')
    if (app === 'inDrive' && fare !== null) warnings.push('تأكد أن المبلغ هو الموجود بجوار «القبول مقابل» وليس أحد أزرار الاقتراح.')
    if (app === 'Uber' && !/صافي\s*رسوم\s*الخدمة/i.test(rawText)) warnings.push('لم يتم تأكيد أن أجرة Uber صافية؛ راجع طريقة احتساب العمولة.')
    if (distances.pickupKm === null || distances.passengerKm === null) warnings.push('لم أتمكن من ربط كل مسافة بتسمية واضحة؛ أدخل مسافة الوصول ومسافة الرحلة يدويًا.')
    if (data.confidence < 70) warnings.push('جودة القراءة منخفضة. الأفضل رفع Screenshot أصلية بدل تصوير الشاشة بالكاميرا.')
    return {
      app, fare, fareMode: app === 'Uber' && /صافي\s*رسوم\s*الخدمة/i.test(rawText) ? 'net' : 'unknown',
      pickupKm: distances.pickupKm,
      passengerKm: distances.passengerKm,
      totalMinutes, rawText, confidence: data.confidence, warnings
    }
  } finally {
    await worker.terminate()
  }
}
