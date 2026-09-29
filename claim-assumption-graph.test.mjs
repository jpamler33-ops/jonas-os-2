import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAIM_ASSUMPTION_GRAPH_VERSION,
  CLAIM_ASSUMPTION_REVISION_VERSION,
  buildClaimAssumptionGraph,
  verifyClaimAssumptionGraph,
  claimAssumptionInvalidationImpact,
  compareClaimAssumptionGraphs,
  claimAssumptionGraphSummary
} from './claim-assumption-graph.mjs';

function base(overrides={}){
  return {
    asOf:1000,
    subjectId:'FORECAST:BTCUSDT:1H:001',
    claims:[
      {
        claimId:'C-DIRECTION',
        statement:'Upside probability exceeds the neutral baseline.',
        epistemicClass:'MODELLED',
        required:true,
        assumptionIds:['A-REGIME','A-LIQUIDITY'],
        evidenceIds:['E-PRICE','E-DEPTH'],
        availableAt:900
      },
      {
        claimId:'C-PATH',
        statement:'The path can absorb a shallow retest before invalidation.',
        epistemicClass:'INFERRED',
        required:false,
        assumptionIds:['A-LIQUIDITY'],
        evidenceIds:['E-DEPTH'],
        availableAt:910
      }
    ],
    assumptions:[
      {
        assumptionId:'A-REGIME',
        statement:'The current regime classification remains valid over the forecast horizon.',
        evidenceIds:['E-PRICE'],
        requiresEvidence:true,
        availableAt:850,
        validUntil:1300
      },
      {
        assumptionId:'A-LIQUIDITY',
        statement:'Displayed liquidity remains sufficiently representative for the bounded path analysis.',
        evidenceIds:[],
        requiresEvidence:false,
        availableAt:860,
        validUntil:1200
      }
    ],
    evidence:[
      {
        evidenceId:'E-PRICE',
        classification:'OBSERVED',
        statement:'PIT price and structure snapshot.',
        provenanceIds:['L-PRICE'],
        observedAt:800,
        availableAt:810,
        validUntil:1100
      },
      {
        evidenceId:'E-DEPTH',
        classification:'OBSERVED',
        statement:'PIT executable depth snapshot.',
        provenanceIds:['L-DEPTH'],
        observedAt:820,
        availableAt:830,
        validUntil:1050
      }
    ],
    dependencies:[
      {
        fromAssumptionId:'A-LIQUIDITY',
        toAssumptionId:'A-REGIME',
        relation:'DEPENDS_ON',
        commonCauseIds:[],
        observedAt:870,
        availableAt:880
      }
    ],
    sourceTraceId:'trace-001',
    ...overrides
  };
}

test('claim-assumption graph is deterministic, immutable and research-only',()=>{
  const a=buildClaimAssumptionGraph(base());
  const b=buildClaimAssumptionGraph(base());
  assert.equal(a.version,CLAIM_ASSUMPTION_GRAPH_VERSION);
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(verifyClaimAssumptionGraph(a).ok,true);
  assert.equal(a.execution,'SHADOW_ONLY');
  assert.equal(a.action,'ABSTAIN');
  assert.equal(a.canInfluencePrimary,false);
  assert.equal(a.canExecuteLive,false);
  assert.equal(Object.isFrozen(a),true);
});

test('future claims assumptions evidence and dependency records are blocked',()=>{
  assert.throws(()=>buildClaimAssumptionGraph(base({
    assumptions:[...base().assumptions,{assumptionId:'A-FUTURE',statement:'Future only.',availableAt:1001}]
  })),/future assumption/);
  assert.throws(()=>buildClaimAssumptionGraph(base({
    evidence:[...base().evidence,{evidenceId:'E-FUTURE',classification:'OBSERVED',availableAt:1001}]
  })),/future evidence/);
  assert.throws(()=>buildClaimAssumptionGraph(base({
    claims:[...base().claims,{claimId:'C-FUTURE',statement:'Future claim.',epistemicClass:'MODELLED',availableAt:1001}]
  })),/future claim/);
});

test('missing assumption definitions are explicit audit defects',()=>{
  const input=base();
  input.claims[0].assumptionIds.push('A-MISSING');
  const g=buildClaimAssumptionGraph(input);
  assert.equal(g.diagnostics.researchGate,'AUDIT_DEFECTS_PRESENT');
  assert.ok(g.diagnostics.defects.some(x=>
    x.kind==='MISSING_ASSUMPTION_DEFINITION'&&x.claimId==='C-DIRECTION'&&x.assumptionId==='A-MISSING'
  ));
  assert.ok(g.diagnostics.affectedRequiredClaimCount>=1);
});

test('an explicit assumption without evidence is allowed unless support was declared mandatory',()=>{
  const g=buildClaimAssumptionGraph(base());
  const liquidity=g.nodes.find(x=>x.id==='ASSUMPTION:A-LIQUIDITY');
  assert.equal(liquidity.supportState,'EXPLICIT_ASSUMPTION');
  assert.equal(g.diagnostics.defects.some(x=>
    x.kind==='REQUIRED_ASSUMPTION_SUPPORT_MISSING'&&x.assumptionId==='A-LIQUIDITY'
  ),false);

  const input=base();
  input.assumptions[1].requiresEvidence=true;
  const strict=buildClaimAssumptionGraph(input);
  assert.ok(strict.diagnostics.defects.some(x=>
    x.kind==='REQUIRED_ASSUMPTION_SUPPORT_MISSING'&&x.assumptionId==='A-LIQUIDITY'
  ));
});

