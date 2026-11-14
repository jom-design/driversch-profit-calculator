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
export async function replaceAllTrips(trips: unknown[], settings: Settings = DEFAULT_SETTINGS) {
  const safeTrips = trips.map(trip => prepareSavedTrip(trip, settings))
  if (safeTrips.some(trip => trip === null)) throw new Error('النسخة الاحتياطية تحتوي على رحلة غير صالحة؛ لم يتم استبدال السجل.')
  const db = await dbPromise
  const tx = db.transaction('trips', 'readwrite')
  await tx.store.clear()
  for (const trip of safeTrips) await tx.store.put(trip!)
  await tx.done
}
