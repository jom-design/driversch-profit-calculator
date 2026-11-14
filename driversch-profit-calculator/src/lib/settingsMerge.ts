import type { Settings } from '../types.ts'
import { DEFAULT_SETTINGS } from '../types.ts'

/**
 * Merges stored settings over the defaults. Commission is merged per platform, so a record saved
 * before Uber had its own field still gets Uber's 0% default, and the other platforms keep their saved values.
 * Kept free of browser storage so it can be tested directly.
 */
export function mergeStoredSettings(stored: Partial<Settings> | undefined | null): Settings {
  const storedCommission = (stored?.commission && typeof stored.commission === 'object') ? stored.commission : {}
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    commission: { ...DEFAULT_SETTINGS.commission, ...storedCommission }
  }
}
