import type { OcrDraft } from '../lib/ocr'
import { createInboxItem, markInboxParsed, requestInboxReview } from './inbox'
import type { FieldCandidate, RideOfferDraft, RideProvider } from './types'

function candidate(value: number | null): FieldCandidate<number> {
  return {
    value,
    confidence: 0,
    evidence: [],
    status: value === null ? 'missing' : 'needs-review'
  }
}

export function ocrDraftToInboxItem(ocr: OcrDraft, id: string, now = new Date()) {
  const provider: RideProvider = ocr.app === 'Uber' ? 'uber'
    : ocr.app === 'DiDi' ? 'didi'
    : ocr.app === 'inDrive' ? 'indrive' : 'unknown'
  const draft: RideOfferDraft = {
    provider,
    providerConfidence: 0,
    source: 'screenshot',
    rawText: ocr.rawText,
    fields: {
      fare: candidate(ocr.fare),
      pickupDistanceKm: candidate(ocr.pickupKm),
      distanceKm: candidate(ocr.passengerKm),
      durationMinutes: candidate(ocr.totalMinutes),
      currency: { value: null, confidence: 0, evidence: [], status: 'missing' }
    },
    warnings: [...ocr.warnings, `جودة قراءة الصورة ${Math.round(ocr.confidence)}%؛ لا تمثل درجة ثقة مستقلة لكل حقل.`, 'راجع كل قيمة يدويًا؛ لم يتم اعتماد نوع الأجرة أو إرسالها للحاسبة.'],
    createdAt: now.toISOString()
  }
  const received = createInboxItem(draft, id, now)
  return requestInboxReview(markInboxParsed(received, now), now)
}
