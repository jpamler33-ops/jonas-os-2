const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProjectStatus } = require('./biggj-project-status.cjs');

test('renders canonical project state and safety invariants', () => {
  const body = buildProjectStatus({
    repository: 'jpamler33-ops/jonas-os-2',
    defaultBranch: 'main',
    mainSha: '1234567890abcdef',
    mainTitle: 'feat: example',
    updatedAt: '2026-09-30T10:00:00Z',
    openPrs: [{
      number: 42,
      title: 'feat: parallel work',
      html_url: 'https://github.com/example/repo/pull/42',
      head: { ref: 'feat/test', sha: 'abcdef123456' },
      base: { ref: 'main' },
      updated_at: '2026-09-30T09:00:00Z'
    }],
    recentMergedPrs: [{
      number: 41,
      title: 'fix: previous work',
      html_url: 'https://github.com/example/repo/pull/41',
      merged_at: '2026-09-30T08:00:00Z'
    }],
    recentRuns: [{
      name: 'CI',
      run_number: 7,
      html_url: 'https://github.com/example/repo/actions/runs/7',
      conclusion: 'success',
      status: 'completed',
      head_sha: '1234567890abcdef'
    }]
  });

  assert.match(body, /BIGGJ_PROJECT_STATUS_V1/);
  assert.match(body, /1234567890abcdef/);
  assert.match(body, /#42/);
  assert.match(body, /#41/);
  assert.match(body, /CI #7/);
  assert.match(body, /SHADOW_ONLY/);
  assert.match(body, /canExecuteLive:false/);
  assert.match(body, /TCX_CHAT_HANDOVER_V1/);
});

test('renders empty states without throwing', () => {
  const body = buildProjectStatus({
    repository: 'jpamler33-ops/jonas-os-2',
    defaultBranch: 'main',
    mainSha: 'abc'
  });

  assert.match(body, /No open pull requests/);
  assert.match(body, /No recently merged pull requests/);
  assert.match(body, /No recent workflow runs returned/);
});
