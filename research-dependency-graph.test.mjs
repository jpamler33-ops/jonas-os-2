import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResearchDependencyGraph,
  verifyResearchDependencyGraph,
  explainResearchFeatureLineage,
  researchDependencyGraphSummary,
  bindResearchDependencyGateToValidity
} from './research-dependency-graph.mjs';

const H='a'.repeat(64);
const R1='1'.repeat(64);
const R2='2'.repeat(64);

function rec({
  seq=1,recordHash=R1,source='SRC_A',domain='DERIVATIVES',featureId='f.a',value=1,
  availableAt=1000,validUntil=5000,decision='ACCEPT',sourceStatus='HEALTHY',usable=true
}={}){
  return {
    seq,recordHash,streamKey:'BTCUSDT',domain,source,sourceEventId:'e'+seq,
    availableAt,validUntil,features:[{id:featureId,value}],
    governance:{sourceKey:domain+':'+source,decision,sourceStatus,usableForResearch:usable}
  };
}
function plane(records,{healthy=true,totalRecords=records.length}={}){
  return {healthy,records,totalRecords,tailHash:'b'.repeat(64)};
}
function gov(rows,updatedAt=1200){return {updatedAt,sources:rows};}

test('deterministic graph binds source observation feature factor forecast and locked decision',()=>{
  const p=plane([rec()]);
  const g1=buildResearchDependencyGraph({plane:p,streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1600,forecastInputFingerprint:H});
  const g2=buildResearchDependencyGraph({plane:p,streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1600,forecastInputFingerprint:H});
  assert.equal(g1.fingerprint,g2.fingerprint);
  assert.equal(verifyResearchDependencyGraph(g1).ok,true);
  for(const type of ['SOURCE','OBSERVATION','FEATURE','FACTOR','FORECAST','DECISION']) assert.ok(g1.nodes.some(x=>x.type===type));
  assert.ok(g1.nodes.some(x=>x.id==='DECISION:ABSTAIN'));
  assert.equal(g1.safety.canExecute,false);
});

test('current quarantine cascades through active feature to forecast gate',()=>{
  const p=plane([rec()]);
  const summary=gov([{sourceKey:'DERIVATIVES:SRC_A',status:'QUARANTINED'}],1200);
  const g=buildResearchDependencyGraph({plane:p,governanceSummary:summary,streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1600,forecastInputFingerprint:H});
  assert.equal(g.gate,'ABSTAIN');
  assert.equal(g.impact.blockedFeatures,1);
  assert.deepEqual(g.impact.impactedSourceKeys,['DERIVATIVES:SRC_A']);
  const x=explainResearchFeatureLineage(g,'f.a');
  assert.equal(x.feature.state,'BLOCKED');
  assert.equal(x.sources[0].status,'QUARANTINED');
});

test('healthy alternate source keeps same feature usable when another contributor is quarantined',()=>{
  const p=plane([
    rec({seq:1,recordHash:R1,source:'SRC_A'}),
    rec({seq:2,recordHash:R2,source:'SRC_B'})
  ]);
  const summary=gov([
    {sourceKey:'DERIVATIVES:SRC_A',status:'QUARANTINED'},
    {sourceKey:'DERIVATIVES:SRC_B',status:'HEALTHY'}
  ],1200);
  const g=buildResearchDependencyGraph({plane:p,governanceSummary:summary,streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1600,forecastInputFingerprint:H});
  assert.equal(g.gate,'PASS');
  assert.equal(g.impact.healthyFeatures,1);
  assert.equal(g.impact.blockedFeatures,0);
  const x=explainResearchFeatureLineage(g,'f.a');
  assert.equal(x.feature.usableContributorCount,1);
  assert.equal(x.sources.length,2);
});

test('future observations are excluded from the graph',()=>{
  const p=plane([
    rec({seq:1,recordHash:R1,featureId:'f.old',availableAt:1000,validUntil:5000}),
    rec({seq:2,recordHash:R2,featureId:'f.future',availableAt:2000,validUntil:5000})
  ]);
  const g=buildResearchDependencyGraph({plane:p,streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1500,forecastInputFingerprint:H});
  assert.equal(g.impact.totalFeatures,1);
  assert.equal(g.nodes.some(x=>x.id==='FEATURE:f.future'),false);
  assert.equal(verifyResearchDependencyGraph(g).ok,true);
});

