import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveBiggjResearchEpisodes,
  researchEpisodeAssignment,
  BIGGJ_RESEARCH_EPISODE_RESOLVER_VERSION
} from './biggj-research-episode-resolver.mjs';

const HOUR=60*60*1000;
const DAY=24*HOUR;

function row(id,{
  at,
  seenAt=at+1000,
  createdSymbol='BTCUSDT',
  assumptionId='THESIS_WITNESS_SUPPORT_ADEQUATE',
  falsifiers=['WITNESS_NOT_SATISFIED']
}={}){
  return {
    caseId:'case:'+id,
    forecastId:'forecast:'+id,
    assumptionId,
    symbol:createdSymbol,
    decisionAsOf:at-5000,
    issueKnowledgeAt:at-1000,
    firstPersistentStaleAt:at,
    firstSeenByLivingResearchAt:seenAt,
    falsifierCodes:falsifiers
  };
}

test('same-window cases collapse into one conservative episode even across symbols',()=>{
  const created=1_000_000;
  const a=row('a',{at:created+20*HOUR,createdSymbol:'BTCUSDT'});
  const b=row('b',{at:created+21*HOUR,createdSymbol:'ETHUSDT',falsifiers:['WITNESS_EXTERNAL_COUNT_LT_2']});
  const plan=resolveBiggjResearchEpisodes([a,b],{
    hypothesisCreatedAt:created,
    asOf:created+2*DAY
  });
  assert.equal(plan.version,BIGGJ_RESEARCH_EPISODE_RESOLVER_VERSION);
  assert.equal(plan.counts.independentEpisodes,1);
  const aa=researchEpisodeAssignment(plan,a.caseId);
  const bb=researchEpisodeAssignment(plan,b.caseId);
  assert.equal(aa.independentEpisodeId,bb.independentEpisodeId);
  assert.equal(plan.invariants.crossSymbolAloneNeverCreatesIndependence,true);
});

test('same falsifier within extended window stays in one common-cause episode',()=>{
  const created=1_000_000;
  const a=row('a',{at:created+20*HOUR,falsifiers:['WITNESS_NOT_SATISFIED']});
  const b=row('b',{at:created+50*HOUR,falsifiers:['WITNESS_NOT_SATISFIED']});
  const plan=resolveBiggjResearchEpisodes([a,b],{
    hypothesisCreatedAt:created,
    asOf:created+4*DAY
  });
  assert.equal(plan.counts.independentEpisodes,1);
  assert.equal(
    researchEpisodeAssignment(plan,a.caseId).independentEpisodeId,
    researchEpisodeAssignment(plan,b.caseId).independentEpisodeId
  );
});

test('well-separated prospective cases become distinct episode ids',()=>{
  const created=1_000_000;
  const a=row('a',{at:created+20*HOUR,falsifiers:['WITNESS_NOT_SATISFIED']});
  const b=row('b',{at:created+80*HOUR,falsifiers:['WITNESS_EXTERNAL_COUNT_LT_2']});
  const plan=resolveBiggjResearchEpisodes([a,b],{
    hypothesisCreatedAt:created,
    asOf:created+5*DAY
  });
  assert.equal(plan.counts.independentEpisodes,2);
  const aa=researchEpisodeAssignment(plan,a.caseId);
  const bb=researchEpisodeAssignment(plan,b.caseId);
  assert.notEqual(aa.independentEpisodeId,bb.independentEpisodeId);
  assert.equal(aa.statisticalIndependenceProven,false);
  assert.equal(bb.statisticalIndependenceProven,false);
});

test('cases already known at hypothesis creation remain discovery evidence only',()=>{
  const created=1_000_000;
  const a=row('a',{
    at:created-2*HOUR,
    seenAt:created-1000
  });
  const plan=resolveBiggjResearchEpisodes([a],{
    hypothesisCreatedAt:created,
    asOf:created+DAY
  });
  const assignment=researchEpisodeAssignment(plan,a.caseId);
  assert.equal(assignment.status,'IN_SAMPLE_DISCOVERY');
  assert.equal(assignment.independentEpisodeId,null);
  assert.equal(plan.counts.independentEpisodes,0);
  assert.equal(plan.counts.inSampleDiscoveryCases,1);
});

test('case without explicit falsifier cannot be counted as independent episode',()=>{
  const created=1_000_000;
  const a=row('a',{at:created+20*HOUR,falsifiers:[]});
  const plan=resolveBiggjResearchEpisodes([a],{
    hypothesisCreatedAt:created,
    asOf:created+DAY
  });
  const assignment=researchEpisodeAssignment(plan,a.caseId);
  assert.equal(assignment.status,'UNRESOLVED_NO_FALSIFIER');
  assert.equal(assignment.independentEpisodeId,null);
  assert.equal(plan.counts.independentEpisodes,0);
});

test('future knowledge is fail-closed',()=>{
  const created=1_000_000;
  const future=row('future',{
    at:created+2*DAY,
    seenAt:created+2*DAY+1000
  });
  assert.throws(()=>resolveBiggjResearchEpisodes([future],{
    hypothesisCreatedAt:created,
    asOf:created+DAY
  }),/future .* blocked/);
});

test('same UTC date guard remains conservative for medium gaps',()=>{
  const created=Date.parse('2026-09-01T00:00:00Z');
  const a=row('a',{
    at:Date.parse('2026-09-02T01:00:00Z'),
    falsifiers:['WITNESS_NOT_SATISFIED']
  });
  const b=row('b',{
    at:Date.parse('2026-09-02T15:00:00Z'),
    falsifiers:['WITNESS_EXTERNAL_COUNT_LT_2']
  });
  const plan=resolveBiggjResearchEpisodes([a,b],{
    hypothesisCreatedAt:created,
    asOf:Date.parse('2026-09-04T00:00:00Z')
  });
  assert.equal(plan.counts.independentEpisodes,1);
  assert.ok(
    researchEpisodeAssignment(plan,b.caseId).reasons.includes('COMMON_CAUSE_SAME_UTC_DATE')
  );
});
