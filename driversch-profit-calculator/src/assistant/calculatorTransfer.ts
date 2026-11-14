import type { TripInput } from '../types'
import type { InboxItem } from './types'

/**
 * Pure hand-off adapter. It never calculates, persists, or appends to history.
 * A confirmed inbox item is the only accepted source.
 */
export function toCalculatorTripInput(item: InboxItem): TripInput | null {
  if (item.status !== 'confirmed') return null
  const fields = item.draft.fields
  if (
    fields.fare.value === null ||
    fields.pickupDistanceKm.value === null ||
    fields.distanceKm.value === null ||
    fields.durationMinutes.value === null
  ) return null

  const app: TripInput['app'] = item.draft.provider === 'uber' ? 'Uber'
    : item.draft.provider === 'didi' ? 'DiDi'
    : item.draft.provider === 'indrive' ? 'inDrive' : 'أخرى'

  return {
    app,
    fare: fields.fare.value,
    fareMode: 'unknown',
    commissionRate: 0,
    pickupKm: fields.pickupDistanceKm.value,
    passengerKm: fields.distanceKm.value,
    returnKm: 0,
    totalMinutes: fields.durationMinutes.value,
    extraExpenses: 0,
    notes: 'تم النقل من صندوق الرحلات بعد تأكيدك.'
  }
}