test('expired assumptions remain visible but invalidate dependent required claims in the audit',()=>{
  const input=base();
  input.assumptions[0].validUntil=950;
  const g=buildClaimAssumptionGraph(input);
  assert.ok(g.diagnostics.expiredAssumptionIds.includes('A-REGIME'));
  assert.ok(g.diagnostics.defects.some(x=>
    x.kind==='EXPIRED_ASSUMPTION_USED'&&x.claimId==='C-DIRECTION'&&x.assumptionId==='A-REGIME'
  ));
  assert.equal(g.nodes.find(x=>x.id==='ASSUMPTION:A-REGIME').state,'EXPIRED');
});

test('expired evidence is distinguished from missing evidence for claims and assumptions',()=>{
  const input=base({asOf:1100});
  input.assumptions[1].evidenceIds=['E-DEPTH'];
  input.assumptions[1].requiresEvidence=true;
  const g=buildClaimAssumptionGraph(input);
  assert.ok(g.diagnostics.defects.some(x=>
    x.kind==='EXPIRED_CLAIM_EVIDENCE'&&x.claimId==='C-DIRECTION'&&x.evidenceId==='E-DEPTH'
  ));
  assert.ok(g.diagnostics.defects.some(x=>
    x.kind==='EXPIRED_ASSUMPTION_EVIDENCE'&&x.assumptionId==='A-LIQUIDITY'&&x.evidenceId==='E-DEPTH'
  ));
  assert.equal(g.nodes.find(x=>x.id==='ASSUMPTION:A-LIQUIDITY').supportState,'EVIDENCE_EXPIRED');
});

test('shared assumption fanout and transitive invalidation impact are explicit but not treated as proof of invalidity',()=>{
  const g=buildClaimAssumptionGraph(base());
  const shared=g.diagnostics.sharedAssumptions.find(x=>x.assumptionId==='A-REGIME');
  assert.ok(shared);
  assert.equal(shared.directlyOrTransitivelyAffectedClaims,2);

  const impact=claimAssumptionInvalidationImpact(g,'A-REGIME');
  assert.deepEqual(impact.affectedAssumptionIds,['A-LIQUIDITY','A-REGIME']);
  assert.deepEqual(impact.affectedClaimIds,['C-DIRECTION','C-PATH']);
  assert.deepEqual(impact.affectedRequiredClaimIds,['C-DIRECTION']);
  assert.equal(impact.counterfactualOnly,true);
  assert.equal(impact.mutatesOriginalGraph,false);
  assert.equal(impact.canInfluencePrimary,false);
});

test('assumption dependency cycles are detected without silently resolving them',()=>{
  const input=base();
  input.dependencies.push({
    fromAssumptionId:'A-REGIME',
    toAssumptionId:'A-LIQUIDITY',
    relation:'DEPENDS_ON',
    commonCauseIds:[],
    observedAt:890,
    availableAt:895
  });
  const g=buildClaimAssumptionGraph(input);
  assert.ok(g.diagnostics.assumptionCycles.length>0);
  assert.ok(g.diagnostics.defects.some(x=>x.kind==='ASSUMPTION_DEPENDENCY_CYCLE'));
  assert.equal(g.diagnostics.researchGate,'AUDIT_DEFECTS_PRESENT');
});

test('revision comparison is a separate artifact and never rewrites the historical graph',()=>{
  const before=buildClaimAssumptionGraph(base());
  const input=base({asOf:1100});
  input.assumptions[1].evidenceIds=['E-DEPTH'];
  input.assumptions[1].requiresEvidence=true;
  input.claims.push({
    claimId:'C-REVISION',
    statement:'New evidence requires a narrower path assumption.',
    epistemicClass:'INFERRED',
    required:false,
    assumptionIds:['A-LIQUIDITY'],
    evidenceIds:['E-DEPTH'],
    availableAt:1080
  });
  const after=buildClaimAssumptionGraph(input);
  const revision=compareClaimAssumptionGraphs(before,after);
  assert.equal(revision.version,CLAIM_ASSUMPTION_REVISION_VERSION);
  assert.ok(revision.changes.claim.added.includes('CLAIM:C-REVISION'));
  assert.ok(revision.changes.assumption.changed.includes('ASSUMPTION:A-LIQUIDITY'));
  assert.equal(revision.rewritesHistoricalGraph,false);
  assert.equal(revision.canInfluencePrimary,false);
  assert.equal(before.asOf,1000);
  assert.equal(verifyClaimAssumptionGraph(before).ok,true);
});

test('backward-time revision comparisons are blocked',()=>{
  const later=buildClaimAssumptionGraph(base({asOf:1100}));
  const earlier=buildClaimAssumptionGraph(base({asOf:1000}));
  assert.throws(()=>compareClaimAssumptionGraphs(later,earlier),/backward in time/);
});

test('post-build mutation is detected by the graph fingerprint',()=>{
  const graph=structuredClone(buildClaimAssumptionGraph(base()));
  graph.diagnostics.researchGate='AUDIT_GRAPH_READY_TAMPERED';
  const v=verifyClaimAssumptionGraph(graph);
  assert.equal(v.ok,false);
  assert.ok(v.reasons.includes('FINGERPRINT_MISMATCH'));
});

test('summary exposes audit state without execution authority',()=>{
  const s=claimAssumptionGraphSummary(buildClaimAssumptionGraph(base()));
  assert.equal(s.integrity,'VALID');
  assert.equal(s.claimCount,2);
  assert.equal(s.assumptionCount,2);
  assert.equal(s.explicitAssumptionLinks,3);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.action,'ABSTAIN');
  assert.equal(s.canInfluencePrimary,false);
  assert.equal(s.canExecuteLive,false);
});
