import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('autolearn retries the unchanged memory gate after bounded post-issue GC',async()=>{
  const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  assert.match(source,/AUTOLEARN_POST_ISSUE_RESCUE/);
  assert.match(source,/cooldownBypassOverageMb:10/);
  assert.match(source,/const rescuedAdmission=admissionFor\(process\.memoryUsage\(\)\)/);
  assert.match(source,/if\(rescuedAdmission\.allowed\)/);
  assert.match(source,/postIssueGcRescues\+\+/);
  assert.match(source,/postIssueGcReclaimedMb/);
  assert.match(source,/issueHeapMb:autoLearnHeapHeadroomMb/);
  assert.doesNotMatch(source,/issueHeapMb:autoLearnHeapHeadroomMb\s*\+/);
  assert.doesNotMatch(source,/issueRssMb:autoLearnRssHeadroomMb\s*\+/);
  assert.doesNotMatch(source,/issueExternalMb:autoLearnExternalHeadroomMb\s*\+/);
});

test('failed rescue still follows the existing defer/backoff path',async()=>{
  const source=await readFile(new URL('./bot.mjs',import.meta.url),'utf8');
  const start=source.indexOf("AUTOLEARN_POST_ISSUE_RESCUE");
  assert.ok(start>=0);
  const block=source.slice(start,start+5000);
  assert.match(block,/if\(!postAdmission\.allowed\)/);
  assert.match(block,/deferred\+\+/);
  assert.match(block,/transientPostIssuePressure=true/);
  assert.match(block,/memoryPressure=true/);
  assert.match(block,/break;/);
});
