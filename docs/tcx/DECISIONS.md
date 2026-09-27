# TCX Architecture Decisions

Status: CANONICAL DECISION LOG

## D-001 · GitHub main is technical source of truth

Old conversations and handovers are context, not authority. Current code wins when they conflict.

## D-002 · Chat is a temporary workplace

Long-running project memory must be externalized into repository state documents and code. A chat becoming full must not block development.

## D-003 · TCX remains SHADOW_ONLY

No live order-execution path is introduced.

```text
Execution = SHADOW_ONLY
Action = ABSTAIN
canExecute = false
```

## D-004 · Fail closed

Critical stale/invalid data, integrity failure or invariant violation produces degraded/safe-stop behavior rather than optimistic repair.

## D-005 · Point-in-time knowledge matters

Historical evidence and replay are governed by `availableAt`, not merely market event timestamps.

## D-006 · Epistemic types stay separate

Observed, derived, modelled, empirical-post-outcome and causal statements may not be silently mixed.

## D-007 · No fake forecast probability

A probability shown to the user must come from an explicitly calibrated forecast system that passed its gates. Heuristic evidence scores are not probabilities.

## D-008 · Specialist branches are candidates

Parallel specialist output requires overlap review, invariant review, tests and architectural integration before becoming canonical.

## D-009 · Avoid monolith growth

Continue extracting provider I/O, routing, handlers and domain logic from `bot.mjs` where it reduces coupling without breaking runtime behavior.

## D-010 · Runtime identity must match deployed code

Modules that affect research, safety, routing or product behavior must remain covered by syntax/test/deployment/release-hash paths as appropriate.

## D-011 · Local file state constrains scaling

Do not scale multiple Railway replicas while critical mutable state is a single local-volume JSON/JSONL store.

## D-012 · Research and execution-quality objectives are distinct

Execution Research Lab evaluates simulated execution quality, not trading PnL or directional alpha.

## D-013 · TCX uses an institutional design standard

TCX is engineered as one coherent research operating system, not a collection of independent bot features.

Canonical quality standard:
`docs/tcx/INSTITUTIONAL_STANDARD.md`

Core identity:
- point-in-time truth
- explicit evidence and contradiction
- calibrated uncertainty
- invalidation and abstention
- reproducibility
- audited self-correction
- one canonical source of truth per capability

## D-014 · Self-correction is versioned and gated

TCX may learn from matured forecast errors, but it must not silently self-modify production logic.

Model/parameter changes require:
- immutable prediction/outcome records
- scoring and error decomposition
- temporal OOS / PIT validation
- explicit candidate version
- promotion gate
- release/audit identity

## D-015 · One canonical forecast layer

After the Forecast Specialist / Alpha.30 integration, TCX must expose one forecast contract and one lifecycle/calibration truth.

Competing forecast engines may remain as experiments only if they have explicit ownership and cannot independently drive product truth.
