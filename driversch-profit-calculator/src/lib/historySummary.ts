import type { HistoryTrip } from '../types.ts'

/** Totals over records whose results were verified from their own settings snapshot. */
export interface VerifiedTotals {
  count: number
  netFare: number
  totalCost: number
  netProfit: number
  totalKm: number
  totalMinutes: number
}

/**
 * Recorded values of records that cannot be verified. They are historical reference figures, not calculations:
 * legacy-unverified, mismatch and not-recalculable records are all excluded from the verified totals.
 */
export interface UnverifiedTotals {
  count: number
  netProfit: number
}

export interface HistorySummary {
  verified: VerifiedTotals
  unverified: UnverifiedTotals
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Splits history into verified totals and a separate historical, unverified figure. */
export function summarizeHistory(trips: HistoryTrip[]): HistorySummary {
  const verified: VerifiedTotals = { count: 0, netFare: 0, totalCost: 0, netProfit: 0, totalKm: 0, totalMinutes: 0 }
  const unverified: UnverifiedTotals = { count: 0, netProfit: 0 }
  for (const trip of trips) {
    if (trip.integrity === 'verified') {
      verified.count += 1
      verified.netFare += trip.netFare
      verified.totalCost += trip.totalCost
      verified.netProfit += trip.netProfit
      verified.totalKm += trip.totalKm
      verified.totalMinutes += trip.totalMinutes
    } else {
      unverified.count += 1
      unverified.netProfit += trip.netProfit
    }
  }
  return {
    verified: { ...verified, netFare: round2(verified.netFare), totalCost: round2(verified.totalCost), netProfit: round2(verified.netProfit), totalKm: round2(verified.totalKm) },
    unverified: { count: unverified.count, netProfit: round2(unverified.netProfit) },
  }
}

/** The verified trips only, for per-app comparisons and other verified views. */
export function verifiedOnly(trips: HistoryTrip[]): HistoryTrip[] {
  return trips.filter(trip => trip.integrity === 'verified')
}
