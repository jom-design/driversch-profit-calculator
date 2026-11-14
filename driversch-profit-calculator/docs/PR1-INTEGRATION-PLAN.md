# PR #1 Integration Safety Plan

Status: documentation only. PR #1 is not merged, copied, rebased, or cherry-picked by this validation phase.

## Exact file overlap

| File | Feature branch changes | PR #1 changes | Safe future resolution |
|---|---|---|---|
| `driversch-profit-calculator/src/App.tsx` | Adds inbox navigation, OCR-to-inbox routing, confirmed-offer transfer, and inbox state. | Changes calculator validation/save behavior, safe persistence, invalid-result presentation, and backup restore behavior. | Perform a three-way merge after both branches are brought into a dedicated integration branch. Preserve the inbox routes and transfer callback while retaining PR #1's validation, save guards, and persistence changes. Review the final component as one integration unit; do not take either whole-file version. |
| `driversch-profit-calculator/package.json` | Adds assistant/full-suite test scripts. | Adds Vitest and changes the `test` script to run Vitest. | Merge all scripts and dependencies deliberately. Keep assistant tests, retain Vitest and its test script under a distinct name if needed, and update the lockfile only after the final dependency graph is agreed. |

## Non-overlapping PR #1 files

PR #1 additionally changes calculator/data-integrity files including `src/lib/calculator.ts`, `src/types.ts`, `src/lib/db.ts`, `src/lib/persistence.ts`, and calculator/persistence tests. Those changes are not copied into this feature branch. They remain owned by PR #1 until a s¶»§q«^