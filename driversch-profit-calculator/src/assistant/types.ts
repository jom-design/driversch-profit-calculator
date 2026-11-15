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

export type NativeRecommendation = 'accept' | 'review' | 'reject' | 'insufficient_data'

/**
 * Analysis produced natively. Every money value is null when unavailable, never zero.
 * netProfit is non-null only when the recommendation is backed by complete data.
 */
export interface NativeProfitabilityPreview {
  recommendation: NativeRecommendation
  netProfit: number | null
  hourlyProfit: number | null
  totalCost: number | null
  requiredFare: number | null
  partialCost: number | null
  missingFields: string[]
  reason: string
  payloadVerified: boolean
  /** Inputs taken from the driver's saved default settings, not from the notification. */
  userDefaults: string[]
}

export interface RideOfferDraft {
  provider: RideProvider
  providerConfidence: number
  source: CaptureSource
  rawText: string
  sourceAppPackage?: string
  sourceAppLabel?: string
  sourceTimestamp?: string
  nativeAnalysis?: NativeProfitabilityPreview
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

export type InboxReviewField = 'fare' | 'pickupDistanceKm' | 'distanceKm' | 'durationMinutes'

export type InboxStatus = 'received' | 'parsed' | 'needs-review' | 'confirmed' | 'rejected' | 'dismissed' | 'parse-error' | 'transferred'

export interface InboxItem {
  id: string
  status: InboxStatus
  draft: RideOfferDraft
  createdAt: string
  updatedAt: string
  reviewedFields: InboxReviewField[]
}
