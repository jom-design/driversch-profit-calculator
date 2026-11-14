import type { OcrDraft } from '../lib/ocr'
import { createInboxItem, markInboxParsed, requestInboxReview } from './inbox.ts'
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
  const validNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
  if (!ocr || typeof ocr !== 'object' || typeof id !== 'string' || !id.trim() ||
      !['Uber', 'DiDi', 'inDrive', 'Ø£Ø®Ø±Ù‰'].includes(ocr.app) ||
      !['net', 'gross', 'unknown'].includes(ocr.fareMode) ||
      !validNumber(ocr.fare) || !validNumber(ocr.pickupKm) ||
      !validNumber(ocr.passengerKm) || !validNumber(ocr.totalMinutes) ||
      typeof ocr.rawText !== 'string' || !Number.isFinite(ocr.confidence) ||
      ocr.confidence < 0 || ocr.confidence > 100 ||
      !Array.isArray(ocr.warnings) || !ocr.warnings.every(warning => typeof warning === 'string')) {
    throw new TypeError('Invalid OCR draft payload')
  }
  const provider: RideProvider = ocr.app === 'Uber' ? 'uber'
    : ocr.app === 'DiDi' ? 'didi'
    : ocr.app === 'inDrive' ? 'indrive' : 'unknown'
  const draft: RideOfferDraft = {
    provider,
    providerConfidence: 0,
    source: 'screenshot',
    rawText: ocr.r¶»§q«^