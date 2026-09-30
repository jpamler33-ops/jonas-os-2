import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIGGJ_EPISTEMIC_KERNEL_VERSION,
  createEpistemicLedger,
  verifyEpistemicLedger,
  registerTheory,
  appendTheoryEvidence,
  evaluateTheory,
  planNextTheoryExperiment,
  appendExperimentPlan,
  appendSurpriseEvent,
  theoryGraveyard,
  epistemicKernelSnapshot
} from './biggj-epistemic-kernel.mjs';

const T0=Date.UTC(2026,8,30,18,0,0);
const theoryInput=()=>({
  title:'Liquidity elasticity and forced-flow displacement',
  question:'Does falling liquidity elasticity amplify price displacement under forced directional flow?',
  hypothesis:'When liquidity elasticity falls while forced directional flow rises, otherwise similar shocks produce larger nonlinear displacement.',
  falsifier:'The effect disappears or reverses in prospective point-in-time observations after controlling for regime and source lineage.',
  nullHypothesis:'Observed displacement is explained by noise, regime mix, or common-cause exposure rather than liquidity elasticity.',
  mechanism:'Counterparty capacity cannot absorb forced flow at the prior response rate.',
  scope:{markets:['BTC','ETH'],regimes:['HIGH_LEVERAGE','LOW_LIQUIDITY'],horizons:['5M','30M']},
  tags:['liquidity','forced-flow']
});

function newTheory(){
  let ledger=createEpistemicLedger({asOf:T0});
  const r=registerTheory(ledger,theoryInput(),{at:T0});
  assert.equal(r.created,true);
  return {ledger:r.ledger,theory:r.theory};
}

function add(ledger,theoryId,i,overrides={}){
  const observedAt=T0+1_000+i*1_000;
  const availableAt=observedAt+100;
  return appendTheoryEvidence(ledger,theoryId,{
    evidenceId:'ev_'+i,
    classification:'OBSERVED',
    kind:'REAL',
    polarity:'SUPPORT',
    sourceId:'source_'+(i%3),
    sourceControllerId:'controller_'+(i%3),
    provenanceIds:['prov_'+i],
    independenceKey:'episode_'+i,
    episodeId:'episode_'+i,
    market:i%2===0?'BTC':'ETH',
    regime:i%2===0?'HIGH_LEVERAGE':'LOW_LIQUIDITY',
    horizon:'5M',
    observedAt,
    availableAt,
    outOfSample:i>=2,
    prospective:i>=3,
    value:{effect:i/100},
    ...overrides
  },{at:availableAt+1});
}

test('epistemic ledger is immutable, verifiable and permanently shadow-only',()=>{
  const ledger=createEpistemicLedger({asOf:T0});
  const v=verifyEpistemicLedger(ledger);
  assert.equal(v.ok,true);
  assert.equal(ledger.version,BIGGJ_EPISTEMIC_KERNEL_VERSION);
  assert.equal(ledger.execution,'SHADOW_ONLY');
  assert.equal(ledger.action,'ABSTAIN');
  assert.equal(ledger.canInfluencePrimary,false);
  assert.equal(ledger.canExecuteLive,false);
  assert.equal(ledger.invariants.syntheticEvidenceIsNotRealEvidence,true);
  assert.equal(Object.isFrozen(ledger),true);
});

test('a theory cannot be registered without a falsifier and null hypothesis',()=>{
  const ledger=createEpistemicLedger({asOf:T0});
  assert.throws(
    ()=>registerTheory(ledger,{...theoryInput(),falsifier:''},{at:T0}),
    /THEORY_FALSIFIER_REQUIRED/
  );
  assert.throws(
    ()=>registerTheory(ledger,{...theoryInput(),nullHypothesis:''},{at:T0}),
    /THEORY_NULL_HYPOTHESIS_REQUIRED/
  );
});

test('synthetic worlds can stress a theory but never count as empirical support',()=>{
  const {ledger:base,theory}=newTheory();
  const x=appendTheoryEvidence(base,theory.theoryId,{
    evidenceId:'synthetic_1',
    classification:'MODELLED',
    kind:'SYNTHETIC',
    polarity:'SUPPORT',
    sourceId:'counterfactual_lab',
    sourceControllerId:'biggj',
    provenanceIds:['simulation_seed_1'],
    independenceKey:'synthetic_world_1',
    observedAt:T0+100,
    availableAt:T0+100,
    outOfSample:true
  },{at:T0+101});
  const e=evaluateTheory(x.ledger,theory.theoryId,{asOf:T0+1_000,scientificGate:'PASS'});
  assert.equal(e.evidence.syntheticRows,1);
  assert.equal(e.evidence.empiricallyUsableRows,0);
  assert.equal(e.evidence.independentSupportEpisodes,0);
  assert.equal(e.derivedStatus,'HYPOTHESIS');
  assert.equal(e.tradingBridgeEligible,false);
});

test('future evidence and leaked point-in-time rows are excluded',()=>{
  const {ledger:base,theory}=newTheory();
  const x=appendTheoryEvidence(base,theory.theoryId,{
    evidenceId:'future_1',
    classification:'OBSERVED',
    kind:'REAL',
    polarity:'SUPPORT',
    sourceId:'feed',
    sourceControllerId:'provider',
    provenanceIds:['raw_1'],
    independenceKey:'episode_future',
    observedAt:T0+1_000,
    availableAt:T0+100_000
  },{at:T0+2_000});
  const e=evaluateTheory(x.ledger,theory.theoryId,{asOf:T0+5_000});
  assert.equal(e.evidence.empiricallyUsableRows,0);
  assert.ok(e.diagnostics[0].reasons.includes('FUTURE_EVIDENCE_BLOCKED'));
});

