import { openDB } from 'idb'
import type { HistoryTrip, SavedTrip, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { isStoredTripSafe, prepareSavedTrip, readStoredTrip } from './persistence'
import { writeBackup } from './backupWrite.ts'

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
/** Readable trips with their integrity status. Historical records are included, not hidden. */
export async function getTrips(): Promise<HistoryTrip[]> {
  const db = await dbPromise
  const stored = await db.getAll('trips')
  return stored
    .map(readStoredTrip)
    .filter((trip): trip is HistoryTrip => trip !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
/** Records that are stored but cannot be read at all. They are kept in storage and counted, never deleted. */
export async function countUnreadableTrips(): Promise<number> {
  const db = await dbPromise
  const stored = await db.getAll('trips')
  return stored.filter(record => !isStoredTripSafe(record)).length
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
/** Replaces trips and settings in one transaction. The argument must be a plan from planBackupReplacement. */
export async function replaceBackup(plan: { trips: SavedTrip[]; settings: Settings }) {
  await writeBackup(await dbPromise, plan)
}
