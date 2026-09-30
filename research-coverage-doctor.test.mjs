import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchCoverageDiagnostic, buildResearchCoverageFleetSummary } from './research-coverage-doctor.mjs';

test('coverage doctor explains blocked features and source reasons',()=>{
  const graph={
    streamKey:'ETHUSDT',
    gate:'ABSTAIN',
    reasons:['BLOCKED_FEATURE_DEPENDENCIES'],
    fingerprint:'f'.repeat(64),
    impact:{
      totalFeatures:10,usableFeatures:7,blockedFeatures:3,degradedFeatures:0,coverage:.7,
      blockedFeatureIds:['f.a','f.b','f.c'],
      degradedFeatureIds:[],
      impactedSourceKeys:['DERIVATIVES:OKX_PUBLIC']
    },
    nodes:[
      {type:'FACTOR',domain:'DERIVATIVES',state:'BLOCKED',featureCount:3,blockedFeatures:3,degradedFeatures:0}
    ]
  };
  const governance={
    sources:[{
      sourceKey:'DERIVATIVES:OKX_PUBLIC',
      status:'QUARANTINED',
      lastDecision:'QUARANTINE',
      consecutiveViolations:3,
      silenceMs:1200,
      lastReasons:[{code:'PUBLICATION_LAG_SLO_BREACH'},{code:'SOURCE_AUTO_QUARANTINED'}]
    }]
  };
  const d=buildResearchCoverageDiagnostic(graph,governance,{symbol:'ETHUSDT',observedAt:2000});
  assert.equal(d.status,'BLOCKED');
  assert.equal(d.coverage,.7);
  assert.deepEqual(d.sources[0].reasonCodes,['PUBLICATION_LAG_SLO_BREACH','SOURCE_AUTO_QUARANTINED']);
  assert.equal(d.factorProblems[0].domain,'DERIVATIVES');
  assert.equal(d.canExecute,false);
});

test('fleet summary ranks blocked symbols and aggregates recurring blockers',()=>{
  const rows=[
    {symbol:'BTCUSDT',observedAt:1,status:'DEGRADED',gate:'CAUTION',coverage:.8,blockedFeatures:0,degradedFeatures:2,blockedFeatureIds:[],impactedSourceKeys:['OPTIONS:X']},
    {symbol:'ETHUSDT',observedAt:2,status:'BLOCKED',gate:'ABSTAIN',coverage:.4,blockedFeatures:4,degradedFeatures:0,blockedFeatureIds:['a','b'],impactedSourceKeys:['OPTIONS:X','DERIVATIVES:Y']},
    {symbol:'SOLUSDT',observedAt:3,status:'BLOCKED',gate:'ABSTAIN',coverage:.6,blockedFeatures:2,degradedFeatures:0,blockedFeatureIds:['a'],impactedSourceKeys:['OPTIONS:X']}
  ];
  const s=buildResearchCoverageFleetSummary(rows,{now:10});
  assert.equal(s.symbols,3);
  assert.equal(s.blocked,2);
  assert.equal(s.topBlockedSources[0].id,'OPTIONS:X');
  assert.equal(s.topBlockedSources[0].count,3);
  assert.equal(s.topBlockedFeatures[0].id,'a');
  assert.equal(s.topBlockedFeatures[0].count,2);
  assert.equal(s.worstSymbols[0].symbol,'ETHUSDT');
  assert.equal(s.canExecute,false);
});
