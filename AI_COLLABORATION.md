# BIGGJ AI Collaboration Protocol

This repository uses GitHub files as an asynchronous shared mailbox between ChatGPT and Claude Code.

## Roles

### Claude Code
Primary implementation agent:
- repository inspection
- code changes
- tests
- local/runtime debugging
- git branches, commits and PRs
- deployment/runtime verification when access is available

### ChatGPT
Second engineering/review agent:
- architecture and strategy review
- independent root-cause analysis
- research
- red-team analysis
- PR/diff review
- writing tasks and review notes for Claude
- reading Claude results and proposing next actions

### Repository owner
Final authority for goals, priorities and risky actions.

Neither AI should treat the other AI's statement as ground truth. Verify important claims.

## Shared files

- `docs/ai/SHARED_STATE.md` — concise verified current project state
- `docs/ai/CHATGPT_TO_CLAUDE.md` — tasks, reviews and questions from ChatGPT
- `docs/ai/CLAUDE_TO_CHATGPT.md` — implementation results and questions from Claude
- `docs/ai/DECISIONS.md` — durable technical decisions and resolved disagreements

## Session protocol

### Claude Code startup
1. Read `CLAUDE.md`.
2. Read this file.
3. Read `docs/ai/SHARED_STATE.md`.
4. Read the newest open item in `docs/ai/CHATGPT_TO_CLAUDE.md`.
5. Read relevant entries in `docs/ai/DECISIONS.md`.
6. Inspect the real repository before acting.

### ChatGPT startup for repository work
1. Read the same shared files from GitHub.
2. Inspect relevant code, commits or PRs through GitHub tools.
3. Place concrete work requests/reviews in `docs/ai/CHATGPT_TO_CLAUDE.md`.
4. Read `docs/ai/CLAUDE_TO_CHATGPT.md` before assuming Claude's work is complete.

## Handoff format

Use this structure for new handoffs:

```md
## TASK <stable-id>
Status: OPEN | ACKNOWLEDGED | BLOCKED | DONE
From: ChatGPT | Claude
To: Claude | ChatGPT
Branch: <branch or n/a>
Commit/PR: <sha / PR / n/a>

### Goal
...

### Verified evidence
...

### Requested action / result
...

### Constraints
...

### Tests / verification
...

### Risks / open questions
...
```

Keep a stable task ID when replying to the same task.

## Evidence hierarchy
When information conflicts, prefer:
1. current repository code
2. active runtime/environment
3. tests
4. deployment state
5. logs/telemetry
6. shared AI documents
7. old prompts/chat summaries

## Disagreement protocol
If Claude and ChatGPT disagree:
- do not silently overwrite the other view;
- add a `DISAGREEMENT` section to the relevant handoff;
- state each hypothesis;
- list evidence;
- propose the cheapest decisive test;
- use the test result to update `DECISIONS.md`.

## Editing rules
- Keep `SHARED_STATE.md` concise and current.
- Do not put secrets, tokens, private keys or credentials in any AI collaboration file.
- Do not put fabricated runtime results in these files.
- Prefer commit SHAs, file paths, test commands and observed outputs over vague summaries.
- Durable decisions go to `DECISIONS.md`; transient chatter does not.
- The collaboration files are coordination metadata, not substitutes for code/tests.

## Completion rule
A task is not DONE just because code was written. Record which of these were actually completed:
- code inspection
- root cause verified
- implementation
- regression tests
- full relevant test suite
- diff review
- merge
- deploy
- runtime verification

Mark anything not performed as NOT VERIFIED.
