# Phase 0 — Architecture Baseline

## Scope and baseline

This branch starts from `main` commit `cb94f4cb92bdbe7df1d52e1e5f76cd5877fda45e`. It deliberately excludes every commit from PR #1 and its review branch.

The existing application is React + TypeScript + Vite. The current app already contains a financial calculator, IndexedDB persistence, a basic OCR path based on Tesseract.js, local trip history, and an initial PWA service worker. It does not contain an Android application/module, a native notification listener, a native accessibility service, Android speech recognition, or a real ride-capture lifecycle.

## Architectural boundaries

- `src/assistant/`: provider identification, text parsing, confidence metadata, capture-domain contracts, and inbox lifecycle logic. This layer must not import the calculator or persistence modules.
- `src/platform/`: browser capability detection and platform-neutral adapters. Native Android code belongs in a separate Android project/module when the repository build structure is ready.
- `src/voice/`: speech input/output capability adapters; user confirmation remains mandatory for ambiguous commands.
- `src/lib/calculator.ts`: remains the single financial calculation engine. Assistant modules return candidate input fields only; they never calculate profitability.
- `src/lib/db.ts` and `src/types.ts`: integration points only. Do not modify until a separately reviewed migration/adapter is prepared.

## Data flow

1. A source adapter receives text or image-derived text with an explicit source label.
2. Provider identification returns a candidate and evidence.
3. Provider-specific parser returns field candidates, confidence, and evidence spans.
4. A review step requires confirmation for uncertain or financially material fields.
5. Only confirmed fields may be mapped to the existing calculator input.
6. Saving a confirmed trip is delegated to the existing persistence boundary after compatibility work is reviewed.

## Safety and privacy

- No automated accept/reject/click action in Uber, DiDi, inDrive, or other third-party apps.
- Notification access, accessibility, screen capture, camera, and microphone are opt-in and must explain their purpose.
- Do not persist raw notification text or screenshots by default.
- Do not infer a missing fare, distance, duration, commission, or currency.
- Keep capture parsing offline-capable where feasible; never upload screenshots or notifications without explicit consent.

## Known integration constraints

See `INTEGRATION-POINTS.md`. In particular, PR #1 is still unmerged and is not part of this branch. Reconcile shared calculator, persistence, and domain-type changes only after PR #1 is independently resolved.
