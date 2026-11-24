import { openDB } from 'idb'
import type { SavedTrip, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types.ts'
import { mergeStoredSettings } from './settingsMerge.ts'
import { normalizeSettings, normalizeTrip } from './backupImport.ts'

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
  // Normalize legacy and current rows before exposing them to history, reports, or backup export.
  // Invalid rows remain untouched in IndexedDB so a later recovery tool can inspect them.
  const rows = await db.getAll('trips')
  const safeTrips = rows.flatMap(row => {
    const normalized = normalizeTrip(row)
    return normalized ? [normalized] : []
  })
  return safeTrips.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function saveTrip(trip: SavedTrip) {
  const normalized = normalizeTrip(trip)
  if (!normalized) throw new Error('بيانات الرحلة غير صالحة؛ لم يتم حفظها.')
  const db = await dbPromise
  await db.put('trips', normalized)
}
export async function deleteTrip(id: string) {
  const db = await dbPromise
  await db.delete('trips', id)
}
export async function getSettings(): Promise<Settings> {
  const db = await dbPromise
  return mergeStoredSettings(await db.get('settings', 'main'))
}
export async function saveSettings(settings: Settings) {
  const normalized = normalizeSettings(settings, DEFAULT_SETTINGS)
  if (!normalized.ok) throw new Error(normalized.reason)
  const db = await dbPromise
  await db.put('settings', normalized.value, 'main')
}
export async function replaceAllTrips(trips: SavedTrip[]) {
  const normalized = trips.map(normalizeTrip)
  if (normalized.some(trip => trip === null)) throw new Error('تحتوي البيانات على رحلة غير صالحة؛ لم يتم استبدال السجل.')
  const db = await dbPromise
  const tx = db.transaction('trips', 'readwrite')
  await tx.store.clear()
  for (const trip of normalized) await tx.store.put(trip!)
  await tx.done
}


/**
 * Replaces trips and settings as one IndexedDB transaction.
 * If any write fails, IndexedDB aborts the transaction and keeps the previous data intact.
 */
export async function replaceAllData(trips: SavedTrip[], settings: Settings) {
  const normalizedTrips = trips.map(normalizeTrip)
  if (normalizedTrips.some(trip => trip === null)) throw new Error('تحتوي النسخة على رحلة غير صالحة؛ لم يتم استيراد أي بيانات.')
  const normalizedSettings = normalizeSettings(settings, DEFAULT_SETTINGS)
  if (!normalizedSettings.ok) throw new Error(normalizedSettings.reason)
  const db = await dbPromise
  const tx = db.transaction(['trips', 'settings'], 'readwrite')
  try {
    const tripStore = tx.objectStore('trips')
    const settingsStore = tx.objectStore('settings')
    await tripStore.clear()
    for (const trip of normalizedTrips) await tripStore.put(trip!)
    await settingsStore.put(normalizedSettings.value, 'main')
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* The transaction may already have aborted. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
