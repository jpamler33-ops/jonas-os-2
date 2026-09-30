# TCX / BIGGJ Multi-Chat Agent Protocol

This repository is developed by multiple parallel ChatGPT sessions. Treat GitHub as the canonical cross-chat memory.

## Mandatory start sequence

Before changing code:

1. Read the latest commits on `main`.
2. Read recent open and merged pull requests.
3. For relevant PRs, read the comment containing `TCX_CHAT_HANDOVER_V1`.
4. Inspect any branch that overlaps your intended files.
5. Preserve parallel work. Never overwrite another chat's branch or silently replace a file from an older base.

If `main` moved after your branch was created, compare the new commits first. Recreate or rebase your work on current `main` when necessary.

## Mandatory work sequence

All meaningful code changes MUST use:

`inspect -> branch -> small commits -> tests -> PR -> CI -> merge -> live verify`

Do not push meaningful feature work directly to `main`.

Every PR automatically receives a GitHub handover capsule from
`.github/workflows/tcx-chat-handover.yml`.

The PR description should contain, when known:

- Objective / problem
- What changed
- Safety invariants
- Live verification status
- Open follow-ups / next recommended step

The handover workflow supplements this with branch/base/head SHAs, commit list,
changed files, PR state, merge commit and a machine-readable metadata block.
Do not manually maintain a shared handover file.

## Mandatory end sequence

Before ending a chat or handing work to another chat:

1. Ensure all meaningful work is committed to a named branch.
2. Ensure a PR exists for that branch.
3. Ensure the automated `TCX_CHAT_HANDOVER_V1` comment exists and is current.
4. If merged, record live verification in the PR body or a normal PR comment when available.
5. If not merged, leave the PR open with the exact blocker in its body/comment.
6. Do not ask the user to manually copy a handover protocol when GitHub already contains the work state.

A future chat should be able to recover the project state from GitHub alone.

## Parallel-work rules

- Never blindly merge a stale/diverged PR.
- Never replace another chat's newer file with an older copy.
- Prefer transplanting a small diff onto current `main` when branches diverge.
- One logical feature per PR.
- Preserve release identity / Docker packaging / CI bindings when a runtime module becomes live.
- State observed facts separately from intended behavior. Do not claim a feature is live before deployment verification.

## TCX safety invariants

Unless the user explicitly changes the project mode and the repository policy permits it:

- `SHADOW_ONLY`
- `canExecute:false`
- `canExecuteLive:false`
- no real exchange orders
- Point-in-Time / no future leakage
- `ABSTAIN` remains first-class
- `OBSERVED / INFERRED / MODELLED / ASSUMED` separation
- scientific guards are never loosened merely to produce more trades
- research/challenger evidence must not silently mutate PRIMARY policy
