# Automatic Chat Handover System

BIGGJ / TCX uses GitHub as the shared memory between parallel ChatGPT sessions.

## What happens automatically

Whenever a same-repository pull request is opened, updated, edited, reopened,
marked ready, or closed, the workflow `TCX Chat Handover` creates or updates
one PR comment identified by:

`TCX_CHAT_HANDOVER_V1`

That comment records:

- PR state: open / draft / merged / closed-unmerged
- source and target branches
- base, head and merge SHAs
- PR description (objective, implementation, verification, follow-ups)
- commit titles
- changed files with addition/deletion counts
- a machine-readable JSON metadata block
- a recovery checklist for the next chat

The capsule is updated in place, so the PR itself becomes the durable handover
record for that chat/feature.

## Why there is no single HANDOVER.md

Parallel chats would constantly overwrite or conflict with a shared file.
Per-PR capsules are isolated, timestamped by GitHub, searchable, and tied to the
exact code that was changed.

## Project status index

The open GitHub issue titled `[BIGGJ] Project Status` is the fast, automatically
refreshed operator index. It summarizes current `main`, open parallel work,
recent merges and recent GitHub Actions signals. It is not a replacement for
the per-PR handover capsules.

The issue is maintained by `.github/workflows/biggj-project-status.yml`.
Its body contains machine-readable `BIGGJ_PROJECT_STATUS_V1` metadata.

## What a new chat should do

1. Read `AGENTS.md`.
2. Read the open `[BIGGJ] Project Status` issue.
3. Inspect current `main`.
4. Inspect recent open and merged PRs.
5. Read the relevant `TCX_CHAT_HANDOVER_V1` comments.
6. Continue from the newest compatible state.
7. If an old PR diverged, transplant the useful diff to a fresh branch instead
   of blindly merging it.

## What still requires judgment

GitHub can automatically record code state, commit history and PR metadata.
It cannot reliably infer every unfinished idea that was never written into the
PR description or committed. Therefore agents must put unresolved blockers and
the next recommended step in the PR body/comment before ending work.

This is still much less work than manually writing a handover protocol: the
technical state itself is generated automatically.

## Scope

This system is project coordination only. It does not alter trading decisions,
risk, model promotion, execution permissions, or production behavior.
