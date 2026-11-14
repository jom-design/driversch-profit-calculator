import { openDB } from 'idb'
import type { SavedTrip, Settings } from '../types'
import { mergeStoredSettings } from './settingsMerge.ts'

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
  return (await db.getAll('trips')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function saveTrip(trip: SavedTrip) {
  const db = await dbPromise
  await db.put('trips', trip)
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
  const db = await dbPromise
  await db.put('settings', settings, 'main')
}
export async function replaceAllTrips(trips: SavedTrip[]) {
  const db = await dbPromise
  const tx = db.transaction('trips', 'readwrite')
  await tx.store.clear()
  for (const trip of trips) await tx.store.put(trip)
  await tx.done
}


/**
 * Replaces trips and settings as one IndexedDB transaction.
 * If any write fails, IndexedDB aborts the transaction and keeps the previous data intact.
 */
export async function replaceAllData(trips: SavedTrip[], settings: Settings) {
  const db = await dbPromise
  const tx = db.transaction(['trips', 'settings'], 'readwrite')
  try {
    const tripStore = tx.objectStore('trips')
    const settingsStore = tx.objectStore('settings')
    await tripStore.clear()
    for (const trip of trips) await tripStore.put(trip)
    await settingsStore.put(settings, 'main')
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* The transaction may already have aborted. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
