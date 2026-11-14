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
