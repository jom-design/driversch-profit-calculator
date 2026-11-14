import type { OcrDraft } from '../lib/ocr'
import { createInboxItem, markInboxParsed, requestInboxReview } from './inbox'
import type { FieldCandidate, RideOfferDraft, RideProvider } from './types'

function candidate(value: number | null, confidence: number, evidenceText: string): FieldCandidate<number> {
  return {
    value,
    confidence: value === null ? 0 : confidence,
    evidence: value === null || !evidenceText ? [] : [{ text: evidenceText.slice(0, 120), start: 0, end: Math.min(evidenceText.length, 120) }],
    status: value === null ? 'missing' : confidence >= 0.85 ? 'candidate' : 'needs-review'
  }
}

export function ocrDraftToInboxItem(ocr: OcrDraft, id: string, now = new Date()) {
  const provider: RideProvider = ocr.app === 'Uber' ? 'uber'
    : ocr.app === 'DiDi' ? 'didi'
    : ocr.app === 'inDrive' ? 'indrive' : 'unknown'
  const confidence = Math.max(0, Math.min(1, ocr.confidence / 100))
  const draft: RideOfferDraft = {
    provider,
    providerConfidence: provider === 'unknown' ? 0 : confidence,
    source: 'screenshot',
    rawText: ocr.rawText,
    fields: {
      fare: candidate(ocr.fare, confidence, ocr.rawText),
      pickupDistanceKm: candidate(ocr.pickupKm, confidence, ocr.rawText),
      distanceKm: candidate(ocr.passengerKm, confidence, ocr.rawText),
      durationMinutes: candidate(ocr.totalMinutes, confidence, ocr.rawText),
      currency: { value: null, confidence: 0, evidence: [], status: 'missing' }
    },
    warnings: [...ocr.warnings, 'راجع كل قيمة يدويًا؛ لم يتم اعتماد نوع الأجرة أو إرسالها للحاسبة.'],
    createdAt: now.toISOString()
  }
  const received = createInboxItem(draft, id, now)
  return requestInboxReview(markInboxParsed(received, now), now)
}
