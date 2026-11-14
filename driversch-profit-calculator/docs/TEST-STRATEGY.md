# Test Strategy

## Current verified state

The baseline package has no automated test script and no declared test runner. The environment used for the initial audit had Node.js 22.16.0 and Java 21, but no Gradle, Android SDK, adb, or installed Playwright browser binary. A network/DNS failure prevented a local clone and dependency installation. Therefore no app build, browser test, or Android test is claimed by this document.

## Test layers

| Layer | Purpose | Execution evidence required |
|---|---|---|
| Unit | Parser, provider detection, confidence rules, inbox transitions | Node test output or Vitest report |
| Integration | Capture adapter → parser → review mapping | Browser/API integration test |
| Browser | RTL layout, forms, keyboard, responsive breakpoints | Playwright run with browser binary |
| PWA | Manifest, service worker, offline shell, update behavior | Browser audit and offline test |
| Android unit | Notification normalization, permission states | Gradle test report |
| Android emulator | Notification listener, speech, MediaProjection permission flow | Emulator API level + test log |
| Real device | OEM notification behavior, battery restrictions, microphone/camera permissions | Device model/API level + recorded checklist |

## Financial regression

The assistant must not reimplement financial calculations. Once confirmed input is mapped to the existing calculator, preserve the reference scenario: fare 165 EGP, distance 22 km, duration 40 minutes, fuel 48.95 EGP, maintenance 55 EGP, total cost 103.95 EGP, net 61.05 EGP, hourly profit 91.575 EGP, minimum fare 153.95 EGP, decision ACCEPT. Test this in the calculator's own suite after the shared calculator module is reconciled.

## Required parser test cases

- Arabic-Indic and Persian digits.
- Decimal separators and thousands separators.
- EGP/جنيه labels in either order.
- Minutes and hours in Arabic and English.
- Missing and conflicting fields.
- Provider not recognized.
- Low-confidence OCR and no evidence.
- Explicitly distinguish trip fare from suggested fare, fees, and unrelated numbers.
- Never promote a guessed field to confirmed.

## Evidence rules

Every test report must state command, commit SHA, environment, pass/fail counts, skipped tests, and limitations. A test file existing is not proof that it ran. Emulator coverage is not real-device coverage.
