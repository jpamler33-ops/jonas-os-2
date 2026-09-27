# TCX Architecture

Status: CANONICAL CONTINUITY MAP

## High-level flow

```text
Telegram
  ↓
telegram-command-router
  ↓
read handlers / mutation handlers
  ↓
orchestration + normalized product views
  ↓
market-data-provider
  ↓
public market data from Binance / OKX / Kraken

Research layers
  ├─ market structure / chart dashboard
  ├─ Episode Memory
  ├─ Mechanism Transition Lattice
  ├─ Independent Witness Network
  ├─ Evidence History
  ├─ Research Validity / Lifecycle
  └─ existing forecast-like grammar/world-model layers

Institutional control plane
  ├─ Data Quality Firewall
  ├─ safety state machine
  ├─ deterministic Research Envelope
  ├─ Audit Ledger
  ├─ Market Data Fabric
  ├─ Deterministic Replay
  ├─ Runtime Release Registry
  ├─ Observability
  └─ Chaos Engineering

Execution research only
  ├─ Shadow OMS
  ├─ Shadow SOR
  ├─ Venue Quality Memory
  └─ Execution Research Lab

Persistence
  └─ Railway /data file-backed state
```

## Architectural rules

### 1. Telegram is not the research source of truth

UI code consumes domain/research state. It must not redefine research semantics.

### 2. Provider I/O stays behind a narrow boundary

External exchange reads belong in `market-data-provider.mjs` or a clearly owned provider module, not scattered through UI handlers.

### 3. Point-in-time integrity

Historical reconstruction may only use information whose `availableAt` was known by the requested replay time.

### 4. Epistemic separation

Observed data, derived heuristics, empirical historical outcomes, modelled quantities and causal claims remain visibly distinct.

Do not average incompatible quantities into a fake probability.

### 5. Fail closed

Critical stale/invalid primary data, integrity-chain failure or hard invariant violation must degrade to `SAFE_STOP` rather than inventing a usable state.

### 6. No live execution coupling

No research, Telegram or routing component may introduce authenticated exchange-order submission while the project remains SHADOW_ONLY.

### 7. Reproducibility

Material runtime modules and institutional configuration are bound into the Runtime Release Registry. Research envelopes bind data-fabric state plus release identity.

### 8. Modularization direction

`bot.mjs` may orchestrate but should continue shrinking. Domain logic belongs in owned modules with explicit tests.

## Telegram product contract

Canonical product/UI behavior is specified in:

`docs/TCX_TELEGRAM_PRODUCT_SPEC.md`

That specification must not override institutional safety invariants.
