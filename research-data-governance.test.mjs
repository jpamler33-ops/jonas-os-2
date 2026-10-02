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
  assert.ok(RESEARCH_FEATURE_CATALOG.length>=81);
  assert.equal(manifest.featureCount,RESEARCH_FEATURE_CATALOG.length);
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


test('retired aggregate FRED quarantine is ignored after per-series contract migration',()=>{
  const state=createResearchDataGovernanceState({
    createdAt:2_000_000,
    sources:{
      'MACRO:FRED_GRAPH_CSV_CURRENT':{
        key:'MACRO:FRED_GRAPH_CSV_CURRENT',
        domain:'MACRO',
        source:'FRED_GRAPH_CSV_CURRENT',
        status:'QUARANTINED',
        firstSeenAt:1,
        lastSeenAt:1,
        lastAvailableAt:1,
        lastDecision:'QUARANTINE',
        consecutiveViolations:1039,
        consecutiveHealthy:0,
        totalSnapshots:1039,
        totalViolations:1039,
        totalRejected:0,
        totalQuarantined:1037,
        totalSemanticReviews:0,
        lastReasons:[{code:'PUBLICATION_LAG_SLO_BREACH'}],
        publicationLagMs:[406513498],
        ingestLagMs:[347466],
        completeness:[1]
      }
    }
  });
  assert.equal(quarantinedResearchSourceKeys(state).includes('MACRO:FRED_GRAPH_CSV_CURRENT'),false);
  const summary=researchDataGovernanceSummary(state,{now:2_000_000});
  assert.equal(summary.sources.some(x=>x.sourceKey==='MACRO:FRED_GRAPH_CSV_CURRENT'),false);
  assert.ok(summary.sources.some(x=>x.sourceKey==='MACRO:FRED_DFF_CURRENT'));
  assert.ok(summary.sources.some(x=>x.sourceKey==='MACRO:FRED_WALCL_CURRENT'));
});


function entityFlowGovernanceSnapshot({
  sourceEventId='entity-flow',
  eventTime=1_000_000,
  availableAt=2_107_417,
  ingestedAt=2_154_968,
  value=.5
}={}){
  return createResearchFeatureSnapshot({
    streamKey:'ETHUSDT',
    domain:'ENTITY_FLOW',
    source:'VERIFIED_ENTITY_FINALIZED_FLOW',
    sourceVersion:'TCX_ENTITY_FLOW_ENGINE_V1',
    sourceEventId,
    eventTime,
    availableAt,
    ingestedAt,
    ttlMs:30*60_000,
    finality:'FINALIZED',
    quality:{completeness:1,sourceCount:1,expectedSourceCount:1,status:'FINALIZED_BOUNDED_ENTITY_SAMPLE'},
    features:[{id:'research.entityflow.eth.netExternal5m',value}],
    provenance:{finalizedBlocksOnly:true,test:true}
  });
}

test('finalized entity flow accepts normal Ethereum finality lag near 18.5 minutes',()=>{
  const state=createResearchDataGovernanceState({createdAt:3_000_000});
  const governed=governResearchSnapshot(state,entityFlowGovernanceSnapshot(),{evaluatedAt:2_154_968});
  assert.equal(governed.governance.decision,'ACCEPT');
  assert.equal(governed.governance.sourceStatus,'HEALTHY');
  assert.equal(governed.governance.usableForResearch,true);
  assert.equal(governed.governance.reasons.some(x=>x.code==='PUBLICATION_LAG_SLO_BREACH'),false);
});

test('finalized entity flow still quarantines sustained finality lag above 30 minutes',()=>{
  const state=createResearchDataGovernanceState({createdAt:5_000_000});
  const decisions=[];
  for(let i=0;i<3;i++){
    const availableAt=5_000_000+i*1000;
    const governed=governResearchSnapshot(state,entityFlowGovernanceSnapshot({
      sourceEventId:'entity-stalled-'+i,
      eventTime:availableAt-(31*60_000),
      availableAt,
      ingestedAt:availableAt+10_000
    }),{evaluatedAt:availableAt+10_000});
    decisions.push(governed.governance.decision);
  }
  assert.deepEqual(decisions,['DEGRADED','DEGRADED','QUARANTINE']);
  assert.ok(quarantinedResearchSourceKeys(state).includes('ENTITY_FLOW:VERIFIED_ENTITY_FINALIZED_FLOW'));
});


function monthlyFredSnapshot({
  source='FRED_CPIAUCSL_CURRENT',
  featureId='research.macro.cpiIndex',
  value=310,
  eventTime,
  availableAt,
  ingestedAt=availableAt+1_000,
  sourceEventId='monthly-fred'
}={}){
  return createResearchFeatureSnapshot({
    streamKey:'BTCUSDT',
    domain:'MACRO',
    source,
    sourceVersion:'TEST',
    sourceEventId,
    eventTime,
    availableAt,
    ingestedAt,
    ttlMs:6*60*60_000,
    finality:'OBSERVED',
    quality:{completeness:1,sourceCount:1,expectedSourceCount:1,status:'CURRENT_SERIES_CAPTURE'},
    features:[{id:featureId,value}],
    provenance:{fredTransport:'FRED_GRAPH_CSV',fredSeriesIds:[source==='FRED_UNRATE_CURRENT'?'UNRATE':'CPIAUCSL']}
  });
}

