import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEpistemicLedger,
  registerTheory,
  appendTheoryEvidence,
  appendSurpriseEvent
} from './biggj-epistemic-kernel.mjs';
import {
  BIGGJ_MARKET_SCIENCE_DIRECTOR_VERSION,
  buildBiggjMarketScienceDirector,
  biggjMarketScienceDirectorSummary
} from './biggj-market-science-director.mjs';

const T0=Date.UTC(2026,8,30,20,0,0);

function addTheory(ledger,{
  title='Liquidity fragility',
  question='Does liquidity fragility amplify forced-flow displacement?',
  hypothesis='Lower liquidity elasticity amplifies displacement during forced flow.',
  falsifier='Prospective evidence shows no amplification after controls.',
  nullHypothesis='Noise or common-cause regime exposure explains the apparent amplification.',
  at=T0
}={}){
  return registerTheory(ledger,{title,question,hypothesis,falsifier,nullHypothesis},{at});
}

function addEvidence(ledger,theoryId,i,{
  polarity='SUPPORT',
  market=i%2?'ETH':'BTC',
  regime=i%2?'LOW_LIQUIDITY':'HIGH_LEVERAGE',
  controller='controller_'+(i%3),
  episode='episode_'+i,
  outOfSample=i>=2,
  falsifierHit=false
}={}){
  const observedAt=T0+1_000+i*100;
  return appendTheoryEvidence(ledger,theoryId,{
    evidenceId:'ev_'+theoryId+'_'+i+'_'+polarity,
    classification:'OBSERVED',
    kind:'REAL',
    polarity,
    sourceId:'source_'+(i%3),
    sourceControllerId:controller,
    provenanceIds:['prov_'+theoryId+'_'+i],
    independenceKey:episode,
    episodeId:episode,
    market,
    regime,
    horizon:'5M',
    observedAt,
    availableAt:observedAt+1,
    outOfSample,
    prospective:outOfSample,
    falsifierHit
  },{at:observedAt+2});
}

test('science director converts epistemic gaps into ranked research questions without trading authority',()=>{
  let ledger=createEpistemicLedger({asOf:T0});
  const r=addTheory(ledger);
  ledger=r.ledger;
  ledger=addEvidence(ledger,r.theory.theoryId,0).ledger;

  const d=buildBiggjMarketScienceDirector(ledger,{asOf:T0+60_000});
  assert.equal(d.version,BIGGJ_MARKET_SCIENCE_DIRECTOR_VERSION);
  assert.equal(d.agenda.length,1);
  assert.equal(d.agenda[0].kind,'EVIDENCE_GAP');
  assert.equal(d.agenda[0].nextExperimentType,'PROSPECTIVE_OBSERVATION');
  assert.equal(d.agenda[0].semantics.priorityIsHeuristicNotProbability,true);
  assert.equal(d.automaticExperimentLaunchAllowed,false);
  assert.equal(d.primaryMutationAllowed,false);
  assert.equal(d.canInfluencePrimary,false);
  assert.equal(d.canExecuteLive,false);
});

test('explicitly broken theory becomes high-priority failure analysis instead of a trading signal',()=>{
  let ledger=createEpistemicLedger({asOf:T0});
  const broken=addTheory(ledger,{title:'Broken theory'});
  ledger=broken.ledger;
  ledger=addEvidence(ledger,broken.theory.theoryId,0,{
    polarity:'CONTRA',
    falsifierHit:true,
    controller:'independent-a',
    episode:'fatal-episode',
    outOfSample:true
  }).ledger;

  const other=addTheory(ledger,{
    title:'Sparse theory',
    question:'Does sparse effect exist?',
    hypothesis:'Sparse effect exists.',
    falsifier:'Forward evidence fails to reproduce it.',
    nullHypothesis:'Noise explains it.',
    at:T0+5
  });
  ledger=other.ledger;

  const d=buildBiggjMarketScienceDirector(ledger,{asOf:T0+60_000});
  const item=d.agenda.find(x=>x.theoryId===broken.theory.theoryId);
  assert.equal(item.kind,'BROKEN_THEORY');
  assert.equal(item.nextExperimentType,'FAILURE_ANALYSIS');
  assert.equal(item.falsificationUrgency,1);
  assert.equal(item.primaryMutationAllowed,false);
});

test('contradicting observations inside the same regime create a contradiction research question',()=>{
  let ledger=createEpistemicLedger({asOf:T0});
  const r=addTheory(ledger,{title:'Regime-sensitive effect'});
  ledger=r.ledger;
  ledger=addEvidence(ledger,r.theory.theoryId,0,{
    polarity:'SUPPORT',
    regime:'HIGH_LEVERAGE',
    episode:'support-1'
  }).ledger;
  ledger=addEvidence(ledger,r.theory.theoryId,1,{
    polarity:'CONTRA',
    regime:'HIGH_LEVERAGE',
    episode:'contra-1'
  }).ledger;

  const d=buildBiggjMarketScienceDirector(ledger,{asOf:T0+60_000});
  const item=d.agenda[0];
  assert.equal(item.kind,'CONTRADICTION');
  assert.ok(item.contradictionClusters.some(x=>x.dimension==='REGIME'&&x.value==='HIGH_LEVERAGE'));
  assert.ok(item.question.includes('conflicting evidence'));
});

