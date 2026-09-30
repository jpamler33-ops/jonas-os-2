import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialAssumptionStability,
  observeAssumptionStability,
  verifyAssumptionStability,
  explicitAssumptionFalsifiers,
  assumptionEvidenceFamilies
} from './forecast-assumption-stability.mjs';

function witnessAssumption({supported=true,external=2,contradictions=[]}={}){
  return {
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    currentSupported:supported,
    expectedEvidenceIds:['THESIS_WITNESS_STATE'],
    currentEvidenceIds:supported?['THESIS_WITNESS_STATE']:[],
    currentEvidence:[{
      evidenceId:'THESIS_WITNESS_STATE',
      classification:'INFERRED',
      provenanceIds:[
        'SATISFIED:'+String(supported),
        'EXTERNAL:'+String(external),
        'AGREEMENT:'+(supported?'.9':'.4'),
        ...contradictions.map(x=>'CONTRADICTION:'+x)
      ],
      availableAt:1
    }]
  };
}

test('single support loss is transient flicker and cannot become persistent stale',()=>{
  const initial=createInitialAssumptionStability({
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    issueSupported:true,
    issueEvidenceIds:['THESIS_WITNESS_STATE']
  });
  const out=observeAssumptionStability(initial,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:100_000
  });
  assert.equal(out.stability.state,'TRANSIENT_FLICKER');
  assert.equal(out.event.type,'TRANSIENT_FLICKER_STARTED');
  assert.equal(out.stability.unsupportedObservationCount,1);
  assert.equal(out.stability.firstPersistentStaleAt,null);
  assert.equal(out.stability.persistentStaleCount,0);
  assert.equal(out.stability.canInfluencePrimary,false);
  assert.equal(out.stability.canExecuteLive,false);
});

test('repeated unsupported observation with elapsed time confirms persistent stale',()=>{
  let state=createInitialAssumptionStability({
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    issueSupported:true,
    issueEvidenceIds:['THESIS_WITNESS_STATE']
  });
  state=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:100_000
  }).stability;
  const out=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:400_000
  });
  assert.equal(out.stability.state,'PERSISTENT_STALE');
  assert.equal(out.event.type,'PERSISTENT_STALE_CONFIRMED');
  assert.equal(out.stability.unsupportedObservationCount,2);
  assert.equal(out.stability.firstPersistentStaleAt,400_000);
  assert.ok(out.event.repeatedFalsifierCodes.includes('WITNESS_NOT_SATISFIED'));
  assert.ok(out.event.repeatedFalsifierCodes.includes('WITNESS_EXTERNAL_COUNT_LT_2'));
});

test('brief flicker that clears is not structural staleness',()=>{
  let state=createInitialAssumptionStability({
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    issueSupported:true,
    issueEvidenceIds:['THESIS_WITNESS_STATE']
  });
  state=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:100_000
  }).stability;
  const out=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:true,external:2}),
    observedAt:150_000
  });
  assert.equal(out.stability.state,'SUPPORTED_STABLE');
  assert.equal(out.event.type,'FLICKER_CLEARED');
  assert.equal(out.stability.firstPersistentStaleAt,null);
  assert.equal(out.stability.persistentStaleCount,0);
});

test('persistent stale requires hysteretic recovery before returning stable',()=>{
  let state=createInitialAssumptionStability({
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    issueSupported:true,
    issueEvidenceIds:['THESIS_WITNESS_STATE']
  });
  state=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:100_000
  }).stability;
  state=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:400_000
  }).stability;
  const firstRecovery=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:true,external:2}),
    observedAt:700_000
  });
  assert.equal(firstRecovery.stability.state,'RECOVERING');
  assert.equal(firstRecovery.event.type,'RECOVERY_STARTED');

  const recovered=observeAssumptionStability(firstRecovery.stability,{
    assumption:witnessAssumption({supported:true,external:2}),
    observedAt:1_000_000
  });
  assert.equal(recovered.stability.state,'SUPPORTED_STABLE');
  assert.equal(recovered.event.type,'PERSISTENT_STALE_RECOVERED');
  assert.equal(recovered.stability.recoveryCount,1);
});

