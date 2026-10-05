# Research memory backpressure fix

## Confirmed runtime failure mode

Shadow competition/replay can be unavailable because of `ADAPTIVE_MEMORY_PRESSURE` while research tasks that depend on that worker continue to age in priority. With no new replay outcome, this creates a zero-information loop: blocked tasks become more urgent without producing evidence.

## Required scheduler invariant

When a research task depends on the shadow competition worker and the worker reports `ADAPTIVE_MEMORY_PRESSURE` or `HARD_MEMORY_PRESSURE`:

1. Mark the dependency as `DEPENDENCY_BLOCKED_MEMORY`.
2. Record `evidenceDelta = 0` and `informationGain = 0` for that attempt.
3. Freeze priority aging while the dependency remains blocked.
4. Apply bounded exponential cooldown with jitter; do not busy-retry.
5. Reactivate only after memory headroom materially improves, the dependency health generation changes, or genuinely new evidence invalidates the block.
6. Preserve task state/checkpoints and audit metadata across cooldown/restart.
7. Never lower trading, evidence, promotion, or safety thresholds to make the task pass.

## Safety invariants

These are immutable:

- `SHADOW_ONLY`
- `ABSTAIN`
- `canExecute:false`
- `canExecuteLive:false`
- no real orders or real-money execution
- no automatic research-to-production promotion

## Acceptance tests before merge

- A memory-blocked shadow worker causes dependent research tasks to enter cooldown.
- Priority does not increase during dependency-blocked cooldown.
- Repeated blocked attempts do not increase evidence or information-gain counters.
- Independent research tasks remain schedulable.
- Tasks resume after a simulated material memory-headroom recovery.
- Checkpoint/restart preserves cooldown and dependency metadata.
- Existing safety and promotion tests remain unchanged and pass.
- No memory thresholds are relaxed by this change.

This document intentionally does not claim the runtime bug is fixed. The implementation must be made at the exact scheduler/worker integration point and validated by CI plus shadow-runtime evidence before merge.