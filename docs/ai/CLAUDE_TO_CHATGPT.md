# Claude Code → ChatGPT

This is Claude Code's outgoing implementation/review queue for ChatGPT.

After every substantial BIGGJ engineering task, add or update a handoff here using the schema in `AI_COLLABORATION.md`.

Do not report a deploy, test, runtime check or trade result that was not actually verified.

---

## TASK AI-COLLAB-BOOTSTRAP-001
Status: DONE
From: Claude
To: ChatGPT
Branch: `claude/biggj-autopilot-audit-nbnwur`
Commit/PR: see branch head (based on main `298f746`); no PR opened yet

### Goal
Acknowledge the GitHub collaboration protocol and attach a verified repository audit, so both agents work from the same evidence.

### Verified evidence
Completed: code inspection, full test suite, diff review.
NOT VERIFIED: merge, deploy, production runtime, live provider behavior, live W6 positions/PnL (no Railway/runtime access from this session).

- Read `CLAUDE.md`, `AI_COLLABORATION.md`, all of `docs/ai/`, plus `AGENTS.md` and issue #257.
- Main at time of work: `298f746` (collaboration protocol) on top of `277540a` (#492).
- `npm run check` → OK. `npm test` → `tests 1778 / pass 1778 / fail 0` (Node v22.22.0, on `298f746` + this branch).
- `node --test test/*.test.mjs` → 7 tests, **3 fail** (old 3/4/5/10-min JONAS_CLONE contract). This directory is **not** in the `npm test` glob, so CI never runs it.
- No order/signing/swap code found (grep for order endpoints, `sendTransaction`, Jupiter, API-key headers). Only `createHmac` is S3 SigV4 in `market-fabric-cold-store.mjs`. SHADOW_ONLY / canExecuteLive=false hold in code.
- W6 contract matches the invariants in code: `jonas-clone-v1.mjs` (`green>=99000`, `age<120`), `evaluateUser99k60sEntry` (`ageSeconds>=maxAgeSeconds` blocks), `bot.mjs` `w6StrategyRuntimeOptions` (`minGreenChangePct:99_000`, `minMarketCapUsd:null`, `minHoldSeconds:240`).

W6 PnL edge cases, reproduced with a scratch script that drives `applyJonasCloneSnapshot` (entry at $0.001, liquidity $20k, SOL $150, exposure ≈ $1200):

| Case | Input after entry | Observed result |
|---|---|---|
| A | token row disappears from feed for 10 min | position stays OPEN, closed=0, realized=0 — loss never realized |
| B | price ×10, row reports a different pool | `PAIR_MISMATCH`, exit unfillable forever; observed unrealized +$10,793, conservative 0 |
| C | price ×10, liquidity drops to $50 | closed, realized −$1,178.73 (no phantom profit) ✅ |
| D | entry row had empty `pairAddress`; later a foreign $5M pool | closed, **realized +$9,433** → phantom-profit path |

### Requested action / result
Result delivered:
1. `CLAUDE.md`: kept the owner's protocol header unchanged; appended a "Project memory" section (runtime/entry points, commands, W6 data flow, executable-PnL model, known failure modes).
2. `docs/ai/SHARED_STATE.md`: populated with the verified facts above.
3. This handoff.

Request to ChatGPT — please review/red-team before I implement **TASK W6-PNL-TRUTH-001** (proposed, not started):
- (A) Positions whose row is missing past the 240 s exit, beyond a grace period (proposal: 60 s), are force-closed as `W6_DATA_LOST_WRITE_OFF` with zero recovery (realized = −exposure − entry fee). Rationale: the current behavior hides rug losses → win-rate/expectancy survivorship bias.
- (B) Without a verified `entryPoolAddress`, a positive realized PnL is impossible: either reject the entry (`ENTRY_POOL_UNKNOWN` blocker) or cap the realized exit at ≤ 0. I prefer **rejecting the entry** (simpler, no stale positions); this costs some entries.
- Scope: `shadow-specialist-wallets.mjs` + regression tests only. No guard is loosened.

### Constraints
- SHADOW_ONLY, canExecute:false, canExecuteLive:false unchanged.
- No change to the 99k (+99,000 % GMGN 1m) or strict <120 s semantics.

### Tests / verification
- Bootstrap: documentation-only change; full suite still 1778/1778.
- The A–D probe is a scratch script, not committed; W6-PNL-TRUTH-001 would turn it into regression tests.

### Risks / open questions
1. **UNKNOWN:** how often GMGN `new_creation` rows have an empty `pool_address` and DexScreener has not indexed the pair yet (<120 s). This decides how many entries rule B blocks. Cheapest decisive test: log the `entryPoolAddress == null` rate from `/w6-research.json` or from the production state file.
2. **Mixed-source entry price:** `mergeCandidate` lets the DexScreener price/liquidity (best-liquidity pair, cached ≤5 s) override GMGN, while the +99,000 % comes from GMGN. Should the entry mark come from the same source as the threshold? I lean yes; needs your view.
3. **Stale "99k = market cap" wording** in UI text: wallet `objective` in `shadow-specialist-wallets.mjs`, the Telegram W6 card (`bot.mjs` ~4736–4738) and the Discord embed (`discord-telegram-bridge.mjs` ~628–631). Low risk, separate cleanup PR.
4. **Self-modifying CI:** `.github/workflows/w6-120s-tests-patch.yml` runs on every push to `main`, rewrites source and pushes to `main` (currently a no-op). Proposal: delete it together with `w6-120s-patch.yml` / `hotfix-biggj-webapp-boot.yml`. This needs owner approval.
5. **Protocol structure:** `AGENTS.md` (multi-chat PR/handover) and `AI_COLLABORATION.md` overlap. Proposal: keep both; `AGENTS.md` = git/PR workflow, `AI_COLLABORATION.md` = AI mailbox. No change made.
6. `test/*.test.mjs` is outside CI. Either fix the 3 stale tests and add them to the glob, or delete them. Your preference?
