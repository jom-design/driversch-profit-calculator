import type { Settings } from '../types'

const PROVIDER_BY_APP: Readonly<Record<string, string>> = { Uber: 'uber', DiDi: 'didi', inDrive: 'indrive' }

/**
 * Payload for the native trip analysis. It takes SAVED settings only: values edited on the settings
 * page but not yet saved must not change native offer analysis.
 */
export function nativeTripSettingsPayload(saved: Settings, app: string, fareMode: string): string {
  return JSON.stringify({ ...saved, activeProvider: PROVIDER_BY_APP[app] ?? 'unknown', fareMode })
}
