# TCX New Chat Bootstrap

Purpose: start any new TCX development chat from repository state instead of old conversation history.

Repository: `jpamler33-ops/jonas-os-2`
Canonical branch: `main`
Technical source of truth: current GitHub `main`

## Mandatory read order

1. `/docs/tcx/MASTER_STATE.md`
2. `/docs/tcx/ARCHITECTURE.md`
3. `/docs/tcx/MODULE_REGISTRY.md`
4. `/docs/tcx/DECISIONS.md`
5. `/docs/tcx/OPEN_WORK.md`
6. `/docs/tcx/SPECIALIST_HANDOVERS.md`
7. Relevant canonical product/research specs, especially `/docs/TCX_TELEGRAM_PRODUCT_SPEC.md`

## Working rules

- Inspect current `main` before changing code.
- Do not trust an old chat summary when it conflicts with the repository.
- Do not duplicate a capability until `MODULE_REGISTRY.md` and current code have been checked.
- Specialist output is a candidate until overlap, invariants, tests and architecture fit have been reviewed.
- Update the continuity documents when a material architectural decision, module status or next-step priority changes.

## Hard invariants

```text
Execution = SHADOW_ONLY
Action = ABSTAIN
canExecute = false
Causal status = NOT_IDENTIFIED unless a narrower component explicitly states otherwise
No authenticated live order-submission path
```

TCX must fail closed on stale/invalid critical data, integrity failures and invariant violations.

## New-chat instruction

Use this exact intent:

```text
We continue TCX from GitHub.
Repository: jpamler33-ops/jonas-os-2

Read first:
docs/tcx/NEW_CHAT_BOOTSTRAP.md
docs/tcx/MASTER_STATE.md
docs/tcx/ARCHITECTURE.md
docs/tcx/MODULE_REGISTRY.md
docs/tcx/DECISIONS.md
docs/tcx/OPEN_WORK.md

Treat current GitHub main as the technical source of truth.
Check current main before every material change.
TCX remains SHADOW_ONLY / ABSTAIN.
Continue with the highest-priority item in OPEN_WORK.md.
```
