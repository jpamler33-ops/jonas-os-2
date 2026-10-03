import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import {
  openShadowPortfolioColdArchive,
  archiveClosedShadowPositions,
  shadowPortfolioColdArchiveSummary
} from './shadow-portfolio-cold-archive.mjs';

function closedPosition(id='sp_1',overrides={}){
  return {
    positionId:id,
    entryOrderId:'order_'+id,
    symbol:'BTCUSDT',
    side:'LONG',
    status:'CLOSED',
    qtyBase:1,
    entryPrice:100,
    entryQuote:100,
    openedAt:1000,
    closedAt:2000,
    realizedNetPnlQuote:2,
    realizedReturnPct:.02,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    frozenPolicyParameters:{large:'x'.repeat(2000)},
    ...overrides
  };
}

test('cold archive appends verified closed positions and reopens concatenated gzip members',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-shadow-cold-'));
  const file=path.join(dir,'cold.jsonl.gz');
  const archive=await openShadowPortfolioColdArchive(file);
  assert.equal(archive.healthy,true);
  const a=await archiveClosedShadowPositions(archive,[closedPosition('sp_a')]);
  const b=await archiveClosedShadowPositions(archive,[closedPosition('sp_b')]);
  assert.equal(a.archived,1);
  assert.equal(b.archived,1);
  assert.ok(archive.bytes>0);

  const reopened=await openShadowPortfolioColdArchive(file);
  assert.equal(reopened.healthy,true,reopened.error);
  assert.equal(reopened.records,2);
  assert.equal(reopened.hashes.has('sp_a'),true);
  assert.equal(reopened.hashes.has('sp_b'),true);
  assert.equal(shadowPortfolioColdArchiveSummary(reopened).destructiveRetention,false);
});

test('cold archive deduplicates identical positions and fails closed on changed immutable record',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-shadow-cold-dedupe-'));
  const file=path.join(dir,'cold.jsonl.gz');
  const archive=await openShadowPortfolioColdArchive(file);
  const original=closedPosition('sp_same');
  await archiveClosedShadowPositions(archive,[original]);
  const duplicate=await archiveClosedShadowPositions(archive,[structuredClone(original)]);
  assert.equal(duplicate.archived,0);
  assert.equal(duplicate.skipped,1);

  await assert.rejects(
    ()=>archiveClosedShadowPositions(archive,[closedPosition('sp_same',{realizedNetPnlQuote:999})]),
    /SHADOW_COLD_ARCHIVE_CONFLICT/
  );
});

test('open position is never admitted into closed cold archive',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-shadow-cold-open-'));
  const file=path.join(dir,'cold.jsonl.gz');
  const archive=await openShadowPortfolioColdArchive(file);
  const result=await archiveClosedShadowPositions(archive,[closedPosition('sp_open',{status:'OPEN'})]);
  assert.equal(result.archived,0);
  assert.equal(archive.records,0);
});