test('monthly FRED observation-period timestamps use observation-age semantics instead of false publication lag',()=>{
  const DAY=24*60*60_000;
  const availableAt=Date.UTC(2026,8,30,12,0,0);
  const eventTime=availableAt-60*DAY;
  const state=createResearchDataGovernanceState({createdAt:availableAt});
  const governed=governResearchSnapshot(state,monthlyFredSnapshot({eventTime,availableAt}),{evaluatedAt:availableAt+1_000});
  assert.equal(governed.governance.decision,'ACCEPT');
  assert.equal(governed.governance.sourceStatus,'HEALTHY');
  assert.equal(governed.governance.timelinessMetric,'OBSERVATION_AGE');
  assert.equal(governed.governance.eventTimeSemantics,'OBSERVATION_PERIOD_START');
  assert.equal(governed.governance.observationAgeMs,60*DAY);
  assert.equal(governed.governance.reasons.some(x=>x.code==='PUBLICATION_LAG_SLO_BREACH'),false);
  assert.equal(governed.governance.reasons.some(x=>x.code==='OBSERVATION_AGE_SLO_BREACH'),false);
});

test('monthly FRED observation age still fails closed when older than its bounded cadence allowance',()=>{
  const DAY=24*60*60_000;
  const availableAt=Date.UTC(2026,8,30,12,0,0);
  const state=createResearchDataGovernanceState({createdAt:availableAt});
  const decisions=[];
  for(let i=0;i<3;i++){
    const a=availableAt+i*2_000;
    const governed=governResearchSnapshot(state,monthlyFredSnapshot({
      eventTime:a-76*DAY,
      availableAt:a,
      ingestedAt:a+500,
      sourceEventId:'monthly-stale-'+i
    }),{evaluatedAt:a+500});
    decisions.push(governed.governance.decision);
    assert.ok(governed.governance.reasons.some(x=>x.code==='OBSERVATION_AGE_SLO_BREACH'));
  }
  assert.deepEqual(decisions,['DEGRADED','DEGRADED','QUARANTINE']);
});

function weeklyCftcSnapshot({
  eventTime,
  availableAt,
  ingestedAt=availableAt+1_000,
  sourceEventId='weekly-cftc'
}={}){
  return createResearchFeatureSnapshot({
    streamKey:'BTCUSDT',
    domain:'CFTC_POSITIONING',
    source:'CFTC_TFF_FUTURES_ONLY',
    sourceVersion:'TEST',
    sourceEventId,
    eventTime,
    availableAt,
    ingestedAt,
    ttlMs:8*24*60*60_000,
    finality:'OBSERVED',
    quality:{completeness:1,sourceCount:1,expectedSourceCount:1,status:'OFFICIAL_WEEKLY_CFTC_POSITIONING'},
    features:[{id:'research.cftc.assetManagerLongShare',value:.42}],
    provenance:{weeklyReport:true,test:true}
  });
}

test('weekly CFTC report remains healthy on the next scheduled release day before publication',()=>{
  const DAY=24*60*60_000;
  const availableAt=Date.UTC(2026,9,2,9,5,0);
  const eventTime=Date.UTC(2026,8,22,0,0,0);
  const state=createResearchDataGovernanceState({createdAt:availableAt});
  const governed=governResearchSnapshot(state,weeklyCftcSnapshot({eventTime,availableAt}),{evaluatedAt:availableAt+1_000});
  assert.equal(governed.governance.decision,'ACCEPT');
  assert.equal(governed.governance.sourceStatus,'HEALTHY');
  assert.equal(governed.governance.timelinessMetric,'OBSERVATION_AGE');
  assert.equal(governed.governance.eventTimeSemantics,'OBSERVATION_TIME');
  assert.ok(governed.governance.observationAgeMs>10*DAY);
  assert.ok(governed.governance.observationAgeMs<12*DAY);
  assert.equal(governed.governance.reasons.some(x=>x.code==='PUBLICATION_LAG_SLO_BREACH'),false);
  assert.equal(governed.governance.reasons.some(x=>x.code==='OBSERVATION_AGE_SLO_BREACH'),false);
});

test('weekly CFTC report still fails closed when observation age exceeds bounded weekly allowance',()=>{
  const DAY=24*60*60_000;
  const availableAt=Date.UTC(2026,9,2,9,5,0);
  const state=createResearchDataGovernanceState({createdAt:availableAt});
  const decisions=[];
  for(let i=0;i<3;i++){
    const a=availableAt+i*2_000;
    const governed=governResearchSnapshot(state,weeklyCftcSnapshot({
      eventTime:a-13*DAY,
      availableAt:a,
      ingestedAt:a+500,
      sourceEventId:'weekly-cftc-stale-'+i
    }),{evaluatedAt:a+500});
    decisions.push(governed.governance.decision);
    assert.ok(governed.governance.reasons.some(x=>x.code==='OBSERVATION_AGE_SLO_BREACH'));
  }
  assert.deepEqual(decisions,['DEGRADED','DEGRADED','QUARANTINE']);
});

