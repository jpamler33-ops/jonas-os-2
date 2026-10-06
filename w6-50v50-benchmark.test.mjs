import test from 'node:test';
import assert from 'node:assert/strict';
import {buildW650v50Cohort,scoreW650v50Cohort,W6_CHECKPOINT_SECONDS,W6_SIZE_SOL} from './w6-50v50-benchmark.mjs';

function row(i,match,now){
  const age=30+(i%5)*15;
  const entry=1;
  const prices={};
  for(const s of W6_CHECKPOINT_SECONDS)prices[s]=match?1.02:0.99;
  return {tokenAddress:`${match?'S':'C'}${i}`,symbol:`${match?'S':'C'}${i}`,priceUsd:entry,marketCap:match?120000:90000,liquidityUsd:20000,pairCreatedAt:now-age*1000,checkpointPrices:prices};
}

test('builds exactly 50 strategy and 50 matched controls without weakening strict <120s W6 rule',()=>{
  const now=1_800_000_000_000;
  const rows=[];
  for(let i=0;i<50;i++){rows.push(row(i,true,now));rows.push(row(i,false,now));}
  const c=buildW650v50Cohort(rows,{now});
  assert.equal(c.complete,true);
  assert.equal(c.strategy.length,50);
  assert.equal(c.controls.length,50);
  assert.equal(c.canExecute,false);
  assert.equal(c.canExecuteLive,false);
  assert.ok(c.strategy.every(x=>x.ageSeconds<120&&x.signal.match===true));
  assert.ok(c.controls.every(x=>x.signal.match!==true));
});

test('120.000 seconds is never accepted into strategy arm',()=>{
  const now=1_800_000_000_000;
  const rows=[{...row(999,true,now),pairCreatedAt:now-120000}];
  const c=buildW650v50Cohort(rows,{now,targetPerArm:1});
  assert.equal(c.strategy.length,0);
  assert.equal(c.complete,false);
});

test('scores all sizing/checkpoint lanes and remains shadow-only',()=>{
  const now=1_800_000_000_000;
  const rows=[];
  for(let i=0;i<50;i++){rows.push(row(i,true,now));rows.push(row(i,false,now));}
  const c=buildW650v50Cohort(rows,{now});
  const out=scoreW650v50Cohort(c);
  assert.equal(out.complete,true);
  assert.equal(out.canExecute,false);
  assert.equal(out.canExecuteLive,false);
  assert.equal(out.strategy.rows.length,50*W6_SIZE_SOL.length*W6_CHECKPOINT_SECONDS.length);
  assert.ok(out.strategy.bySize[1].winRate>out.controls.bySize[1].winRate);
});