test('repeated rows from one episode do not manufacture independent replication',()=>{
  const {ledger:base,theory}=newTheory();
  let ledger=base;
  for(let i=0;i<6;i++){
    ledger=add(ledger,theory.theoryId,i,{
      independenceKey:'same_common_cause_episode',
      episodeId:'same_common_cause_episode',
      sourceControllerId:'same_controller'
    }).ledger;
  }
  const e=evaluateTheory(ledger,theory.theoryId,{asOf:T0+60_000});
  assert.equal(e.evidence.supportRows,6);
  assert.equal(e.evidence.independentSupportEpisodes,1);
  assert.equal(e.derivedStatus,'HYPOTHESIS');
});

test('explicit falsifier hit breaks a theory and preserves it in the graveyard',()=>{
  const {ledger:base,theory}=newTheory();
  let ledger=add(base,theory.theoryId,1).ledger;
  ledger=add(ledger,theory.theoryId,2,{
    evidenceId:'fatal_contra',
    polarity:'CONTRA',
    falsifierHit:true,
    independenceKey:'fatal_episode',
    sourceControllerId:'independent_controller',
    market:'ETH',
    regime:'LOW_LIQUIDITY',
    outOfSample:true
  }).ledger;
  const e=evaluateTheory(ledger,theory.theoryId,{asOf:T0+60_000,scientificGate:'PASS'});
  assert.equal(e.derivedStatus,'BROKEN');
  assert.deepEqual(e.falsification.falsifierHits,['fatal_contra']);
  const graveyard=theoryGraveyard(ledger,{asOf:T0+60_000});
  assert.equal(graveyard.length,1);
  assert.equal(graveyard[0].theoryId,theory.theoryId);
});

test('robust research can become bridge-eligible but still cannot mutate primary trading',()=>{
  const {ledger:base,theory}=newTheory();
  let ledger=base;
  for(let i=0;i<8;i++) ledger=add(ledger,theory.theoryId,i).ledger;
  const e=evaluateTheory(ledger,theory.theoryId,{asOf:T0+120_000,scientificGate:'PASS'});
  assert.equal(e.derivedStatus,'ROBUST');
  assert.equal(e.researchBridgeEligible,true);
  assert.equal(e.tradingBridgeEligible,true);
  assert.equal(e.canInfluencePrimary,false);
  assert.equal(e.automaticPrimaryPromotionAllowed,false);
  assert.equal(e.canExecuteLive,false);
});

test('experiment factory chooses the next epistemic deficit and freezes anti-overfit controls',()=>{
  const {ledger:base,theory}=newTheory();
  let ledger=add(base,theory.theoryId,0).ledger;
  const plan=planNextTheoryExperiment(ledger,theory.theoryId,{asOf:T0+20_000});
  assert.equal(plan.type,'PROSPECTIVE_OBSERVATION');
  assert.ok(plan.requiredControls.includes('NULL_MODEL'));
  assert.ok(plan.requiredControls.includes('TIME_SHIFT_PLACEBO'));
  assert.ok(plan.requiredControls.includes('FEATURE_ABLATION'));
  assert.ok(plan.requiredControls.includes('WINNER_REMOVAL'));
  assert.equal(plan.syntheticWorldsAllowed,true);
  assert.equal(plan.syntheticWorldsCountAsEvidence,false);
  assert.equal(plan.automaticLaunchAllowed,false);
  assert.equal(plan.canInfluencePrimary,false);
  const appended=appendExperimentPlan(ledger,plan,{at:T0+20_001});
  assert.equal(appended.created,true);
  assert.equal(appended.ledger.experiments.length,1);
});

test('surprises are first-class research objects rather than silently absorbed errors',()=>{
  const {ledger:base,theory}=newTheory();
  const r=appendSurpriseEvent(base,{
    theoryId:theory.theoryId,
    divergenceScore:3.4,
    expected:{returnBand:[0.001,0.004]},
    observed:{return:-0.021},
    observedAt:T0+10_000,
    availableAt:T0+10_100,
    candidateMissingVariables:['dealer_gamma','venue_fragmentation']
  },{at:T0+10_101});
  assert.equal(r.created,true);
  assert.equal(r.ledger.surpriseEvents.length,1);
  assert.deepEqual(r.surprise.candidateMissingVariables,['dealer_gamma','venue_fragmentation']);
});

test('kernel snapshot reports theory science without ever granting execution authority',()=>{
  const {ledger,theory}=newTheory();
  const snap=epistemicKernelSnapshot(ledger,{asOf:T0+1_000});
  assert.equal(snap.theoryCount,1);
  assert.equal(snap.derivedStatusCounts.HYPOTHESIS,1);
  assert.equal(snap.canInfluencePrimary,false);
  assert.equal(snap.automaticPrimaryPromotionAllowed,false);
  assert.equal(snap.execution,'SHADOW_ONLY');
  assert.equal(snap.canExecuteLive,false);
});
