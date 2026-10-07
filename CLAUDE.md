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
