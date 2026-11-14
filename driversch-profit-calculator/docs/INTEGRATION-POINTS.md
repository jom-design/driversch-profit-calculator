# Integration Points — PR #1 Reconciliation

This feature branch is based only on main commit `cb94f4cb92bdbe7df1d52e1e5f76cd5877fda45e`. PR #1 and `review/calculator-hardening-20261114` remain independent and are not included.

## Shared files intentionally avoided

- `src/App.tsx`: the existing navigation and page state are currently coupled in one component. Add an assistant route through a narrow integration patch only after the inbox domain contract is stable.
- `src/lib/calculator.ts`: remains the only financial engine. Assistant parsing must output candidate fields and call the existing engine only after explicit confirmation.
- `src/lib/db.ts`: existing schema is version 1 and current backup writes trips/settings separately. Do not add assistant storage here until a versioned migration and atomic transaction design is reviewed.
- `src/types.ts`: do not broaden core financial types for OCR confidence or capture metadata. Keep assistant-specific types under `src/assistant/`.

## PR #1 overlap risk

PR #1 changes core calculation, persistence, and app files. This branch intentionally does not cherry-pick or reproduce those changes. Once PR #1 is independently merged or closed, compare the then-current main against this feature branch and reconcile:
1. Calculator validation and canonical financial inputs.
2. IndexedDB schema/version and preservation of legacy records.
3. Backup import validation and atomicity.
4. Shared trip/settings types and UI integration points.

## Merge-time checklist

- Verify no PR #1 commits are ancestors of this branch.
- Rebase/merge only with explicit authorization and after reviewing changed shared files.
- Keep assistant parsing tests independent from calculator regression tests.
- Confirm all imported legacy trips remain visible; mark unverifiable records rather than silently dropping them.
- Confirm import/export is atomic across trips and settings before enabling assistant persistence.

## Inbox UI integration (feature branch)

The inbox is exposed through the existing navigation using a narrowly scoped change in `src/App.tsx`. The new UI lives in `src/assistant/AssistantInbox.tsx` with isolated styles. Screenshot OCR is adapted by `src/assistant/ocrAdapter.ts` and enters `needs-review`; it no longer bypasses review to reach the calculator.

The calculator hand-off is isolated in `src/assistant/calculatorTransfer.ts`. It returns a `TripInput` only when the inbox item is `confirmed` and fare, pickup distance, passenger distance, and duration are present. It never calls `saveTrip`, `calculateTrip`, or IndexedDB. The existing calculator remains responsible for calculations; fare mode is set to `unknown` so the driver must choose the correct interpretation before relying on the decision.

## Native notification integration

The Android host is in `android/`. It loads the Vite build from packaged local assets through AndroidX WebViewAssetLoader and exposes only the narrow `DriverAndroid` JavaScript interface. The native `NotificationListenerService` requires the Android system notification-listener grant and reads only enabled exact package IDs:
- Uber Driver: `com.ubercab.driver`
- DiDi Driver: `com.didiglobal.driver`
- inDrive: `sinet.startup.inDriver`

Provider toggles default to off. A provider-specific keyword gate filters obvious non-ride notifications; the bridge then validates package IDs, payload lengths, timestamps, and notification identity before the existing parser and Inbox. A short-lived AES-GCM encrypted queue (Android Keystore) holds pending notification text for up to six hours; the web Inbox acknowledges each item only after IndexedDB save succeeds. The queue is bounded to 50 pending notifications and remembers the last 200 acknowledged IDs to prevent notification updates from reappearing. The PWA has no native bridge and retains manual paste/screenshot paths.

This implementation is a native source integration; emulator/physical-device behavior must be confirmed by Android CI and device testing before claiming release readiness.

## Persistence boundary

Inbox state is currently held in React application memory for this phase. It is intentionally not written to the trip-history IndexedDB, and it is lost when the page is reloaded. If persistent inbox storage is added later, it must use a separate versioned store/database and an explicit privacy/retention policy; do not alter the existing trip-history database as a side effect.
