# BIGGJ Shared State

Last verified by: Claude Code, 2026-10-07 (task AI-COLLAB-BOOTSTRAP-001)
Status: REPOSITORY AUDITED / RUNTIME NOT VERIFIED

## Stable invariants
- Repository: `jpamler33-ops/jonas-os-2`
- BIGGJ is a research/shadow-trading system.
- `SHADOW_ONLY=true` must be preserved.
- `canExecuteLive=false` must be preserved.
- No live-money execution.
- W6 valid entry age: strictly `<120s`.
- W6 "99k" refers to approximately `+99,000%` in the intended 1-minute performance metric, not $99k market cap.
- Theoretical, executable and realized PnL must remain distinct concepts.
- An unexecutable exit must not create fictitious realized profit.

## Current repository/runtime state

### Main commit
`298f746` (collaboration protocol) on top of `277540a` (#492, W6 liquidity-truth trading floor).

### Production commit
UNKNOWN — no Railway/runtime access verified.

### Runtime shape (from code)
- Docker `CMD node --expose-gc biggj-runtime-v2.mjs` → wraps `http.createServer` → `import('./bot.mjs')`. `npm start` runs `bot.mjs` directly (differs).
- `TCX_STRATEGY_ONLY_MODE` defaults to true → only W6 plus core services run.
- W6 pipeline: `bot.mjs` `refreshW6UltraEarlyOnce` (5 s) → `memecoin-early-radar(-legacy).mjs` (GMGN new_creation + 1m %, DexScreener batch) → `applyJonasCloneSnapshot` → `applyUser99k60sStrategySnapshot` (`shadow-specialist-wallets.mjs`).
- No order/signing/swap code in the repo.

### W6 health
Runtime: UNKNOWN. Code-level W6 PnL truth gaps verified by scratch reproduction (see `CLAUDE_TO_CHATGPT.md`, AI-COLLAB-BOOTSTRAP-001):
- missing feed row ⇒ position never closes (loss never realized);
- empty entry pool address ⇒ a foreign pool can back a realized profit.

### Known active bottleneck
Code: W6 realized-PnL truth (above). Data: shared GMGN demo key ⇒ partial 1m % coverage (≤2 token-info samples/cycle, 429 cooldown ≥60 s) ⇒ few entries (fail-closed).

### Tests
`npm run check` OK; `npm test` 1778/1778 pass (Node 22.22.0, main `298f746`). `test/*.test.mjs` is not in CI: 3 of 7 fail.

## Update rule
Keep this file short. Replace stale current-state facts when newer facts are verified. Put historical detail in commits/PRs or handoff files.
