import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EPISTEMIC_INTEGRITY_VERSION,
  IDENTIFICATION_EVIDENCE_PLAN_VERSION,
  EVIDENCE_PLAN_SUFFICIENCY_VERSION,
  evaluateEpistemicIntegrity,
  verifyEpistemicIntegrity,
  buildIdentificationEvidencePlan,
  evaluateEvidencePlanSufficiency
} from './epistemic-integrity.mjs';

function bundle(){
  return {
    asOf:1000,
    subjectId:'MODEL:CAND-1',
    authorities:[
      {authorityId:'AUTH-1',canonicalControllerId:'AUTH-CONTROL-1',observedAt:700,availableAt:710},
      {authorityId:'AUTH-2',canonicalControllerId:'AUTH-CONTROL-2',observedAt:705,availableAt:715}
    ],
    resolverClaims:[
      {
        id:'RCLAIM-1',subjectId:'MODEL:CAND-1',canonicalControllerId:'CTRL-1',
        resolverId:'RESOLVER-1',authorityId:'AUTH-1',
        operatorDomain:'OP-1',trustDomain:'TRUST-1',controlDomain:'CONTROL-1',
        signed:true,signatureValid:true,observedAt:800,availableAt:810,provenanceIds:['L1']
      },
      {
        id:'RCLAIM-2',subjectId:'MODEL:CAND-1',canonicalControllerId:'CTRL-1',
        resolverId:'RESOLVER-2',authorityId:'AUTH-2',
        operatorDomain:'OP-2',trustDomain:'TRUST-2',controlDomain:'CONTROL-2',
        signed:true,signatureValid:true,observedAt:820,availableAt:830,provenanceIds:['L2']
      }
    ],
    claims:[
      {claimId:'CLAIM-1',assumptionIds:['A1'],evidenceIds:['E1','E2'],required:true}
    ],
    assumptions:[
      {assumptionId:'A1'}
    ],
    dependencies:[],
    lineageFacts:[
      {id:'L1',classification:'OBSERVED',parentIds:[],observedAt:600,availableAt:610},
      {id:'L2',classification:'OBSERVED',parentIds:[],observedAt:620,availableAt:630}
    ],
    discoveryChannels:[
      {channelId:'DISC-1',controllerId:'DISC-CONTROL-1',lineageIds:['L1'],observedAt:850,availableAt:860},
      {channelId:'DISC-2',controllerId:'DISC-CONTROL-2',lineageIds:['L2'],observedAt:855,availableAt:865}
    ],
    evidence:[
      {evidenceId:'E1',classification:'OBSERVED',observedAt:700,availableAt:720,provenanceIds:['L1']},
      {evidenceId:'E2',classification:'OBSERVED',observedAt:730,availableAt:740,provenanceIds:['L2']},
      {evidenceId:'ECAL',classification:'OBSERVED',observedAt:750,availableAt:760,provenanceIds:['L1','L2']}
    ],
    coverage:{
      observedLineages:2,
      expectedLineages:2,
      minimumCoverage:.8,
      calibrated:true,
      calibrationEvidenceId:'ECAL'
    }
  };
}

test('fully PIT-closed independent evidence is identified',()=>{
  const r=evaluateEpistemicIntegrity(bundle());
  assert.equal(r.version,EPISTEMIC_INTEGRITY_VERSION);
  assert.equal(r.identity.status,'RESOLVED');
  assert.equal(r.identity.groups[0].independentClaims,2);
  assert.equal(r.trustClosure.closed,true);
  assert.equal(r.identificationStatus,'IDENTIFIED');
  assert.equal(r.gate,'PASS');
  assert.deepEqual(r.obligations,[]);
  assert.equal(r.canExecute,false);
  assert.equal(verifyEpistemicIntegrity(r).ok,true);
});

test('authority aliases collapse nominal resolver independence',()=>{
  const x=bundle();
  x.authorities[1].canonicalControllerId='AUTH-CONTROL-1';
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.identity.groups[0].claims,2);
  assert.equal(r.identity.groups[0].independentClaims,1);
  assert.equal(r.identity.status,'INSUFFICIENT');
  assert.equal(r.gate,'ABSTAIN');
});