test('recurrent missing-variable candidates become explicit data requests but never auto-acquisition authority',()=>{
  let ledger=createEpistemicLedger({asOf:T0});
  const r=addTheory(ledger);
  ledger=r.ledger;

  for(let i=0;i<3;i++){
    ledger=appendSurpriseEvent(ledger,{
      theoryId:r.theory.theoryId,
      divergenceScore:2.5+i,
      expected:{direction:'UP'},
      observed:{direction:'DOWN'},
      observedAt:T0+10_000+i*100,
      availableAt:T0+10_001+i*100,
      candidateMissingVariables:['dealer_gamma','venue_fragmentation']
    },{at:T0+10_002+i*100}).ledger;
  }

  const d=buildBiggjMarketScienceDirector(ledger,{asOf:T0+60_000});
  const gamma=d.dataRequests.find(x=>x.variable==='dealer_gamma');
  assert.ok(gamma);
  assert.equal(gamma.surpriseCount,3);
  assert.equal(gamma.automaticAcquisitionAllowed,false);
  assert.equal(gamma.semantics.candidateVariableIsHypothesisNotFact,true);
  assert.equal(d.agenda[0].kind,'SURPRISE');
});

test('orphan surprises become UNKNOWN_UNKNOWN questions rather than fabricated theories',()=>{
  let ledger=createEpistemicLedger({asOf:T0});
  ledger=appendSurpriseEvent(ledger,{
    divergenceScore:4.4,
    expected:{return:0.01},
    observed:{return:-0.04},
    observedAt:T0+5_000,
    availableAt:T0+5_001,
    candidateMissingVariables:['unknown_flow_source']
  },{at:T0+5_002}).ledger;

  const before=ledger.theories.length;
  const d=buildBiggjMarketScienceDirector(ledger,{asOf:T0+60_000});
  assert.equal(d.agenda[0].kind,'UNKNOWN_UNKNOWN');
  assert.equal(d.agenda[0].theoryId,null);
  assert.equal(ledger.theories.length,before);
  assert.equal(d.semantics.questionsDoNotBecomeClaims,true);
});

test('alternative theories for one question form a competition with no automatic winner',()=>{
  let ledger=createEpistemicLedger({asOf:T0});
  const a=addTheory(ledger,{
    title:'Mechanism A',
    question:'What explains the displacement?',
    hypothesis:'Liquidity depletion explains the displacement.',
    falsifier:'No effect after liquidity controls.',
    nullHypothesis:'Noise explains it.'
  });
  ledger=a.ledger;
  const b=addTheory(ledger,{
    title:'Mechanism B',
    question:'What explains the displacement?',
    hypothesis:'Leverage concentration explains the displacement.',
    falsifier:'No effect after leverage controls.',
    nullHypothesis:'Noise explains it.',
    at:T0+1
  });
  ledger=b.ledger;
  for(let i=0;i<4;i++) ledger=addEvidence(ledger,a.theory.theoryId,i).ledger;
  ledger=addEvidence(ledger,b.theory.theoryId,20,{polarity:'SUPPORT'}).ledger;

  const d=buildBiggjMarketScienceDirector(ledger,{asOf:T0+120_000});
  assert.equal(d.theoryCompetitions.length,1);
  const competition=d.theoryCompetitions[0];
  assert.equal(competition.entries.length,2);
  assert.equal(competition.selectedWinnerTheoryId,null);
  assert.equal(competition.automaticWinnerSelectionForbidden,true);
  assert.equal(competition.semantics.rankingDoesNotEstablishTruth,true);
});

test('summary exposes the knowledge frontier and preserves fail-closed semantics',()=>{
  let ledger=createEpistemicLedger({asOf:T0});
  ledger=addTheory(ledger).ledger;
  const d=buildBiggjMarketScienceDirector(ledger,{asOf:T0+10_000});
  const s=biggjMarketScienceDirectorSummary(d);
  assert.equal(s.knowledgeFrontier.totalTheories,1);
  assert.ok(s.nextResearchQuestion);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.action,'ABSTAIN');
  assert.equal(s.automaticExperimentLaunchAllowed,false);
  assert.equal(s.primaryMutationAllowed,false);
  assert.equal(s.canExecuteLive,false);
});

test('director output is deterministic for the same ledger and as-of',()=>{
  let ledger=createEpistemicLedger({asOf:T0});
  ledger=addTheory(ledger).ledger;
  const a=buildBiggjMarketScienceDirector(ledger,{asOf:T0+10_000});
  const b=buildBiggjMarketScienceDirector(ledger,{asOf:T0+10_000});
  assert.equal(a.fingerprint,b.fingerprint);
});