test('recovery relapse returns directly to persistent stale',()=>{
  let state=createInitialAssumptionStability({
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    issueSupported:true,
    issueEvidenceIds:['THESIS_WITNESS_STATE']
  });
  state=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:100_000
  }).stability;
  state=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:400_000
  }).stability;
  state=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:true,external:2}),
    observedAt:700_000
  }).stability;
  const relapse=observeAssumptionStability(state,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:800_000
  });
  assert.equal(relapse.stability.state,'PERSISTENT_STALE');
  assert.equal(relapse.event.type,'RECOVERY_FAILED');
  assert.equal(relapse.stability.relapseCount,1);
});

test('issue-unsupported assumption is not mislabeled as later stale',()=>{
  const initial=createInitialAssumptionStability({
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    issueSupported:false,
    issueEvidenceIds:[]
  });
  assert.equal(initial.state,'ISSUE_UNSUPPORTED');
  const out=observeAssumptionStability(initial,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:100_000
  });
  assert.equal(out.stability.state,'ISSUE_UNSUPPORTED');
  assert.equal(out.stability.firstPersistentStaleAt,null);
  assert.equal(out.event,null);
});

test('explicit falsifiers are derived from visible PIT provenance',()=>{
  const witness=witnessAssumption({
    supported:false,
    external:1,
    contradictions:['PRICE_DIVERGENCE']
  });
  const codes=explicitAssumptionFalsifiers(witness);
  assert.deepEqual(codes,[
    'WITNESS_EXTERNAL_COUNT_LT_2',
    'WITNESS_MATERIAL_CONTRADICTION',
    'WITNESS_NOT_SATISFIED'
  ]);
});

test('multi-domain evidence is exposed as structural corroboration, not statistical independence proof',()=>{
  const row={
    assumptionId:'THESIS_EVIDENCE_ALIGNMENT_ADEQUATE',
    currentSupported:false,
    expectedEvidenceIds:['THESIS_EVIDENCE_STATE','THESIS_MECHANISM_STATE'],
    currentEvidenceIds:[],
    currentEvidence:[
      {
        evidenceId:'THESIS_EVIDENCE_STATE',
        provenanceIds:['INDEX:30']
      },
      {
        evidenceId:'THESIS_MECHANISM_STATE',
        provenanceIds:['EVIDENCE_STRENGTH:0.3','GATE:INSUFFICIENT']
      }
    ]
  };
  assert.deepEqual(assumptionEvidenceFamilies(row),[
    'MECHANISM_MODEL',
    'RESEARCH_EVIDENCE_ALIGNMENT'
  ]);
  const codes=explicitAssumptionFalsifiers(row);
  assert.deepEqual(codes,['EVIDENCE_INDEX_LT_45','EVIDENCE_STRENGTH_LT_055']);

  let state=createInitialAssumptionStability({
    assumptionId:row.assumptionId,
    issueSupported:true,
    issueEvidenceIds:row.expectedEvidenceIds
  });
  state=observeAssumptionStability(state,{assumption:row,observedAt:100_000}).stability;
  const out=observeAssumptionStability(state,{
    assumption:row,
    observedAt:100_100,
    config:{minPersistentDurationMs:600_000}
  });
  assert.equal(out.stability.state,'PERSISTENT_STALE');
  assert.equal(out.event.persistentByCorroboration,true);
  assert.equal(out.stability.structurallyIndependentEvidenceFamilyCount,2);
  assert.equal(out.stability.semantics.structuralIndependenceIsHeuristicNotStatisticalProof,true);
});

test('non-advancing observation is idempotently rejected',()=>{
  const initial=createInitialAssumptionStability({
    assumptionId:'THESIS_WITNESS_SUPPORT_ADEQUATE',
    issueSupported:true,
    issueEvidenceIds:['THESIS_WITNESS_STATE']
  });
  const first=observeAssumptionStability(initial,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:100_000
  });
  const duplicate=observeAssumptionStability(first.stability,{
    assumption:witnessAssumption({supported:false,external:1}),
    observedAt:100_000
  });
  assert.equal(duplicate.changed,false);
  assert.equal(duplicate.stability.fingerprint,first.stability.fingerprint);
  assert.deepEqual(duplicate.reasons,['NON_ADVANCING_OBSERVATION']);
  assert.equal(verifyAssumptionStability(duplicate.stability).ok,true);
});
