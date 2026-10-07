# BIGGJ AI Collaboration Decisions

Durable engineering decisions shared by ChatGPT and Claude Code live here.

Do not store temporary speculation. Every decision should include evidence or a link to the commit/PR/test that resolved it.

---

## DECISION AI-COLLAB-001 — GitHub is the shared AI handoff layer
Status: ACCEPTED

### Decision
Claude Code and ChatGPT coordinate asynchronously through:
- `docs/ai/SHARED_STATE.md`
- `docs/ai/CHATGPT_TO_CLAUDE.md`
- `docs/ai/CLAUDE_TO_CHATGPT.md`
- this decisions log

### Reason
Both agents can independently inspect the repository. GitHub provides versioned, reviewable, auditable handoffs and avoids relying on copied chat context.

### Guardrails
- repository/runtime evidence outranks AI notes;
- no secrets in handoff documents;
- important claims must be verifiable;
- disagreements are recorded and resolved by evidence/tests rather than by authority.
