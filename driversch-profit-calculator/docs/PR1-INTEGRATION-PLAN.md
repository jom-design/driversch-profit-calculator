# PR #1 Integration Safety Plan

Status: documentation only. PR #1 is not merged, copied, rebased, or cherry-picked by this validation phase.

## Exact file overlap

| File | Feature branch changes | PR #1 changes | Safe future resolution |
|---|---|---|---|
| `driversch-profit-calculator/src/App.tsx` | Adds inbox navigation, OCR-to-inbox routing, confirmed-offer transfer, and inbox state. | Changes calculator validation/save behavior, safe persistence, invalid-result presentation, and backup restore behavior. | Perform a three-way merge in a dedicated integration branch. Preserve inbox routes and transfer callback while retaining PR #1 validation, save guards, and persistence. Review the final component as one integration unit; do not take either whole-file version. |
| `driversch-profit-calculator/package.json` | Adds assistant/full-suite test scripts. | Adds Vitest and changes the `test` script to run Vitest. | Merge all scripts and dependencies deliberately. Keep assistant tests, retain Vitest under a distinct script if needed, and reconcile dependency installation after the merged manifest is agreed. |

## Non-overlapping PR #1 files

PR #1 additionally changes calculator/data-integrity files including `src/lib/calculator.ts`, `src/types.ts`, `src/lib/db.ts`, `src/lib/persistence.ts`, and calculator/persistence tests. Those changes are not copied into this feature branch. They remain owned by PR #1 until separately authorized.

The feature branch does not modify `src/lib/calculator.ts`, `src/lib/db.ts`, or the root `src/types.ts` contract.

## Recommended future sequence

1. Obtain explicit authorization to integrate PR #1.
2. Create a separate integration branch from the then-current `main`; keep this feature branch and PR #1 review branch unchanged.
3. Merge the PR #1 branch into the integration branch and resolve its own conflicts.
4. Merge this feature branch into the integration branch and resolve only the two overlapping files using the responsibilities above.
5. Reconcile package scripts and dependencies, then install and test the merged dependency graph.
6. Run combined calculator + assistant tests, strict TypeScript, production build, and browser checks on the integration commit.
7. Only then request review/PR creation under separate authorization.

No PR #1 calculator, database, persistence, or validation implementation is included in this feature-branch stabilization commit.
