import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { sha256, openAuditLedger, appendAuditRecord, verifyLedgerRecords } from './institutional-kernel.mjs';
import { createInstitutionalForecastIssuance } from './institutional-forecast-issuance.mjs';
import { createResearchTraceEvaluation } from './research-trace.mjs';
import { appendInstitutionalForecastIssuanceAudit, appendResearchTraceEvaluationAudit } from './institutional-audit-binding.mjs';

const H='a'.repeat(64), I='b'.repeat(64), C='c'.repeat(64), R='d'.repeat(64);

function science(){
  const core={
    version:'TCX_SCIENTIFIC_VALIDITY_V1',asOf:1000,gate:'PASS',coverage:1,
    requiredGuardCount:1,usableRequiredGuardCount:1,guards:[],reasons:[],
    epistemic:'SCIENTIFIC_SUPPORT_DIAGNOSTIC_NOT_FORECAST_PROBABILITY',
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false
  };
  return {...core,fingerprint:sha256(core)};
}
function input(){return {symbol:'BTCUSDT',asOf:1000,price:65000,features:{x:1},dataQuality:.9,regimeConfidence:.8,regimeId:'RANGE'};}
function report(){return {
  executionMode:'SHADOW_ONLY',
  forecast:{symbol:'BTCUSDT',asOf:1000,price:65000,executionMode:'SHADOW_ONLY',path:{coherence:'OK'},forecasts:[{
    horizonId:'5m',horizonMs:300000,gate:'PASS',direction:'UP',expectedReturn:.002,
    probabilities:{up:.6,down:.2,flat:.2},
    interval:{q10:-.01,q25:-.003,median:.001,q75:.006,q90:.012},
    scenarios:[],calibration:{status:'CALIBRATED',method:'TRICLASS_EMPIRICAL',sampleCount:100,effectiveSamples:80,multiclassBrier:.4,logLoss:.7,maxClassGap:.03},
    localReliability:{status:'PASS',effectiveSamples:40,brierScore:.2},drift:{status:'STABLE',score:.1},
    analogs:{count:50,effectiveSamples:30,independentEpisodes:20,episodeEffectiveSamples:15,maxSimilarity:.9,oodScore:.1},
    modelDispersion:.01,probabilityDisagreement:.03,directionalEntropy:.5,operationalConfidence:.7,reasons:[],warnings:[],
    audit:{asOf:1000,usableTrainingCases:90,blockedFutureCases:0,invalidCases:0,featureCoverage:1,executionMode:'SHADOW_ONLY'}
  }]},
  regimeTransition:{status:'SUPPORTED'}
};}
function ctx(){return {
  data:{fabricSeq:12,fabricTailHash:H,inputFingerprint:I},
  release:{releaseId:'release-1',configHash:C},
  researchState:{fingerprint:R,regime:'RANGE'},
  evidence:[],contradictions:[],provenance:{source:'TEST',version:'1'}
};}
function issuance(){
  return createInstitutionalForecastIssuance({
    input:input(),forecastReport:report(),scientificValidity:science(),
    dataSafety:{state:'NORMAL'},researchValidity:{status:'VALID'},
    traceContext:ctx(),generatedAt:1010
  });
}

test('issuance audit is append-only and idempotent',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-audit-bind-'));
  const ledger=await openAuditLedger(path.join(dir,'ledger.jsonl'));
  const x=issuance();
  const a=await appendInstitutionalForecastIssuanceAudit(ledger,x,{occurredAt:1010});
  const b=await appendInstitutionalForecastIssuanceAudit(ledger,x,{occurredAt:1011});
  assert.equal(a.duplicate,false);
  assert.equal(b.duplicate,true);
  assert.equal(ledger.records.length,1);
  assert.equal(verifyLedgerRecords(ledger.records).ok,true);
  assert.equal(ledger.records[0].payload.issuanceId,x.issuanceId);
});

test('issuance dedupe survives eviction from bounded ledger tail',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-audit-index-'));
  const file=path.join(dir,'ledger.jsonl');
  let ledger=await openAuditLedger(file,{maxInMemoryRecords:2});
  const x=issuance();
  const first=await appendInstitutionalForecastIssuanceAudit(ledger,x,{occurredAt:1010});
  assert.equal(first.duplicate,false);
  for(let i=0;i<8;i++){
    await appendAuditRecord(ledger,{kind:'NOISE',payload:{i},occurredAt:2000+i});
  }
  assert.equal(ledger.records.some(r=>r?.payload?.issuanceId===x.issuanceId),false);
  const beforeSeq=ledger.seq;
  const duplicate=await appendInstitutionalForecastIssuanceAudit(ledger,x,{occurredAt:9999});
  assert.equal(duplicate.duplicate,true);
  assert.equal(ledger.seq,beforeSeq);

  ledger=await openAuditLedger(file,{maxInMemoryRecords:2});
  assert.equal(ledger.records.some(r=>r?.payload?.issuanceId===x.issuanceId),false);
  const reopenedBefore=ledger.seq;
  const afterRestart=await appendInstitutionalForecastIssuanceAudit(ledger,x,{occurredAt:10000});
  assert.equal(afterRestart.duplicate,true);
  assert.equal(ledger.seq,reopenedBefore);
});

test('matured evaluation links to trace and deduplicates',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-eval-bind-'));
  const ledger=await openAuditLedger(path.join(dir,'ledger.jsonl'));
  const x=issuance();
  await appendInstitutionalForecastIssuanceAudit(ledger,x,{occurredAt:1010});
  const e=createResearchTraceEvaluation(x.trace,{
    horizonId:'5m',maturedAt:1300,observedAt:1310,
    outcome:{returnPct:.3,direction:'UP'},metrics:{brier:.18}
  });
  const a=await appendResearchTraceEvaluationAudit(ledger,x.trace,e);
  const b=await appendResearchTraceEvaluationAudit(ledger,x.trace,e);
  assert.equal(a.duplicate,false);
  assert.equal(b.duplicate,true);
  assert.equal(ledger.records.length,2);
  assert.equal(verifyLedgerRecords(ledger.records).ok,true);
  assert.equal(ledger.records[1].payload.traceId,x.traceId);
});

test('tampered issuance cannot enter ledger',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-audit-bind-'));
  const ledger=await openAuditLedger(path.join(dir,'ledger.jsonl'));
  const x=structuredClone(issuance());
  x.gate='ABSTAIN';
  await assert.rejects(
    appendInstitutionalForecastIssuanceAudit(ledger,x),
    /invalid institutional issuance/
  );
  assert.equal(ledger.records.length,0);
});
