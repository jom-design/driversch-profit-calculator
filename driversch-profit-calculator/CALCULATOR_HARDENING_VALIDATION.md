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

Initial repair result: **11 passed, 0 failed, 0 skipped**. After the follow-up duration/boundary hardening below, the current local rerun is **13 passed, 0 failed, 0 skipped**. Node emitted its expected experimental TypeScript type-stripping warning. The unflagged `node --test ...` command was also tried and fails on this Node 22.16 runtime with `ERR_UNKNOWN_FILE_EXTENSION` for `.ts`; therefore the explicit `--experimental-strip-types` flag is required in this environment.

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

## Follow-up hardening — sub-minute duration overflow

A fresh adversarial execution found a defect not covered by the original suite: a positive but sub-minute duration such as `Number.MIN_VALUE` passed validation, made `hourlyProfit` become `Infinity`, and could still produce `accept`. This is a confirmed defect, not a hypothetical edge case.

The calculator now rejects durations below one minute and uses a safe zero-minute fallback for invalid sub-minute values during arithmetic. This prevents the invalid duration from creating an infinite hourly-profit result. Regression coverage was added to both the Node and Vitest suites for zero, 0.5, and `Number.MIN_VALUE` durations. Boundary tests also verify that exact minimum-profit/hourly-target thresholds are inclusive, one cent below minimum is rejected, and a just-below hourly target is reviewed.

Fresh Node command:

```bash
node --experimental-strip-types --test tests/calculator.node.test.mjs
```

Result: **13 passed, 0 failed, 0 skipped** (exit code 0).

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

- The repository defines `npm test` as `vitest run` and declares Vitest `^2.1.8` in `devDependencies`.
- No `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, or `yarn.lock` exists on the review branch, so there is no lockfile-based reproducible install command to use.
- `npm test` was attempted and exited 127: `vitest: not found`.
- A non-mutating registry availability check, `npm view vitest@2.1.8 version --fetch-retries=0 --fetch-timeout=10000`, failed with `EAI_AGAIN` resolving `registry.npmjs.org`. A dependency install retry also failed with the same DNS error. No dependencies or lockfile were changed.
- Vitest suite: **NOT RUN**; dependency acquisition is blocked by DNS/network failure.
- `npm run build` was attempted in the available local recovery snapshot and exited 1 with `TS5083` because that snapshot omits `tsconfig.json`. GitHub's review-branch tree confirms `tsconfig.json`, `src/App.tsx`, `src/main.tsx`, and `vite.config.ts` exist remotely, so this local failure is a checkout-completeness limitation and not a verified application build failure.
- The full production build remains **NOT VERIFIED** because the local checkout is incomplete and dependencies cannot be downloaded.

## Remaining limitations

Vitest and the full Vite production build remain unverified. The available local snapshot is not a complete checkout of the remote review branch; the GitHub API was used to independently inspect the actual branch tree and confirm the app entry points/configuration exist. Direct Git transport also fails in this environment because `github.com` DNS resolution fails. The Node.js harness and strict TypeScript check for calculator/types passed locally. GitHub Actions and the deployment provider must be checked against the final pushed commit after publication.
