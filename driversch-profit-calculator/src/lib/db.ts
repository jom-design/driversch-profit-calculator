import { openDB } from 'idb'
import type { SavedTrip, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { isStoredTripSafe, prepareSavedTrip } from './persistence'

const DB_NAME = 'driver-profit-calculator'
const DB_VERSION = 1
const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('trips')) {
      const store = db.createObjectStore('trips', { keyPath: 'id' })
      store.createIndex('createdAt', 'createdAt')
    }
    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
  }
})
export async function getTrips(): Promise<SavedTrip[]> {
  const db = await dbPromise
  const stored = await db.getAll('trips')
  return stored.filter(isStoredTripSafe).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function saveTrip(trip: SavedTrip, settings: Settings = DEFAULT_SETTINGS) {
  const safeTrip = prepareSavedTrip(trip, settings)
  if (!safeTrip) throw new Error('لا يمكن حفظ رحلة ببيانات غير صالحة.')
  const db = await dbPromise
  await db.put('trips', safeTrip)
}
export async function deleteTrip(id: string) {
  const db = await dbPromise
  await db.delete('trips', id)
}
export async function getSettings(): Promise<Settings> {
  const db = await dbPromise
  return { ...DEFAULT_SETTINGS, ...(await db.get('settings', 'main') || {}) }
}
export async function saveSettings(settings: Settings) {
  const db = await dbPromise
  await db.put('settings', settings, 'main')
}
/**
 * Replaces trips and settings in ONE transaction over both stores. Either both are written or neither is:
 * a failure part-way through aborts the transaction, which rolls back the trip clear as well.
 * The argument must be a plan produced by planBackupReplacement, so nothing unvalidated reaches the database.
 */
export async function replaceBackup(plan: { trips: SavedTrip[]; settings: Settings }) {
  const db = await dbPromise
  const tx = db.transaction(['trips', 'settings'], 'readwrite')
  const trips = tx.objectStore('trips')
  await trips.clear()
  for (const trip of plan.trips) await trips.put(trip)
  await tx.objectStore('settings').put(plan.settings, 'main')
  await tx.done
}
