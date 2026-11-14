# Persistent Assistant Inbox

## Storage boundary

The assistant inbox uses a dedicated browser IndexedDB database named `driver-assistant-inbox`. It is local to the browser profile and origin; offer text, extracted fields, source metadata, evidence, timestamps, review confirmations, and lifecycle status are not sent to a backend.

- Database version: `1`.
- Object store `items`: key path `id`; indexes on `createdAt` and `updatedAt`.
- Object store `meta`: contains the explicit `schemaVersion` record.
- Calculator trip history remains in its existing database and is not accessed by the inbox storage module.

## Upgrade and validation policy

Schema creation and upgrades run through IndexedDB's `onupgradeneeded` transaction. Future structural changes must increment `INBOX_DB_VERSION` and migrate stores/records in that upgrade transaction. Legacy or partially written records that lack `reviewedFields` normalize to an empty list; invalid records are excluded from the UI and counted in a visible Arabic warning, but are deliberately left in IndexedDB for recovery rather than silently deleted.

Every write validates the complete next record set before opening a read/write transaction. Updates use one transaction; existing IDs are updated, new IDs use `add` so duplicate IDs fail, and only IDs explicitly removed from the prior in-memory snapshot are deleted. Transaction aborts roll back the entire operation.

The UI stores individual review confirmations on the inbox record. A manual correction clears the review confirmation for that field so the driver must review the changed value again. The `transferred` state is persisted before the calculator receives the trip input; if that write fails, the calculator handoff is cancelled.

## Failure handling

The storage layer maps unsupported/blocked IndexedDB, quota errors, duplicate IDs, invalid records, and transaction failures to Arabic error messages. On write failure, the current page retains the offer in memory and displays a persistent warning with an explicit retry action; the driver is told not to close the page until retrying. Invalid-record warnings remain visible after successful writes until the source records are repaired. No storage failure is reported as a successful durable save.

## Test commands and exact coverage

- `npm run test:assistant`: Node test runner for `tests/assistant/*.test.mjs` (41 unit tests).
- `npm run test:e2e`: Playwright + Chromium browser flow, including capture, manual correction, field review, reload, confirmation, reload, transfer, reload, and history isolation; also checks six viewport sizes, RTL, keyboard focus, touch target height, and axe WCAG 2.1 A/AA.
- `npm test`: orchestrates `test:assistant` followed by `test:e2e`; it is the combined suite, not a second independent copy of the unit tests.

The legacy `src/lib/calculator.reference.test.ts` is a manually invoked reference helper, not a Node test-runner test. This inbox phase does not modify the calculator engine or convert that reference helper into a calculator test suite.

Quota and transaction-abort behavior are deterministically simulated through the storage module's test hook; real browser storage is exercised by the Playwright reload test.