test('CFTC contract declares weekly observation-time semantics',async()=>{
  const { researchSourceContract }=await import('./research-source-contracts.mjs');
  const contract=researchSourceContract('CFTC_POSITIONING','CFTC_TFF_FUTURES_ONLY');
  assert.equal(contract.eventTimeSemantics,'OBSERVATION_TIME');
  assert.equal(contract.cadence,'WEEKLY');
  assert.equal(contract.maxObservationAgeMs,12*24*60*60_000);
});


function weeklyH10DollarSnapshot({
  eventTime,
  availableAt,
  ingestedAt=availableAt+1_000,
  sourceEventId='weekly-h10-dollar'
}={}){
  return createResearchFeatureSnapshot({
    streamKey:'BTCUSDT',
    domain:'MACRO',
    source:'FRED_DTWEXBGS_CURRENT',
    sourceVersion:'TEST',
    sourceEventId,
    eventTime,
    availableAt,
    ingestedAt,
    ttlMs:6*60*60_000,
    finality:'OBSERVED',
    quality:{completeness:1,sourceCount:1,expectedSourceCount:1,status:'CURRENT_SERIES_CAPTURE'},
    features:[{id:'research.macro.broadDollarIndex',value:121.5}],
    provenance:{fredTransport:'FRED_GRAPH_CSV',fredSeriesIds:['DTWEXBGS'],weeklyBatchRelease:true,test:true}
  });
}

test('H10 broad dollar daily observation stays healthy until the next weekly batch release',()=>{
  const DAY=24*60*60_000;
  const availableAt=Date.UTC(2026,9,5,18,0,0);
  const eventTime=Date.UTC(2026,8,25,0,0,0);
  const state=createResearchDataGovernanceState({createdAt:availableAt});
  const governed=governResearchSnapshot(state,weeklyH10DollarSnapshot({eventTime,availableAt}),{evaluatedAt:availableAt+1_000});
  assert.equal(governed.governance.decision,'ACCEPT');
  assert.equal(governed.governance.sourceStatus,'HEALTHY');
  assert.equal(governed.governance.timelinessMetric,'OBSERVATION_AGE');
  assert.equal(governed.governance.eventTimeSemantics,'OBSERVATION_TIME');
  assert.ok(governed.governance.observationAgeMs>10*DAY);
  assert.ok(governed.governance.observationAgeMs<12*DAY);
  assert.equal(governed.governance.reasons.some(x=>x.code==='PUBLICATION_LAG_SLO_BREACH'),false);
  assert.equal(governed.governance.reasons.some(x=>x.code==='OBSERVATION_AGE_SLO_BREACH'),false);
});

test('H10 broad dollar data still fails closed beyond bounded weekly observation age',()=>{
  const DAY=24*60*60_000;
  const availableAt=Date.UTC(2026,9,5,18,0,0);
  const state=createResearchDataGovernanceState({createdAt:availableAt});
  const decisions=[];
  for(let i=0;i<3;i++){
    const a=availableAt+i*2_000;
    const governed=governResearchSnapshot(state,weeklyH10DollarSnapshot({
      eventTime:a-13*DAY,
      availableAt:a,
      ingestedAt:a+500,
      sourceEventId:'weekly-h10-stale-'+i
    }),{evaluatedAt:a+500});
    decisions.push(governed.governance.decision);
    assert.ok(governed.governance.reasons.some(x=>x.code==='OBSERVATION_AGE_SLO_BREACH'));
  }
  assert.deepEqual(decisions,['DEGRADED','DEGRADED','QUARANTINE']);
});

test('H10 broad dollar contract declares weekly batch observation semantics',async()=>{
  const { researchSourceContract }=await import('./research-source-contracts.mjs');
  const contract=researchSourceContract('MACRO','FRED_DTWEXBGS_CURRENT');
  assert.equal(contract.eventTimeSemantics,'OBSERVATION_TIME');
  assert.equal(contract.cadence,'WEEKLY_BATCH_DAILY_OBSERVATIONS');
  assert.equal(contract.maxObservationAgeMs,12*24*60*60_000);
});

test('both monthly FRED contracts declare explicit observation-period semantics',async()=>{
  const { researchSourceContract, RESEARCH_SOURCE_CONTRACTS_VERSION }=await import('./research-source-contracts.mjs');
  assert.equal(RESEARCH_SOURCE_CONTRACTS_VERSION,'TCX_RESEARCH_SOURCE_CONTRACTS_V14');
  for(const source of ['FRED_CPIAUCSL_CURRENT','FRED_UNRATE_CURRENT']){
    const contract=researchSourceContract('MACRO',source);
    assert.equal(contract.eventTimeSemantics,'OBSERVATION_PERIOD_START');
    assert.equal(contract.cadence,'MONTHLY');
    assert.equal(contract.maxObservationAgeMs,75*24*60*60_000);
  }
});