test('future resolver evidence cannot satisfy point-in-time identity consensus',()=>{
  const x=bundle();
  x.resolverClaims[1].availableAt=1001;
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.identity.status,'INSUFFICIENT');
  assert.ok(r.identity.reasons.includes('FUTURE_RESOLVER_CLAIMS_BLOCKED'));
  assert.equal(r.gate,'ABSTAIN');
});

test('trust-chain gaps fail closed and create observed lineage obligations',()=>{
  const x=bundle();
  x.resolverClaims[0].provenanceIds=['L-MISSING'];
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.trustClosure.closed,false);
  assert.equal(r.gate,'ABSTAIN');
  assert.ok(r.obligations.some(o=>o.kind==='LINEAGE_FACT'&&o.detail==='L-MISSING'));
});

test('leave-one-out fragility cannot masquerade as robust support',()=>{
  const x=bundle();
  x.claims[0].evidenceIds=['E1'];
  const r=evaluateEpistemicIntegrity(x);
  assert.deepEqual(r.fragileClaims,['CLAIM-1']);
  assert.equal(r.claimSupport[0].status,'FRAGILE');
  assert.equal(r.gate,'CAUTION');
});

test('identified dependency with unresolved common cause still abstains',()=>{
  const x=bundle();
  x.assumptions.push({assumptionId:'A2'});
  x.claims[0].assumptionIds=['A1','A2'];
  x.dependencies=[{
    fromAssumptionId:'A1',toAssumptionId:'A2',status:'IDENTIFIED',
    commonCauseIds:['CC-1'],observedAt:880,availableAt:890
  }];
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.dependency.status,'IDENTIFIED');
  assert.equal(r.dependency.commonCauseConflicts.length,1);
  assert.ok(r.obligations.some(o=>o.kind==='RESOLVE_COMMON_CAUSE'));
  assert.equal(r.gate,'ABSTAIN');
});

test('missing dependency map propagates UNIDENTIFIED status',()=>{
  const x=bundle();
  x.assumptions.push({assumptionId:'A2'});
  x.claims[0].assumptionIds=['A1','A2'];
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.dependency.status,'UNIDENTIFIED');
  assert.equal(r.identificationStatus,'UNIDENTIFIED');
  assert.ok(r.obligations.some(o=>o.kind==='DEPENDENCY_MAPPING'));
  assert.equal(r.gate,'ABSTAIN');
});

test('open-world lineage coverage creates a re-identification obligation',()=>{
  const x=bundle();
  delete x.coverage.expectedLineages;
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.coverage.status,'INSUFFICIENT');
  assert.ok(r.obligations.some(o=>o.kind==='LINEAGE_COVERAGE'));
  assert.equal(r.gate,'ABSTAIN');
});

test('discovery channels controlled by one controller are not independent',()=>{
  const x=bundle();
  x.discoveryChannels[1].controllerId='DISC-CONTROL-1';
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.discovery.status,'DEPENDENT');
  assert.ok(r.obligations.some(o=>o.kind==='RESOLVE_COMMON_CAUSE'));
  assert.equal(r.gate,'ABSTAIN');
});

test('alpha75 evidence plan is canonical, observed-only and does not clear abstain',()=>{
  const x=bundle();
  x.resolverClaims[0].provenanceIds=['L-MISSING'];
  const r=evaluateEpistemicIntegrity(x);
  const plan=buildIdentificationEvidencePlan(r);
  assert.equal(plan.version,IDENTIFICATION_EVIDENCE_PLAN_VERSION);
  assert.equal(plan.clearsAbstain,false);
  assert.equal(plan.canExecute,false);
  assert.ok(plan.items.length>0);
  assert.ok(plan.items.every(i=>i.requiredClassification==='OBSERVED'&&i.pitRequired===true));
  const keys=plan.items.map(i=>i.evidenceKind+'|'+String(i.assumptionId??''));
  assert.equal(new Set(keys).size,keys.length);
  assert.ok(plan.excludes.includes('PNL'));
});

