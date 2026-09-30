import test from 'node:test';
import assert from 'node:assert/strict';
import { createEpistemicLedger, evaluateTheory } from './biggj-epistemic-kernel.mjs';
import {
  BIGGJ_EPISTEMIC_RUNTIME_VERSION,
  syncLivingResearchIntoEpistemicKernel,
  biggjEpistemicRuntimeSummary
} from './biggj-epistemic-runtime.mjs';

const T0=Date.UTC(2026,8,30,18,0,0);

function livingState({evidence=[]}={}){
  return {
    execution:'SHADOW_ONLY',
    canInfluencePrimary:false,
    canExecuteLive:false,
    skillTree:{
      execution:'SHADOW_ONLY',
      canExecuteLive:false,
      nodes:[{
        skillId:'skill:liquidity-001',
        rootId:'LIQUIDITY',
        kind:'DISCOVERED_SKILL',
        title:'Liquidity stress transmission',
        question:'Does liquidity stress transmit nonlinearly across markets?',
        hypothesis:'Falling liquidity elasticity amplifies displacement after forced-flow shocks.',
        falsifier:'Prospective point-in-time evidence shows no amplification after regime controls.',
        purpose:'Study liquidity stress transmission.',
        discoveredBy:'ASSUMPTION_PERSISTENCE_RUNTIME_V1',
        createdAt:T0,
        evidence
      }]
    }
  };
}

function ev(i,{
  epistemicClass='OBSERVED',
  outcome='POSITIVE',
  controller='',
  episode='episode_'+i,
  forwardShadow=true,
  scientific=true,
  audit=true
}={}){
  const availableAt=T0+1_000+i*1_000;
  const provenance=[{
    kind:'TEST',
    symbol:i%2===0?'BTC':'ETH',
    regimeId:i%2===0?'HIGH_LEVERAGE':'LOW_LIQUIDITY',
    horizonId:'5M',
    ...(controller?{sourceControllerId:controller}:{})
  }];
  return {
    evidenceId:'skill-evidence-'+i,
    epistemicClass,
    asOf:availableAt,
    availableAt,
    sourceId:'source-'+(i%2),
    independentEpisodeId:episode,
    statement:'evidence '+i,
    outcome,
    metricDelta:.1,
    forwardShadow,
    pointInTime:true,
    futureLeakage:false,
    auditReady:audit,
    scientificGuardsPassed:scientific,
    chronologicalStable:true,
    costStressPassed:true,
    concentrationPassed:true,
    winnerRemovalPassed:true,
    validationEligible:true,
    provenance
  };
}

test('living research discovered skills become formal theories without primary authority',()=>{
  const ledger=createEpistemicLedger({asOf:T0});
  const synced=syncLivingResearchIntoEpistemicKernel(ledger,livingState(),{asOf:T0+10_000});
  assert.equal(synced.version,BIGGJ_EPISTEMIC_RUNTIME_VERSION);
  assert.equal(synced.changed,true);
  assert.equal(synced.createdTheoryIds.length,1);
  assert.equal(synced.ledger.theories.length,1);
  const theory=synced.ledger.theories[0];
  assert.ok(theory.nullHypothesis.includes('noise'));
  assert.ok(theory.tags.includes('skill:skill:liquidity-001'));
  assert.equal(synced.canInfluencePrimary,false);
  assert.equal(synced.canExecuteLive,false);
});

test('living research evidence keeps its epistemic class and conservative provenance rules',()=>{
  const ledger=createEpistemicLedger({asOf:T0});
  const state=livingState({evidence:[
    ev(0,{controller:'controller-a'}),
    ev(1,{epistemicClass:'MODELLED',controller:'controller-b'})
  ]});
  const synced=syncLivingResearchIntoEpistemicKernel(ledger,state,{asOf:T0+20_000});
  assert.equal(synced.appendedEvidenceIds.length,2);
  const theoryId=synced.links[0].theoryId;
  const evaluated=evaluateTheory(synced.ledger,theoryId,{asOf:T0+20_000,scientificGate:'INSUFFICIENT'});
  assert.equal(evaluated.evidence.empiricallyUsableRows,1);
  assert.equal(evaluated.evidence.supportRows,1);
  assert.equal(evaluated.evidence.independentSupportEpisodes,1);
  assert.equal(evaluated.evidence.invalidRows,1);
});

test('missing controller metadata is never invented from a source id',()=>{
  const ledger=createEpistemicLedger({asOf:T0});
  const state=livingState({evidence:[ev(0,{controller:''}),ev(1,{controller:''})]});
  const synced=syncLivingResearchIntoEpistemicKernel(ledger,state,{asOf:T0+20_000});
  const theoryId=synced.links[0].theoryId;
  const evaluated=evaluateTheory(synced.ledger,theoryId,{asOf:T0+20_000});
  assert.equal(evaluated.evidence.sourceControllers,0);
  assert.equal(evaluated.derivedStatus,'OBSERVED_EFFECT');
  assert.equal(evaluated.tradingBridgeEligible,false);
});

test('sync is idempotent and does not duplicate theories or evidence',()=>{
  const ledger=createEpistemicLedger({asOf:T0});
  const state=livingState({evidence:[ev(0,{controller:'controller-a'})]});
  const first=syncLivingResearchIntoEpistemicKernel(ledger,state,{asOf:T0+20_000});
  const second=syncLivingResearchIntoEpistemicKernel(first.ledger,state,{asOf:T0+30_000});
  assert.equal(second.createdTheoryIds.length,0);
  assert.equal(second.appendedEvidenceIds.length,0);
  assert.equal(second.ledger.theories.length,1);
  assert.equal(second.ledger.evidence.length,1);
});

test('runtime computes a science gate but still forbids automatic primary promotion',()=>{
  const ledger=createEpistemicLedger({asOf:T0});
  const evidence=Array.from({length:8},(_,i)=>ev(i,{controller:'controller-'+(i%2)}));
  const synced=syncLivingResearchIntoEpistemicKernel(ledger,livingState({evidence}),{asOf:T0+30_000});
  assert.equal(synced.links[0].scientificGate,'PASS');
  assert.equal(synced.links[0].derivedStatus,'ROBUST');
  assert.equal(synced.links[0].nextExperiment.automaticLaunchAllowed,false);
  assert.equal(synced.invariants.automaticPrimaryPromotion,false);
  const summary=biggjEpistemicRuntimeSummary(synced.ledger,{asOf:T0+30_000});
  assert.equal(summary.robustTheoryCount,1);
  assert.equal(summary.canInfluencePrimary,false);
  assert.equal(summary.canExecuteLive,false);
});