test('governance state from after knowledge time is ignored to prevent time travel',()=>{
  const p=plane([rec()]);
  const summary=gov([{sourceKey:'DERIVATIVES:SRC_A',status:'QUARANTINED'}],3000);
  const g=buildResearchDependencyGraph({plane:p,governanceSummary:summary,streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1600,forecastInputFingerprint:H});
  assert.equal(g.governanceView.usable,false);
  assert.ok(g.reasons.includes('GOVERNANCE_VIEW_AFTER_KNOWLEDGE_TIME_IGNORED'));
  assert.equal(g.gate,'PASS');
});

test('historical request outside retained window fails closed',()=>{
  const p=plane([rec({availableAt:2000,validUntil:5000})],{totalRecords:100});
  const g=buildResearchDependencyGraph({plane:p,streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1500,forecastInputFingerprint:H});
  assert.equal(g.retention.historyTruncated,true);
  assert.equal(g.gate,'ABSTAIN');
  assert.ok(g.reasons.includes('HISTORY_TRUNCATED_BEFORE_ASOF'));
});

test('ungoverned records are blocked by default',()=>{
  const r=rec();
  delete r.governance;
  const g=buildResearchDependencyGraph({plane:plane([r]),streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1500,forecastInputFingerprint:H});
  assert.equal(g.gate,'ABSTAIN');
  assert.equal(g.impact.blockedFeatures,1);
});

test('tampering invalidates the graph fingerprint',()=>{
  const g=buildResearchDependencyGraph({plane:plane([rec()]),streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1500,forecastInputFingerprint:H});
  const tampered=structuredClone(g);
  tampered.impact.coverage=0;
  assert.equal(verifyResearchDependencyGraph(tampered).ok,false);
  assert.ok(verifyResearchDependencyGraph(tampered).reasons.includes('FINGERPRINT'));
});

test('summary remains research-only',()=>{
  const g=buildResearchDependencyGraph({plane:plane([rec()]),streamKey:'BTCUSDT',asOf:1500,knowledgeTime:1500,forecastInputFingerprint:H});
  const s=researchDependencyGraphSummary(g);
  assert.equal(s.integrity,'VALID');
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.action,'ABSTAIN');
  assert.equal(s.canExecute,false);
});


test('dependency admission binding fails closed when graph is unavailable',()=>{
  const v=bindResearchDependencyGateToValidity({status:'VALID',reasons:[]},null);
  assert.equal(v.status,'ABSTAIN');
  assert.equal(v.dependencyGate,'ABSTAIN');
  assert.ok(v.reasons.includes('DEPENDENCY_GRAPH_UNAVAILABLE'));
  assert.equal(v.execution,'SHADOW_ONLY');
  assert.equal(v.canExecute,false);
});

test('dependency admission binding makes blocked graph stricter than valid research',()=>{
  const g=buildResearchDependencyGraph({
    plane:plane([rec()]),
    governanceSummary:gov([{sourceKey:'DERIVATIVES:SRC_A',status:'QUARANTINED'}]),
    streamKey:'BTCUSDT',
    asOf:1500,
    knowledgeTime:1600,
    forecastInputFingerprint:H
  });
  const v=bindResearchDependencyGateToValidity({status:'VALID',reasons:['BASE_OK']},g);
  assert.equal(g.gate,'ABSTAIN');
  assert.equal(v.status,'ABSTAIN');
  assert.ok(v.reasons.includes('DEPENDENCY_BLOCKED_FEATURE_DEPENDENCIES'));
  assert.ok(v.reasons.includes('BASE_OK'));
});

test('dependency admission binding preserves stricter existing validity',()=>{
  const g=buildResearchDependencyGraph({
    plane:plane([rec()]),
    streamKey:'BTCUSDT',
    asOf:1500,
    knowledgeTime:1600,
    forecastInputFingerprint:H
  });
  assert.equal(g.gate,'PASS');
  const v=bindResearchDependencyGateToValidity({status:'EXPIRED',reasons:['OLD_STATE']},g);
  assert.equal(v.status,'EXPIRED');
  assert.ok(v.reasons.includes('OLD_STATE'));
});


