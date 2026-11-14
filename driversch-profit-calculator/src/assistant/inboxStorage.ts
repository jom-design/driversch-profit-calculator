import { wrap, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb'
import type { InboxItem, InboxReviewField } from './types'

export const INBOX_DB_NAME = 'driver-assistant-inbox'
export const INBOX_DB_VERSION = 1
const REVIEW_FIELDS: InboxReviewField[] = ['fare', 'pickupDistanceKm', 'distanceKm', 'durationMinutes']
const STATUSES = ['received', 'parsed', 'needs-review', 'confirmed', 'rejected', 'dismissed', 'parse-error', 'transferred']
const PROVIDERS = ['uber', 'didi', 'indrive', 'unknown']
const SOURCES = ['notification', 'screenshot', 'camera', 'manual', 'web-share']

interface InboxDb extends DBSchema {
  items: { key: string; value: InboxItem; indexes: { createdAt: string; updatedAt: string } }
  meta: { key: string; value: { key: string; version: number } }
}

export type InboxStorageErrorCode = 'unavailable' | 'quota' | 'transaction' | 'duplicate' | 'invalid'

export class InboxStorageError extends Error {
  readonly code: InboxStorageErrorCode
  constructor(code: InboxStorageErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'InboxStorageError'
  }
}

function mapStorageError(error: unknown): InboxStorageError {
  if (error instanceof InboxStorageError) return error
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name?: unknown }).name ?? '') : ''
  if (name === 'QuotaExceededError') return new InboxStorageError('quota', 'مساحة التخزين على الجهاز غير كافية. حرّر مساحة ثم أعد المحاولة؛ لم يتم حذف العرض.')
  if (name === 'ConstraintError') return new InboxStorageError('duplicate', 'هذا العرض أو الإشعار محفوظ بالفعل. لم تتم إضافة نسخة مكررة.')
  if (['SecurityError', 'NotSupportedError', 'InvalidStateError'].includes(name)) {
    return new InboxStorageError('unavailable', 'التخزين المحلي غير متاح في هذا المتصفح أو وضع التصفح الحالي. البيانات الحالية ما زالت ظاهرة في الصفحة فقط.')
  }
  return new InboxStorageError('transaction', 'تعذر حفظ التغيير محليًا. احتفظ بالصفحة مفتوحة وأعد المحاولة؛ لم يتم اعتماد الحفظ.')
}

export function getInboxStorageErrorMessage(error: unknown): string {
  return mapStorageError(error).message
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

function isEvidence(value: unknown): boolean {
  return Array.isArray(value) && value.every(entry =>
    isObject(entry) && typeof entry.text === 'string' &&
    typeof entry.start === 'number' && Number.isFinite(entry.start) &&
    typeof entry.end === 'number' && Number.isFinite(entry.end) &&
    entry.start >= 0 && entry.end >= entry.start
  )
}

function isCandidate(value: unknown, allowCurrency = false): boolean {
  if (!isObject(value)) return false
  const candidateValue = value.value
  const validValue = candidateValue === null ||
    (typeof candidateValue === 'number' && Number.isFinite(candidateValue) && candidateValue >= 0) ||
    (allowCurrency && candidateValue === 'EGP')
  return validValue &&
    typeof value.confidence === 'number' && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 &&
    isEvidence(value.evidence) &&
    ['missing', 'candidate', 'needs-review'].includes(String(value.status))
}

export function normalizeStoredInboxItem(value: unknown): InboxItem | null {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id.trim() ||
      !STATUSES.includes(String(value.status)) || !isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt) ||
      !isObject(value.draft)) return null
  const draft = value.draft
  if (!PROVIDERS.includes(String(draft.provider)) ||
      typeof draft.providerConfidence !== 'number' || !Number.isFinite(draft.providerConfidence) ||
      draft.providerConfidence < 0 || draft.providerConfidence > 1 ||
      !SOURCES.includes(String(draft.source)) || typeof draft.rawText !== 'string' ||
      !isIsoDate(draft.createdAt) || !Array.isArray(draft.warnings) ||
      !draft.warnings.every(warning => typeof warning === 'string') || !isObject(draft.fields)) return null
  const fields = draft.fields
  if (!isCandidate(fields.fare) || !isCandidate(fields.distanceKm) ||
      !isCandidate(fields.durationMinutes) || !isCandidate(fields.pickupDistanceKm) ||
      !isCandidate(fields.currency, true)) return null
  for (const optional of ['sourceAppPackage', 'sourceAppLabel', 'sourceTimestamp'] as const) {
    if (draft[optional] !== undefined && typeof draft[optional] !== 'string') return null
  }
  if (draft.sourceTimestamp !== undefined && !isIsoDate(draft.sourceTimestamp)) return null
  const reviewedFields = value.reviewedFields === undefined ? [] : value.reviewedFields
  if (!Array.isArray(reviewedFields) || !reviewedFields.every(field => REVIEW_FIELDS.includes(field as InboxReviewField)) ||
      new Set(reviewedFields).size !== reviewedFields.length) return null
  return { ...(value as unknown as InboxItem), reviewedFields: [...reviewedFields] as InboxReviewField[] }
}

