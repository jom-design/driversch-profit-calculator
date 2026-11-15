import type { SavedTrip, Settings } from '../types.ts'

/** The part of an IndexedDB transaction the backup write uses. The real database satisfies it. */
export interface BackupTransaction {
  objectStore(name: string): {
    clear(): Promise<unknown>
    put(value: unknown, key?: IDBValidKey): Promise<unknown>
  }
  abort(): void
  done: Promise<unknown>
}
export interface BackupDatabase {
  transaction(stores: string[], mode: 'readwrite'): BackupTransaction
}

/**
 * Replaces all trips and the settings in ONE transaction over both stores. Either both are written or neither is.
 * Any error aborts the transaction explicitly, so a failure part-way through can never commit the trip clear.
 * The plan must come from planBackupReplacement, so nothing unvalidated reaches the database.
 */
export async function writeBackup(db: BackupDatabase, plan: { trips: SavedTrip[]; settings: Settings }): Promise<void> {
  const tx = db.transaction(['trips', 'settings'], 'readwrite')
  try {
    const trips = tx.objectStore('trips')
    await trips.clear()
    for (const trip of plan.trips) await trips.put(trip)
    await tx.objectStore('settings').put(plan.settings, 'main')
  } catch (error) {
    try { tx.abort() } catch { /* already aborted by the database */ }
    await tx.done.catch(() => undefined)
    throw error
  }
  await tx.done
}
