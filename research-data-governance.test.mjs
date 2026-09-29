import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { createResearchFeatureSnapshot } from './research-data-plane.mjs';
import {
  RESEARCH_FEATURE_CATALOG,
  researchFeatureCatalogManifest,
  validateResearchFeatureRows
} from './research-feature-catalog.mjs';
import {
  createResearchDataGovernanceState,
  governResearchSnapshot,
  refreshResearchSourceFreshness,
  quarantinedResearchSourceKeys,
  researchDataGovernanceSummary,
  saveResearchDataGovernance,
  loadResearchDataGovernance
} from './research-data-governance.mjs';

function derivativeSnapshot({
  eventTime=1_000_000,
  availableAt=1_001_000,
  ingestedAt=1_001_100,
  completeness=1,
  sourceEventId='x',
  featureId='research.derivatives.fundingRate',
  value=.0001
}={}){
  return createResearchFeatureSnapshot({
    streamKey:'BTCUSDT',
    domain:'DERIVATIVES',
    source:'BINANCE_USDM_PUBLIC',
    sourceVersion:'V1',
    sourceEventId,
    eventTime,
    availableAt,
    ingestedAt,
    ttlMs:600000,
    finality:'OBSERVED',
    quality:{completeness,sourceCount:1,expectedSourceCount:1,status:'OK'},
    features:[{id:featureId,value}],
    provenance:{test:true}
  });
}

test('feature catalog is explicit, fingerprinted and validates natural invariants',()=>{
  const manifest=researchFeatureCatalogManifest();
  assert.equal(RESEARCH_FEATURE_CATALOG.length,67);
  assert.equal(manifest.featureCount,67);
  assert.ok(/^[a-f0-9]{64}$/.test(manifest.fingerprint));
  assert.equal(validateResearchFeatureRows('DERIVATIVES',[
    {id:'research.derivatives.fundingRate',value:.001}
  ]).ok,true);
  const bad=validateResearchFeatureRows('LIQUIDATION',[
    {id:'research.liquidation.longShare5m',value:1.5}
  ]);
  assert.equal(bad.ok,false);
  assert.equal(bad.errors[0].code,'NATURAL_RANGE_HIGH');
});

test('valid governed snapshot is accepted with immutable lineage metadata',()=>{
  const state=createResearchDataGovernanceState({createdAt:2_000_000});
  const governed=governResearchSnapshot(state,derivativeSnapshot(),{evaluatedAt:2_000_000});
  assert.equal(governed.governance.decision,'ACCEPT');
  assert.equal(governed.governance.sourceStatus,'HEALTHY');
  assert.equal(governed.governance.canExecute,false);
  assert.equal(governed.governance.qualityScoreMeaning,'NON_PROBABILISTIC_DATA_QUALITY_DIAGNOSTIC');
});

test('unregistered feature is rejected and source is quarantined immediately',()=>{
  const state=createResearchDataGovernanceState({createdAt:2_000_000});
  const governed=governResearchSnapshot(state,derivativeSnapshot({
    featureId:'research.derivatives.notRegistered',
    sourceEventId:'bad-schema'
  }),{evaluatedAt:2_000_000});
  assert.equal(governed.governance.decision,'REJECT');
  assert.equal(governed.governance.sourceStatus,'QUARANTINED');
  assert.ok(governed.governance.reasons.some(x=>x.code==='UNREGISTERED_FEATURE'));
});

test('repeated operational SLO breaches degrade then auto-quarantine a source',()=>{
  const state=createResearchDataGovernanceState({createdAt:2_000_000});
  const decisions=[];
  for(let i=0;i<3;i++){
    const governed=governResearchSnapshot(state,derivativeSnapshot({
      eventTime:1_000_000+i,
      availableAt:2_000_000+i,
      ingestedAt:2_000_100+i,
      sourceEventId:'late-'+i
    }),{evaluatedAt:2_100_000+i});
    decisions.push(governed.governance.decision);
  }
  assert.deepEqual(decisions,['DEGRADED','DEGRADED','QUARANTINE']);
  const probe=governResearchSnapshot(createResearchDataGovernanceState({createdAt:2_000_000}),derivativeSnapshot({
    eventTime:1_000_000,
    availableAt:2_000_000,
    ingestedAt:2_000_100,
    sourceEventId:'late-usability'
  }),{evaluatedAt:2_100_000});
  assert.equal(probe.governance.usableForResearch,false);
  assert.deepEqual(quarantinedResearchSourceKeys(state),['DERIVATIVES:BINANCE_USDM_PUBLIC']);
});

