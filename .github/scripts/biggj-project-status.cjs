const oneLine = (value) =>
  String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const shortSha = (value) => oneLine(value).slice(0, 12) || 'unknown';

const iso = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? oneLine(value) || 'unknown' : date.toISOString();
};

const listOrEmpty = (items, render, emptyText) =>
  Array.isArray(items) && items.length ? items.map(render).join('\n') : `- ${emptyText}`;

function buildProjectStatus(input = {}) {
  const repository = oneLine(input.repository) || 'unknown/unknown';
  const defaultBranch = oneLine(input.defaultBranch) || 'main';
  const mainSha = oneLine(input.mainSha) || 'unknown';
  const mainTitle = oneLine(input.mainTitle) || 'unknown';
  const updatedAt = iso(input.updatedAt || new Date().toISOString());

  const openPrs = Array.isArray(input.openPrs) ? input.openPrs : [];
  const recentMergedPrs = Array.isArray(input.recentMergedPrs) ? input.recentMergedPrs : [];
  const recentRuns = Array.isArray(input.recentRuns) ? input.recentRuns : [];

  const openLines = listOrEmpty(
    openPrs,
    (pr) =>
      `- [#${pr.number} · ${oneLine(pr.title)}](${pr.html_url}) — \`${oneLine(pr.head?.ref)}\` → \`${oneLine(pr.base?.ref)}\` · updated ${iso(pr.updated_at)}`,
    'No open pull requests.'
  );

  const mergedLines = listOrEmpty(
    recentMergedPrs,
    (pr) =>
      `- [#${pr.number} · ${oneLine(pr.title)}](${pr.html_url}) — merged ${iso(pr.merged_at)}`,
    'No recently merged pull requests.'
  );

  const runLines = listOrEmpty(
    recentRuns,
    (run) => {
      const result = oneLine(run.conclusion) || oneLine(run.status) || 'unknown';
      const label = oneLine(run.name) || 'workflow';
      const runNumber = run.run_number ? ` #${run.run_number}` : '';
      return `- [${label}${runNumber}](${run.html_url}) — **${result}** · ${shortSha(run.head_sha)}`;
    },
    'No recent workflow runs returned.'
  );

  const metadata = {
    schema: 'BIGGJ_PROJECT_STATUS_V1',
    repository,
    defaultBranch,
    mainSha,
    updatedAt,
    openPullRequests: openPrs.map((pr) => ({
      number: pr.number,
      head: oneLine(pr.head?.ref),
      base: oneLine(pr.base?.ref),
      headSha: oneLine(pr.head?.sha),
      updatedAt: pr.updated_at || null
    }))
  };

  return `<!-- BIGGJ_PROJECT_STATUS_V1 -->

# BIGGJ Project Status

> Auto-generated GitHub control-plane index. Do not use this issue as a manual handover document.

## Canonical main

- Repository: \`${repository}\`
- Branch: \`${defaultBranch}\`
- Main SHA: \`${mainSha}\`
- Latest commit: \`${mainTitle}\`
- Status refreshed: \`${updatedAt}\`

## Open parallel work

${openLines}

## Recent merged work

${mergedLines}

## Recent GitHub Actions signals on \`${defaultBranch}\`

${runLines}

## New-chat recovery protocol

1. Read \`AGENTS.md\`.
2. Read this issue.
3. Inspect current \`${defaultBranch}\` and the latest commits.
4. Inspect open PRs that overlap the intended files.
5. Read relevant \`TCX_CHAT_HANDOVER_V1\` comments.
6. Continue only from the newest compatible state.
7. Use \`inspect -> branch -> small commits -> tests -> PR -> CI -> merge -> live verify\`.
8. Record blockers and next steps in the PR, not in a shared static handover file.

## Non-negotiable TCX / BIGGJ safety invariants

- \`SHADOW_ONLY\`
- \`ABSTAIN\` remains first-class
- \`canExecute:false\`
- \`canExecuteLive:false\`
- no real exchange orders
- Point-in-Time / no future leakage
- \`OBSERVED / INFERRED / MODELLED / ASSUMED\` separation
- scientific guards are never loosened merely to produce more trades
- research/challenger evidence must not silently mutate PRIMARY policy

<details>
<summary>Machine-readable status metadata</summary>

\`\`\`json
${JSON.stringify(metadata, null, 2)}
\`\`\`
</details>
`;
}

module.exports = { buildProjectStatus };
