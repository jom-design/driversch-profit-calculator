# Calculator Hardening — Validation Report

## Scope
This review branch contains the recovered calculator-hardening patch, a Vitest regression suite, and the Node.js built-in test harness used for offline verification. The calculator change validates non-finite, negative, zero-duration, and implausible inputs; invalid inputs cannot produce an `accept` decision. Existing valid calculation formulas and fare-mode handling are retained.

## Files
- `package.json`: adds `npm test` using Vitest 2.1.8.
- `src/lib/calculator.ts`: validates input/settings and returns finite calculation values, `isValid`, and `validationErrors`.
- `src/types.ts`: extends `Calculation` with validation metadata.
- `src/lib/calculator.test.ts`: Vitest regression tests.
- `tests/calculator.node.test.mjs`: Node.js built-in test harness used in this environment.

## Tests executed in the recovery environment

Command:

```bash
node --experimental-strip-types --test tests/calculator.node.test.mjs
```

Result: **8 passed, 0 failed** (Node.js 22; TypeScript type stripping experimental warning only).

Command:

```bash
tsc --noEmit --strict --target ES2020 --module ESNext --moduleResolution Bundler src/types.ts src/lib/calculator.ts
```

Result: **passed**.

Command:

```bash
git apply --check <reconciled-patch>
```

Result: **passed** against a local base snapshot whose package, calculator, and types blob IDs match the verified GitHub base files. The original patch's old-side import context had one stale path (`../../src/types`); the remote file uses `../types`. Only that old-side context was reconciled for application. The original patch file itself was not modified.

## Not run
- `npm test` / Vitest: dependencies are not installed in this isolated environment; no package installation was performed.
- Full application build: not run; full repository dependencies were not installed.

## Reference calculation
Fare 165 EGP, distance 22 km, duration 40 minutes, fuel 22.25 EGP/liter, consumption 10 L/100 km, maintenance 2.50 EGP/km, minimum profit 50 EGP, hourly target 75 EGP:

- Total distance: 22 km
- Fuel: 48.95 EGP
- Maintenance: 55.00 EGP
- Total cost: 103.95 EGP
- Net profit: 61.05 EGP
- Hourly profit: 91.58 EGP
- Required fare: 153.95 EGP
- Decision: ACCEPT

## Patch integrity
Original patch SHA-256: `40c4521aef3241ca0fd62a63b50667361cce3e6136835821a5c3e8447c90a447` (verified before publication).