test('quarantined source needs consecutive healthy observations before recovery',()=>{
  const state=createResearchDataGovernanceState({createdAt:2_000_000});
  for(let i=0;i<3;i++){
    governResearchSnapshot(state,derivativeSnapshot({
      eventTime:1_000_000+i,
      availableAt:2_000_000+i,
      ingestedAt:2_000_100+i,
      sourceEventId:'late-'+i
    }),{evaluatedAt:2_100_000+i});
  }
  const recovery=[];
  for(let i=0;i<3;i++){
    const at=3_000_000+i*1000;
    const governed=governResearchSnapshot(state,derivativeSnapshot({
      eventTime:at-1000,
      availableAt:at,
      ingestedAt:at+100,
      sourceEventId:'healthy-'+i
    }),{evaluatedAt:at+100});
    recovery.push(governed.governance.decision);
  }
  assert.deepEqual(recovery,['QUARANTINE','QUARANTINE','ACCEPT']);
  assert.equal(quarantinedResearchSourceKeys(state).length,0);
});

test('semantic value shift is flagged for review but does not auto-quarantine the feed',()=>{
  const state=createResearchDataGovernanceState({createdAt:2_000_000});
  for(let i=0;i<24;i++){
    const at=3_000_000+i*1000;
    const value=.0001+((i%3)-1)*.00001;
    governResearchSnapshot(state,derivativeSnapshot({
      eventTime:at-1000,
      availableAt:at,
      ingestedAt:at+50,
      sourceEventId:'base-'+i,
      value
    }),{evaluatedAt:at+50});
  }
  const at=4_000_000;
  const shifted=governResearchSnapshot(state,derivativeSnapshot({
    eventTime:at-1000,
    availableAt:at,
    ingestedAt:at+50,
    sourceEventId:'shift',
    value:.01
  }),{evaluatedAt:at+50});
  assert.equal(shifted.governance.decision,'DEGRADED');
  assert.equal(shifted.governance.sourceStatus,'HEALTHY');
  assert.equal(shifted.governance.semanticDrift,'REVIEW');
  assert.equal(shifted.governance.usableForResearch,true);
  assert.ok(shifted.governance.reasons.some(x=>x.code==='SEMANTIC_DISTRIBUTION_SHIFT_REVIEW'));
});

test('silence freshness monitor degrades and then quarantines observed sources only',()=>{
  const state=createResearchDataGovernanceState({createdAt:2_000_000});
  governResearchSnapshot(state,derivativeSnapshot(),{evaluatedAt:2_000_000});
  let x=refreshResearchSourceFreshness(state,{now:2_000_000+46*60_000});
  assert.equal(x.changed,true);
  assert.equal(researchDataGovernanceSummary(state,{now:2_000_000+46*60_000}).statuses.DEGRADED,1);
  x=refreshResearchSourceFreshness(state,{now:2_000_000+91*60_000});
  assert.equal(x.changed,true);
  assert.equal(quarantinedResearchSourceKeys(state).length,1);
});

test('governance state survives atomic persistence round trip',async()=>{
  const state=createResearchDataGovernanceState({createdAt:2_000_000});
  governResearchSnapshot(state,derivativeSnapshot(),{evaluatedAt:2_000_000});
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-governance-'));
  const file=path.join(dir,'governance.json');
  await saveResearchDataGovernance(file,state);
  const loaded=await loadResearchDataGovernance(file);
  const summary=researchDataGovernanceSummary(loaded,{now:2_000_000});
  assert.equal(summary.statuses.HEALTHY,1);
  assert.ok(/^[a-f0-9]{64}$/.test(summary.fingerprint));
});


test('retired derivative aggregate quarantine is ignored by active contract summary',()=>{
  const state=createResearchDataGovernanceState({
    createdAt:2_000_000,
    sources:{
      'DERIVATIVES:BINANCE_OKX_PUBLIC_DERIVATIVES':{
        key:'DERIVATIVES:BINANCE_OKX_PUBLIC_DERIVATIVES',
        domain:'DERIVATIVES',
        source:'BINANCE_OKX_PUBLIC_DERIVATIVES',
        status:'QUARANTINED',
        firstSeenAt:1,
        lastSeenAt:1,
        lastAvailableAt:1,
        lastDecision:'QUARANTINE',
        consecutiveViolations:99,
        consecutiveHealthy:0,
        totalSnapshots:99,
        totalViolations:99,
        totalRejected:0,
        totalQuarantined:1,
        totalSemanticReviews:0,
        lastReasons:[{code:'LEGACY'}],
        publicationLagMs:[],
        ingestLagMs:[],
        completeness:[]
      }
    }
  });
  assert.deepEqual(quarantinedResearchSourceKeys(state),[]);
  const summary=researchDataGovernanceSummary(state,{now:2_000_000});
  assert.equal(summary.quarantinedSources.includes('DERIVATIVES:BINANCE_OKX_PUBLIC_DERIVATIVES'),false);
});
