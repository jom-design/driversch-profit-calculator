# Calculator Hardening — Validation Report

## Scope

This review branch hardens calculator input validation and prevents invalid data from producing an `accept` decision. It also repairs the Node.js test harness helper-name defect and expands regression coverage for unsupported fare modes, missing trip values, invalid settings, and missing objects.

## Files

- `package.json`: exposes `npm test` through Vitest.
- `src/lib/calculator.ts`: validates required values, settings, fare modes, and malformed/missing objects; invalid input returns finite calculation fields, `isValid: false`, validation errors, and `review`.
- `src/types.ts`: adds `isValid` and `validationErrors` to `Calculation`.
- `src/lib/calculator.test.ts`: Vitest regression tests, including missing and invalid input coverage.
- `tests/calculator.node.test.mjs`: Node.js built-in test harness with corrected `calc()` calls and helper regression coverage.

## Node.js built-in test runner

The published harness contained three calls to undefined `call()` despite defining `calc()`. The affected invocations were corrected:

- REVIEW case: `call({ fare: 158.95, totalMinutes: 60 })` → `calc({ fare: 158.95, totalMinutes: 60 })`
- Unknown fare mode: `call({ fareMode: 'unknown' })` → `calc({ fareMode: 'unknown' })`
- 100% commission: `call({ fareMode: 'gross', commissionRate: 100 })` → `calc({ fareMode: 'gross', commissionRate: 100 })`

A reproduction with the three incorrect calls failed with 3 `ReferenceError` test failures. The repaired harness was then executed:

```bash
node --experimental-strip-types --test driversch-profit-calculator/tests/calculator.node.test.mjs
```

Result: **11 passed, 0 failed, 0 skipped**. Node emitted its expected experimental TypeScript type-stripping warning. The unflagged `node --test ...` command was also tried and fails on this Node 22.16 runtime with `ERR_UNKNOWN_FILE_EXTENSION` for `.ts`; therefore the explicit `--experimental-strip-types` flag is required in this environment.

## Reference calculation

Input: fare 165 EGP; passenger distance 22 km; pickup and return distance 0 km; duration 40 minutes; fuel price 22.25 EGP/liter; consumption 10 L/100 km; maintenance 2.50 EGP/km; additional expenses 0 EGP; minimum profit 50 EGP; hourly target 75 EGP.

| Result | Expected | Verified |
|---|---:|---:|
| Total distance | 22 km | 22 km |
| Fuel cost | 48.95 EGP | 48.95 EGP |
| Maintenance | 55.00 EGP | 55.00 EGP |
| Total operating cost | 103.95 EGP | 103.95 EGP |
| Net profit | 61.05 EGP | 61.05 EGP |
| Hourly profit | 91.58 EGP | 91.58 EGP |
| Minimum required fare | 153.95 EGP | 153.95 EGP |
| Decision | ACCEPT | ACCEPT |

Floating-point monetary assertions use a 0.01 EGP tolerance in the Node harness.

## Other executed checks

- TypeScript strict check:
  ```bash
  tsc --noEmit --strict --target ES2020 --module ESNext --moduleResolution Bundler src/types.ts src/lib/calculator.ts
  ```
  **Passed** (exit code 0).
- `git diff --check`: **passed**.
- `git diff --cached --check`: **passed**.
- Secret-pattern scan of changed files: **no matches**.

## Vitest and application build

- `npm test` was attempted and exited 127: `vitest: not found`.
- `npm install --no-save --package-lock=false --ignore-scripts vitest@2.1.8 vite@6.0.5 @vitejs/plugin-react@4.3.4 typescript@5.7.2` was attempted but timed out; no dependencies or lockfile were committed.
- Vitest suite: **NOT RUN** because dependencies could not be installed in this environment.
- `npm run build` was attempted but could not complete: the isolated recovery checkout does not contain `tsconfig.json` or the rest of the application source tree (`src/main.tsx`, Vite entry/config dependencies). The repository's `tsconfig.json` was independently confirmed to exist on the review branch; this is a local checkout completeness limitation, not a passing build.
- Full application build: **NOT VERIFIED**.

## Remaining limitations

Vitest and the full Vite application build still require a complete repository checkout and installable npm dependencies. The Node.js harness and strict TypeScript check for the calculator/types modules passed. GitHub Actions and the deployment provider must be checked against the new pushed commit after publication.
