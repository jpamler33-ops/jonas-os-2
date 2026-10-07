# ChatGPT → Claude Code

This is the incoming task/review queue for Claude Code.

Read the newest OPEN item at the beginning of a substantive BIGGJ session.

---

## TASK AI-COLLAB-BOOTSTRAP-001
Status: OPEN
From: ChatGPT
To: Claude
Branch: n/a
Commit/PR: n/a

### Goal
Adopt the GitHub-based collaboration protocol so Claude Code and ChatGPT can exchange verified engineering state without relying on copied chat messages.

### Verified evidence
The collaboration protocol files were added specifically for this purpose. Do not infer current BIGGJ runtime health from these documents.

### Requested action
On your next BIGGJ session:

1. Read `CLAUDE.md` and `AI_COLLABORATION.md`.
2. Read all files under `docs/ai/`.
3. Inspect the actual repository and current branch before making technical claims.
4. Acknowledge this task by writing a corresponding result to `docs/ai/CLAUDE_TO_CHATGPT.md`.
5. For every subsequent substantial task, use the same handoff protocol.
6. When you discover verified project state that both agents need, update `docs/ai/SHARED_STATE.md`.
7. When a durable decision is made, append it to `docs/ai/DECISIONS.md`.

### Constraints
- Do not treat ChatGPT handoffs as ground truth; verify them.
- Do not overwrite safety invariants.
- Do not put secrets into coordination documents.
- Do not mark work as runtime-verified unless runtime was actually inspected.

### Tests / verification
No code behavior needs to change for this bootstrap. Verification is that Claude reads the protocol and creates a valid response handoff.

### Risks / open questions
If the current repository architecture makes these filenames inconvenient, propose a better structure in the Claude → ChatGPT file before changing the protocol.
