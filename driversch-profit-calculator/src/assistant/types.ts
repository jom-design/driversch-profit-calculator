export type RideProvider = 'uber' | 'didi' | 'indrive' | 'unknown'
export type CaptureSource = 'notification' | 'screenshot' | 'camera' | 'manual' | 'web-share'

export type RideFieldName = 'fare' | 'distanceKm' | 'durationMinutes' | 'pickupDistanceKm' | 'currency'

export interface EvidenceSpan {
  text: string
  start: number
  end: number
}

export interface FieldCandidate<T> {
  value: T | null
  confidence: number
  evidence: EvidenceSpan[]
  status: 'missing' | 'candidate' | 'needs-review'
}

export interface RideOfferDraft {
  provider: RideProvider
  providerConfidence: number
  source: CaptureSource
  rawText: string
  sourceAppPackage?: string
  sourceAppLabel?: string
  sourceTimestamp?: string
  fields: {
    fare: FieldCandidate<number>
    distanceKm: FieldCandidate<number>
    durationMinutes: FieldCandidate<number>
    pickupDistanceKm: FieldCandidate<number>
    currency: FieldCandidate<'EGP'>
  }
  warnings: string[]
  createdAt: string
}

export type InboxStatus = 'received' | 'parsed' | 'needs-review' | 'confirmed' | 'rejected' | 'dismissed' | 'parse-error' | 'transferred'

export interface InboxItem {
  id: string
  status: InboxStatus
  draft: RideOfferDraft
  createdAt: string
  updatedAt: string
}