test('alpha76 sufficiency is a candidate for revalidation, never a PASS grant',()=>{
  const r=evaluateEpistemicIntegrity(bundle());
  const plan=buildIdentificationEvidencePlan(r);
  const s=evaluateEvidencePlanSufficiency({report:r,plan});
  assert.equal(s.version,EVIDENCE_PLAN_SUFFICIENCY_VERSION);
  assert.equal(s.status,'SUFFICIENT_CANDIDATE');
  assert.equal(s.clearsAbstain,false);
  assert.equal(s.requiresFullReidentificationAfterAssimilation,true);
  assert.equal(s.canExecute,false);
});

test('open-world coverage makes the evidence plan conditional',()=>{
  const x=bundle();
  delete x.coverage.expectedLineages;
  const r=evaluateEpistemicIntegrity(x);
  const plan=buildIdentificationEvidencePlan(r);
  const s=evaluateEvidencePlanSufficiency({report:r,plan});
  assert.equal(s.status,'CONDITIONAL');
  assert.equal(s.clearsAbstain,false);
});

test('non-observed or non-PIT plan items are insufficient',()=>{
  const x=bundle();
  delete x.coverage.expectedLineages;
  const r=evaluateEpistemicIntegrity(x);
  const plan=structuredClone(buildIdentificationEvidencePlan(r));
  plan.items[0].requiredClassification='MODELLED';
  const s=evaluateEvidencePlanSufficiency({report:r,plan});
  assert.equal(s.status,'INSUFFICIENT');
  assert.ok(s.reasons.includes('PLAN_CONTAINS_NON_OBSERVED_OR_NON_PIT_EVIDENCE'));
});

test('epistemic report tampering is detected',()=>{
  const r=structuredClone(evaluateEpistemicIntegrity(bundle()));
  r.gate='ABSTAIN';
  assert.equal(verifyEpistemicIntegrity(r).ok,false);
});


test('empty trust roots fail closed instead of vacuously passing closure',()=>{
  const x=bundle();
  x.resolverClaims=[];
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.trustClosure.closed,false);
  assert.equal(r.trustClosure.emptyRoots,true);
  assert.ok(r.obligations.some(o=>o.kind==='TRUST_ROOT_EVIDENCE'));
  assert.ok(r.obligations.some(o=>o.kind==='INDEPENDENT_RESOLVER_CLAIM'));
  assert.equal(r.gate,'ABSTAIN');
});

test('zero discovery channels produce a concrete evidence acquisition obligation',()=>{
  const x=bundle();
  x.discoveryChannels=[];
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.discovery.status,'INSUFFICIENT');
  assert.ok(r.obligations.some(o=>o.kind==='DISCOVERY_CHANNEL_EVIDENCE'));
  const plan=buildIdentificationEvidencePlan(r);
  assert.ok(plan.items.some(i=>i.evidenceKind==='OBSERVED_INDEPENDENT_DISCOVERY_CHANNEL'));
  assert.equal(r.gate,'ABSTAIN');
});

test('missing resolver consensus becomes an explicit observed resolver evidence plan item',()=>{
  const x=bundle();
  x.resolverClaims=[x.resolverClaims[0]];
  const r=evaluateEpistemicIntegrity(x);
  assert.equal(r.identity.status,'INSUFFICIENT');
  const plan=buildIdentificationEvidencePlan(r);
  assert.ok(plan.items.some(i=>i.evidenceKind==='OBSERVED_INDEPENDENT_RESOLVER_CLAIM'));
  assert.equal(plan.clearsAbstain,false);
});

test('specific trust obligations dominate generic closure in the evidence plan',()=>{
  const x=bundle();
  x.resolverClaims=[];
  const r=evaluateEpistemicIntegrity(x);
  const plan=buildIdentificationEvidencePlan(r);
  const kinds=plan.items.map(i=>i.evidenceKind);
  assert.ok(kinds.includes('OBSERVED_TRUST_ROOT'));
  assert.ok(kinds.includes('OBSERVED_INDEPENDENT_RESOLVER_CLAIM'));
  assert.equal(kinds.filter(k=>k==='OBSERVED_PROVENANCE_CLOSURE').length,0);
});