test('derived source is blocked when an upstream source is quarantined',()=>{
  const derived={
    seq:3,
    recordHash:'3'.repeat(64),
    streamKey:'BTCUSDT',
    domain:'DERIVATIVES',
    source:'BINANCE_OKX_DERIVED',
    sourceEventId:'derived-3',
    availableAt:1000,
    validUntil:5000,
    features:[{id:'research.derivatives.fundingRateVenueSpread',value:.0001}],
    provenance:{dependencies:['DERIVATIVES:BINANCE_USDM_PUBLIC','DERIVATIVES:OKX_PUBLIC']},
    governance:{
      sourceKey:'DERIVATIVES:BINANCE_OKX_DERIVED',
      decision:'ACCEPT',
      sourceStatus:'HEALTHY',
      usableForResearch:true
    }
  };
  const p=plane([
    rec({seq:1,recordHash:R1,source:'BINANCE_USDM_PUBLIC',featureId:'research.derivatives.fundingRate'}),
    rec({seq:2,recordHash:R2,source:'OKX_PUBLIC',featureId:'research.derivatives.okxFundingRate'}),
    derived
  ]);
  const summary=gov([
    {sourceKey:'DERIVATIVES:BINANCE_USDM_PUBLIC',status:'HEALTHY'},
    {sourceKey:'DERIVATIVES:OKX_PUBLIC',status:'QUARANTINED'},
    {sourceKey:'DERIVATIVES:BINANCE_OKX_DERIVED',status:'HEALTHY'}
  ],1200);
  const g=buildResearchDependencyGraph({
    plane:p,
    governanceSummary:summary,
    streamKey:'BTCUSDT',
    asOf:1500,
    knowledgeTime:1600,
    forecastInputFingerprint:H
  });
  const feature=explainResearchFeatureLineage(g,'research.derivatives.fundingRateVenueSpread');
  assert.equal(feature.feature.state,'BLOCKED');
  assert.ok(feature.upstreamSources.some(x=>x.sourceKey==='DERIVATIVES:OKX_PUBLIC'&&x.state==='BLOCKED'));
  assert.ok(g.impact.impactedSourceKeys.includes('DERIVATIVES:OKX_PUBLIC'));
  assert.equal(g.gate,'ABSTAIN');
  assert.equal(verifyResearchDependencyGraph(g).ok,true);
});

test('derived source is healthy only when all upstream sources are healthy',()=>{
  const derived={
    seq:3,
    recordHash:'3'.repeat(64),
    streamKey:'BTCUSDT',
    domain:'DERIVATIVES',
    source:'BINANCE_OKX_DERIVED',
    sourceEventId:'derived-3',
    availableAt:1000,
    validUntil:5000,
    features:[{id:'research.derivatives.fundingRateVenueSpread',value:.0001}],
    provenance:{dependencies:['DERIVATIVES:BINANCE_USDM_PUBLIC','DERIVATIVES:OKX_PUBLIC']},
    governance:{
      sourceKey:'DERIVATIVES:BINANCE_OKX_DERIVED',
      decision:'ACCEPT',
      sourceStatus:'HEALTHY',
      usableForResearch:true
    }
  };
  const p=plane([
    rec({seq:1,recordHash:R1,source:'BINANCE_USDM_PUBLIC',featureId:'research.derivatives.fundingRate'}),
    rec({seq:2,recordHash:R2,source:'OKX_PUBLIC',featureId:'research.derivatives.okxFundingRate'}),
    derived
  ]);
  const summary=gov([
    {sourceKey:'DERIVATIVES:BINANCE_USDM_PUBLIC',status:'HEALTHY'},
    {sourceKey:'DERIVATIVES:OKX_PUBLIC',status:'HEALTHY'},
    {sourceKey:'DERIVATIVES:BINANCE_OKX_DERIVED',status:'HEALTHY'}
  ],1200);
  const g=buildResearchDependencyGraph({
    plane:p,
    governanceSummary:summary,
    streamKey:'BTCUSDT',
    asOf:1500,
    knowledgeTime:1600,
    forecastInputFingerprint:H
  });
  const feature=explainResearchFeatureLineage(g,'research.derivatives.fundingRateVenueSpread');
  assert.equal(feature.feature.state,'HEALTHY');
  assert.equal(feature.upstreamSources.length,2);
  assert.equal(verifyResearchDependencyGraph(g).ok,true);
});


