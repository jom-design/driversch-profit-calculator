export type AppName = 'Uber' | 'DiDi' | 'inDrive' | 'أخرى'
export type FareMode = 'net' | 'gross' | 'unknown'
// Each platform has its own commission. Values are user settings: no real-world rate is assumed.
export type CommissionApp = 'Uber' | 'inDrive' | 'DiDi' | 'أخرى'
export type Decision = 'accept' | 'review' | 'reject'
export interface Settings {
  fuelPrice: number
  consumptionPer100: number
  maintenancePerKm: number
  minNetProfit: number
  hourlyTarget: number
  commission: Record<CommissionApp, number>
  /** Return distance used by the background analysis. null means the driver has not set it. */
  defaultReturnKm: number | null
  /** Extra expenses per trip used by the background analysis. null means the driver has not set it. */
  defaultExtraExpenses: number | null
}
export interface TripInput {
  app: AppName
  fare: number
  fareMode: FareMode
  commissionRate: number
  pickupKm: number
  passengerKm: number
  returnKm: number
  totalMinutes: number
  extraExpenses: number
  notes: string
}
export interface Calculation {
  totalKm: number
  fuelCost: number
  maintenanceCost: number
  totalCost: number
  netFare: number
  netProfit: number
  hourlyProfit: number
  requiredFare: number
  fareGap: number
  decision: Decision
  decisionReason: string
}
export interface SavedTrip extends TripInput, Calculation {
  /** Snapshot of the cost thresholds and fuel assumptions used when this trip was calculated. */
  calculationSettings?: Settings
  id: string
  createdAt: string
}
export const DEFAULT_SETTINGS: Settings = {
  fuelPrice: 22.25,
  consumptionPer100: 10,
  maintenancePerKm: 2.5,
  minNetProfit: 50,
  hourlyTarget: 75,
  // 0% is a placeholder until the driver enters the rate that applies to them.
  commission: { Uber: 0, inDrive: 0, DiDi: 0, 'أخرى': 0 },
  // null is "not set": the analysis then reports the missing input instead of assuming zero.
  defaultReturnKm: null,
  defaultExtraExpenses: null
}
export const EMPTY_TRIP: TripInput = {
  app: 'Uber', fare: 165, fareMode: 'net', commissionRate: 0,
  pickupKm: 0, passengerKm: 22, returnKm: 0, totalMinutes: 40,
  extraExpenses: 0, notes: ''
}
