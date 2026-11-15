import { prepareImportedTrip } from './persistence.ts'
import { validateBackupSettings } from './backupSettings.ts'
import type { SavedTrip, Settings } from '../types.ts'

export type BackupPlan =
  | { ok: true; trips: SavedTrip[]; settings: Settings }
  | { ok: false; reason: string }

/**
 * Validates an entire backup before anything is written. Trips are kept as recorded and are never recalculated
 * with the backup's settings. The backup's settings replace the current settings only after validation.
 * The plan has no side effects: the database write happens only after a plan is ok.
 */
export function planBackupReplacement(rawTrips: unknown, rawSettings: unknown): BackupPlan {
  if (!Array.isArray(rawTrips)) return { ok: false, reason: 'قائمة الرحلات في النسخة غير صالحة؛ لم يتم أي تغيير.' }
  const settingsCheck = validateBackupSettings(rawSettings)
  if (!settingsCheck.ok) return { ok: false, reason: `${settingsCheck.reason} لم يتم أي تغيير.` }

  const seenIds = new Set<string>()
  const trips: SavedTrip[] = []
  for (const raw of rawTrips) {
    const prepared = prepareImportedTrip(raw)
    if (!prepared) return { ok: false, reason: 'النسخة الاحتياطية تحتوي على رحلة غير صالحة؛ لم يتم أي تغيير.' }
    // Duplicate ids would make the store overwrite one trip silently, so the whole backup is refused.
    if (seenIds.has(prepared.id)) return { ok: false, reason: 'النسخة الاحتياطية تحتوي على معرّفات رحلات مكررة؛ لم يتم أي تغيير.' }
    seenIds.add(prepared.id)
    trips.push(prepared)
  }
  return { ok: true, trips, settings: settingsCheck.value }
}
