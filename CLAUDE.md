# Claude Code project instructions

## Mandatory startup
For every substantive BIGGJ session, read these files before changing code:

1. `AI_COLLABORATION.md`
2. `docs/ai/SHARED_STATE.md`
3. `docs/ai/CHATGPT_TO_CLAUDE.md`
4. `docs/ai/DECISIONS.md`

Treat GitHub as the shared communication layer between Claude Code and ChatGPT.

## Collaboration rule
Claude Code is the implementation/runtime agent. ChatGPT is a second engineering/research/review agent. The repository owner is the final authority.

When ChatGPT leaves a handoff in `docs/ai/CHATGPT_TO_CLAUDE.md`:
- verify its claims against the current repository/runtime before acting;
- acknowledge or challenge assumptions with evidence;
- perform the work when authorized by the user;
- write the result to `docs/ai/CLAUDE_TO_CHATGPT.md`.

After every substantial engineering task, update `docs/ai/CLAUDE_TO_CHATGPT.md` with:
- task ID
- status
- branch
- commits / PR
- root cause
- files changed
- tests and exact results
- runtime verification
- unresolved risks
- questions or disagreements for ChatGPT

Never claim tests, deploys, runtime verification, provider behavior, liquidity, fills or PnL that were not actually verified.

## BIGGJ invariants
Preserve unless the repository owner explicitly changes them:
- SHADOW_ONLY = true
- canExecuteLive = false
- no live-money execution
- W6 entry age is strictly <120 seconds
- W6 "99k" means approximately +99,000% in the intended 1-minute performance metric, not $99,000 market cap
- realized PnL must not be created when an exit is not plausibly executable
- disappearing liquidity must never become phantom realized profit

## Engineering loop
INSPECT → TRACE → ROOT CAUSE → PRIORITIZE → FIX → TEST → REVIEW DIFF → DEPLOY WHEN AUTHORIZED → RUNTIME VERIFY → RE-INSPECT.

Repository/runtime evidence beats stale prompts or documentation.

---

# Project memory — BIGGJ architecture, W6 contract, failure modes

Added by Claude Code audit (task AI-COLLAB-BOOTSTRAP-001). Also read `AGENTS.md` (multi-chat PR/handover protocol). Facts verified against main `277540a` on 2026-10-07; re-verify before relying on line numbers.

### Mandatory start / work sequence (summary of AGENTS.md)