test('semantic review degrades only the reviewed feature when source health is otherwise healthy',()=>{
  const record={
    seq:1,
    recordHash:R1,
    streamKey:'BTCUSDT',
    domain:'OPTIONS',
    source:'DERIBIT_PUBLIC_OPTIONS',
    sourceEventId:'semantic-1',
    availableAt:1000,
    validUntil:5000,
    features:[
      {id:'research.options.weightedIvPct',value:75},
      {id:'research.options.openInterestLog',value:12}
    ],
    governance:{
      sourceKey:'OPTIONS:DERIBIT_PUBLIC_OPTIONS',
      decision:'DEGRADED',
      sourceStatus:'HEALTHY',
      usableForResearch:true,
      reasons:[
        {code:'SEMANTIC_DISTRIBUTION_SHIFT_REVIEW',id:'research.options.weightedIvPct',value:75}
      ]
    }
  };
  const g=buildResearchDependencyGraph({
    plane:plane([record]),
    governanceSummary:gov([{sourceKey:'OPTIONS:DERIBIT_PUBLIC_OPTIONS',status:'HEALTHY'}]),
    streamKey:'BTCUSDT',
    asOf:1500,
    knowledgeTime:1600,
    forecastInputFingerprint:H
  });
  assert.equal(g.gate,'CAUTION');
  assert.deepEqual(g.impact.degradedFeatureIds,['research.options.weightedIvPct']);
  assert.equal(g.impact.healthyFeatures,1);
  assert.equal(g.impact.degradedFeatures,1);
  const source=g.nodes.find(x=>x.id==='SOURCE:OPTIONS:DERIBIT_PUBLIC_OPTIONS');
  assert.equal(source.state,'HEALTHY');
  assert.deepEqual(source.semanticReviewFeatureIds,['research.options.weightedIvPct']);
  assert.equal(explainResearchFeatureLineage(g,'research.options.openInterestLog').feature.state,'HEALTHY');
  assert.equal(explainResearchFeatureLineage(g,'research.options.weightedIvPct').feature.state,'DEGRADED');
  assert.equal(verifyResearchDependencyGraph(g).ok,true);
});

test('operationally degraded source still degrades every contributed feature',()=>{
  const record={
    seq:1,
    recordHash:R1,
    streamKey:'BTCUSDT',
    domain:'OPTIONS',
    source:'DERIBIT_PUBLIC_OPTIONS',
    sourceEventId:'operational-1',
    availableAt:1000,
    validUntil:5000,
    features:[
      {id:'research.options.weightedIvPct',value:75},
      {id:'research.options.openInterestLog',value:12}
    ],
    governance:{
      sourceKey:'OPTIONS:DERIBIT_PUBLIC_OPTIONS',
      decision:'DEGRADED',
      sourceStatus:'DEGRADED',
      usableForResearch:true,
      reasons:[{code:'COMPLETENESS_SLO_BREACH',value:.4,limit:.5}]
    }
  };
  const g=buildResearchDependencyGraph({
    plane:plane([record]),
    governanceSummary:gov([{sourceKey:'OPTIONS:DERIBIT_PUBLIC_OPTIONS',status:'DEGRADED'}]),
    streamKey:'BTCUSDT',
    asOf:1500,
    knowledgeTime:1600,
    forecastInputFingerprint:H
  });
  assert.equal(g.gate,'CAUTION');
  assert.equal(g.impact.healthyFeatures,0);
  assert.equal(g.impact.degradedFeatures,2);
  assert.deepEqual(g.impact.degradedFeatureIds,[
    'research.options.openInterestLog',
    'research.options.weightedIvPct'
  ]);
  const source=g.nodes.find(x=>x.id==='SOURCE:OPTIONS:DERIBIT_PUBLIC_OPTIONS');
  assert.equal(source.state,'DEGRADED');
  assert.equal(verifyResearchDependencyGraph(g).ok,true);
});