export interface InboxStorageHooks {
  /** Test seam for deterministic quota and transaction-failure coverage. */
  beforeWrite?: (index: number, item: InboxItem) => void
}

export function createInboxStorage(factory: IDBFactory | null = globalThis.indexedDB ?? null, hooks: InboxStorageHooks = {}) {
  let dbPromise: Promise<IDBPDatabase<InboxDb>> | null = null
  const open = async () => {
    if (!factory) throw new InboxStorageError('unavailable', 'التخزين المحلي غير متاح في هذا المتصفح. لم يتم حفظ العرض بشكل دائم.')
    if (!dbPromise) {
      dbPromise = new Promise<IDBPDatabase<InboxDb>>((resolve, reject) => {
        const request = factory.open(INBOX_DB_NAME, INBOX_DB_VERSION)
        request.onupgradeneeded = event => {
          const db = request.result
          const transaction = request.transaction
          if (!transaction) { reject(new Error('IndexedDB upgrade transaction missing')); return }
          if (event.oldVersion < 1) {
            const items = db.createObjectStore('items', { keyPath: 'id' })
            items.createIndex('createdAt', 'createdAt')
            items.createIndex('updatedAt', 'updatedAt')
            db.createObjectStore('meta', { keyPath: 'key' })
          }
          transaction.objectStore('meta').put({ key: 'schemaVersion', version: INBOX_DB_VERSION })
        }
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close()
          resolve(wrap(request.result) as IDBPDatabase<InboxDb>)
        }
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
        request.onblocked = () => reject(new DOMException('IndexedDB open blocked', 'InvalidStateError'))
      }).catch(error => {
        dbPromise = null
        throw mapStorageError(error)
      })
    }
    return dbPromise
  }

  return {
    async load(): Promise<{ items: InboxItem[]; invalidCount: number }> {
      try {
        const db = await open()
        const tx = db.transaction('items', 'readonly')
        const records = await tx.store.getAll()
        await tx.done
        const items: InboxItem[] = []
        let invalidCount = 0
        for (const record of records as unknown[]) {
          const normalized = normalizeStoredInboxItem(record)
          if (normalized) items.push(normalized)
          else invalidCount += 1
        }
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        return { items, invalidCount }
      } catch (error) { throw mapStorageError(error) }
    },

    async saveChanges(previous: InboxItem[], next: InboxItem[]): Promise<void> {
      const previousIds = new Set(previous.map(item => item.id))
      const nextIds = new Set<string>()
      for (const item of next) {
        if (nextIds.has(item.id)) throw new InboxStorageError('duplicate', 'يوجد عنصران بالمعرّف نفسه؛ لم يتم حفظ أي تغيير.')
        nextIds.add(item.id)
        if (!normalizeStoredInboxItem(item)) throw new InboxStorageError('invalid', 'بيانات العرض غير صالحة؛ لم يتم حفظ التغيير.')
      }
      let tx: IDBPTransaction<InboxDb, ['items'], 'readwrite'> | undefined
      try {
        const db = await open()
        const transaction = db.transaction('items', 'readwrite')
        tx = transaction
        let index = 0
        for (const item of next) {
          hooks.beforeWrite?.(index++, item)
          if (previousIds.has(item.id)) await transaction.store.put(item)
          else await transaction.store.add(item)
        }
        for (const item of previous) if (!nextIds.has(item.id)) await transaction.store.delete(item.id)
        await transaction.done
      } catch (error) {
        try { tx?.abort() } catch { /* transaction may already be inactive */ }
        if (tx) await tx.done.catch(() => undefined)
        throw mapStorageError(error)
      }
    },

    async close(): Promise<void> {
      if (dbPromise) {
        const db = await dbPromise.catch(() => null)
        db?.close()
        dbPromise = null
      }
    }
  }
}

const defaultStorage = createInboxStorage()
export const loadInboxItems = defaultStorage.load
export const saveInboxChanges = defaultStorage.saveChanges