1. Read issue `[BIGGJ] Project Status` (#257), latest `main` commits, overlapping open PRs and
   their `TCX_CHAT_HANDOVER_V1` comments. Many PRs (30+) are open and stale — never blindly merge.
2. `inspect -> branch -> small commits -> tests -> PR -> CI -> merge -> live verify`.
3. Never claim something is live without deployment verification.

### Hard safety invariants (never loosen)

- `execution:'SHADOW_ONLY'`, `canExecute:false`, `canExecuteLive:false` everywhere.
- No exchange/DEX order, signing, swap or transaction code exists — keep it that way.
  (`createHmac` in `market-fabric-cold-store.mjs` is S3 SigV4, not trading.)
- Point-in-time only, no future leakage. `ABSTAIN` is first-class.
- Keep `OBSERVED / INFERRED / MODELLED / ASSUMED` separate in data and UI.
- Scientific guards are never loosened to produce more trades; challenger/research evidence
  must not silently mutate PRIMARY policy.
- Rulebook: `biggj-rulebook.mjs` (`TRADING-003`: canExecuteLive is false system-wide).

### Runtime

| Item | Fact |
|---|---|
| Language | Node.js ≥22, ESM (`.mjs`), only dependency `discord.js` |
| Production entry | `Dockerfile` → `node --expose-gc biggj-runtime-v2.mjs` |
| `biggj-runtime-v2.mjs` | Monkey-patches `http.createServer` (adds `/biggj-superchart-v2.js`, `/market-candles.json`, injects chart into `/mission-control`) then `import('./bot.mjs')` |
| `npm start` | `node bot.mjs` — **differs from Docker** (no superchart wrapper) |
| `bot.mjs` | ~13.8k-line monolith: Telegram, Discord bridge, HTTP server, all watchers |
| HTTP | `/health`, `/ready`, `/mission-control(.json)`, `/w6-research.json`, `/w6-analysis.json`, `/signal-lab.json`, `/proof-feed.json`, `/rulebook.json`, `/ai/ask` (Bearer-auth), PWA files |
| Persistence | JSON/JSONL files under `/data` (Railway volume, `RAILWAY_VOLUME_MOUNT_PATH`). W6 wallet: `TCX_SPECIALIST_WALLETS_FILE` (default `/data/tcx-specialist-wallets.json`), W6 candidate book: `<that file>.w6-candidates.json` |
| Deploy | Railway builds the Dockerfile (no railway.json in repo). Keep **1 replica** (file state + Telegram long polling). Docker build runs `npm run check` + many test suites — a failing suite blocks deploy |
| Strategy-only mode | `TCX_STRATEGY_ONLY_MODE` default **true** → only W6 runs; research stack (autolearn, competition, league, factory, world model, other wallets) is skipped |

`biggj-startup-integrity.mjs` (rewrites `biggj-mobile-webapp.mjs` at boot) is not referenced by the
Dockerfile — treat as dead/legacy.

### Commands

```bash
npm run check          # node --check over the runtime module list (keep new runtime modules in it)
npm test               # node --test *.test.mjs science-runtime/*.test.mjs expansion-runtime/*.test.mjs
node --test w6-*.test.mjs jonas-clone-hotpath.test.mjs shadow-specialist-wallets.test.mjs \
  expansion-runtime/memecoin-early-radar.test.mjs   # W6-focused subset
npm run test:portfolio | test:intel | test:experience  # suites also run inside docker build
```

CI: `.github/workflows/check.yml` (check + `npm test` + docker build smoke). Note `test/*.test.mjs`
is **not** in the `npm test` glob (and 3 of its 7 tests fail against the current contract).

### W6 — the active strategy (JONAS_CLONE_V1 / `W6_USER_99K_60S`)

#### Semantics (do not reinterpret)

- **"99k" = GMGN 1m price performance ≥ +99,000 %**, *not* $99k market cap.
  Threshold: `minGreenChangePct:99_000`, `requireExactGmgnGreen:true`, `minMarketCapUsd:null`.
- Valid entry: pair age **strictly < 120 s** (`ageSeconds >= 120` → `OLDER_THAN_MAX_AGE`).
  Discovery/candidate memory may look at up to 180 s; that is tracking, not entry.
- Entry also requires exact GMGN provenance: `gmgnExactTrend && gmgnExactOneMinutePerformance`
  and New-Pair visibility (`gmgnExactNewPair` or `signalNewPair && trendVisible`), price > 0,
  SOL price known, fresh snapshot (`sourceReady` and `capturedAt` ≤ 15 s old).
- Size: `sizeSol = liquidityUsd * 4/10000` (max 80 SOL) — a user hypothesis, not a safe limit.
- Exit: fixed hold **240 s** (`W6_HOLD_4M_EXIT`) or confirmed liquidity death (`W6_LIQUIDITY_GONE`).
- Legacy (pre-contract) W6 positions are excluded from strategy stats via `isCurrentW6ClonePosition`.

#### Data flow

```
bot.mjs w6UltraEarlyWatcher (every TCX_W6_ULTRA_EARLY_REFRESH_MS, default 5s, single-flight)
 → refreshW6UltraEarlyOnce → memecoinEarlyProvider.fetchUltraEarlySolana()   [30s outer bound: W6_ULTRA_PROVIDER_TIMEOUT]
     expansion-runtime/memecoin-early-radar.mjs     (wrapper; GMGN key configured ⇒ returns legacy result, no Gecko/Dex discovery)
     expansion-runtime/memecoin-early-radar-legacy.mjs fetchUltraEarlySolana:
        GMGN OpenAPI /v1/trenches new_creation (identity + age)
        + 1m %: /v1/market/rank change1m (personal key) or /v1/token/info price/price_1m (demo key, ≤2 samples/cycle)
        + DexScreener /tokens/v1 batch (price, liquidity, pair) — mergeCandidate: Dex fields override GMGN
        rows = freshRows | candidateTrackingRows | trackingRows (open positions, w6TrackingOnly)
 → enrichW6UltraCandidateRows (launch tracker, candidate book persisted)
 → applyJonasCloneSnapshot (jonas-clone-v1-integration.mjs; forces contract options, 15s freshness)
 → applyUser99k60sStrategySnapshot (shadow-specialist-wallets.mjs): mark → exit → entry
 → persistSpecialistWallets
```

#### Execution / PnL model (shadow-specialist-wallets.mjs)

- `user99k60sExecutableMark`: constant-product model. Exit proceeds = `R·v/(R+v)` with
  `R = liquidityUsd/2`, so proceeds can never exceed the quote reserve. Fees 30 bps per side.
- `closeW6Position` realizes only if the mark is fresh (≤15 s) **and** `executable` or
  `liquidityDead` (liquidity ≤ $1 on the same pool) → zero-recovery write-off. Otherwise the
  position stays open with `pendingExit.status='EXIT_UNFILLABLE'` and is retried each cycle.
- Headline PnL (`walletStats`) = conservative realizable; observed mid-mark PnL is reported
  separately (`observed*`). Never promote observed PnL to realized.
- `w6-executable-pnl.mjs`, `w6-executable-pnl-adapter.mjs`, `w6-50v50-benchmark.mjs` are **not used at
  runtime** (tests only) and use different fee defaults (10 bps). Don't confuse them with the live model.

### Known failure modes / open risks (verified 2026-10-07 against main 277540a)

1. **Vanishing rows never close.** If a token disappears from the feed (rug, Dex not indexing), the
   position stays OPEN forever (only research gaps are recorded). Losses are never realized →
   win-rate/expectancy survivorship bias, capacity (`maxOpen` 30) slowly consumed.
2. **Pool identity holes.** If `entryPoolAddress` is empty, `pairVerified` defaults to true and any
   pool's liquidity can back a profitable exit (phantom-profit path). If the pool changes
   (GMGN pool vs Dex best-liquidity pair), `PAIR_MISMATCH` blocks the exit forever.
3. **Mixed-source entry.** `mergeCandidate` lets DexScreener price/liquidity override GMGN while the
   +99,000 % comes from GMGN; entry price may be a cached (≤5 s) Dex price from another pair.
4. **Stale 99k-as-market-cap wording** remains in user-facing text: wallet `objective`
   (`…_99K_MARKET_CAP_WITHIN_120_SECONDS`), Telegram W6 card in `bot.mjs` ("Market Cap ≥99k"),
   Discord embed in `discord-telegram-bridge.mjs` ("≤60s alt + ≥$99k MC"), and the
   non-clone default `minMarketCapUsd=99_000` in `evaluateUser99k60sEntry`.
5. **Self-modifying CI on main.** `.github/workflows/w6-120s-tests-patch.yml` runs on every push to
   `main`, rewrites source with Python string replacement and pushes to `main` (currently a no-op).
   `w6-120s-patch.yml`, `hotfix-biggj-webapp-boot.yml` are similar one-shot patchers.
6. GMGN demo key is shared and rate-limited (429 → ≥60 s cooldown); coverage of the 1m % is
   partial by design (≤2 token-info samples/cycle). Missing coverage ⇒ no entry (fail closed).
7. Most PRs are closed-unmerged while their commits land on `main` directly; check `main` history,
   not PR merge flags, to know what is live.

### Conventions

- Match the dense one-line style of the surrounding file; freeze returned objects.
- Every new state/output object carries `execution:'SHADOW_ONLY', canExecute:false, canExecuteLive:false`.
- Add tests next to the module (`<module>.test.mjs`, picked up by `npm test`); add new runtime
  modules to `npm run check` and, if release-critical, to `runtime-release-registry.mjs`.
- One logical change per PR; fill `.github/pull_request_template.md`.
