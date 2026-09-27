import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import { openAuditLedger } from './institutional-kernel.mjs';
import { hashReleaseRecord } from './runtime-release-registry.mjs';
import { buildForecastCandidateArtifact } from './forecast-candidate-lab.mjs';
import {
  createModelReleaseBinding,
  verifyPromotionReleaseLink,
  createModelRollbackDrill,
  verifyModelRollbackDrill
} from './model-release-binding.mjs';
import {
  appendModelPromotionAudit,
  appendModelRollbackDrillAudit
} from './model-governance-audit.mjs';

const config={
  featureIds:['x'],
  horizons:[{id:'5m',horizonMs:300000,flatThreshold:.001}]
};
function candidate(tag='a'){
  return buildForecastCandidateArtifact({
    historyRows:[{
      id:'r1',symbol:'BTCUSDT',timestamp:1000,availableAt:1100,resolvedAt:2000,
      horizonMs:300000,features:{x:1},regimeId:'RANGE',forwardReturn:.01
    }],
    incumbentConfig:config,
    candidateConfig:{...config,ridgeLambda:tag==='a'?1:2},
    dataCutoffAt:3000,
    createdAt:3001,
    parentReleaseId:'model-prev'
  });
}
function registryRecord(releaseId='software-1',candidateArtifact=null){
  const manifest={
    releaseId,
    kind:'TCX_RUNTIME_RELEASE',
    configHash:'c'.repeat(64),
    versions:{forecastConfigHash:candidateArtifact?.configHash??'f'.repeat(64)}
  };
  const core={
    schemaVersion:1,
    seq:1,
    prevHash:'0'.repeat(64),
    registeredAt:4000,
    releaseId,
    manifestHash:sha256(manifest),
    manifest
  };
  const record={...core,recordHash:sha256(core)};
  assert.equal(record.recordHash,hashReleaseRecord(record));
  return record;
}
function promotion(c,binding,previousReleaseId='model-prev'){
  const core={
    version:'TCX_MODEL_PROMOTION_RECORD_V1',
    promotedAt:5000,
    evaluationFingerprint:'e'.repeat(64),
    candidateId:c.candidateId,
    modelHash:c.modelHash,
    configHash:c.configHash,
    previousReleaseId,
    candidateReleaseId:binding.modelReleaseId,
    action:'REGISTER_PROMOTION_ONLY',
    productionMutationPerformed:false,
    executionMode:'SHADOW_ONLY',
    canExecute:false
  };
  return {...core,promotionId:sha256(core)};
}

test('model release binding links candidate to registered software release',()=>{
  const c=candidate();
  const record=registryRecord('software-1',c);
  const binding=createModelReleaseBinding({candidate:c,runtimeReleaseRecord:record,createdAt:4001});
  const registry={healthy:true,records:[record]};
  const p=promotion(c,binding);
  const link=verifyPromotionReleaseLink({promotion:p,binding,releaseRegistry:registry});
  assert.equal(link.ok,true);
  assert.equal(link.canExecute,false);
});

test('release linkage fails closed when software release is not registered',()=>{
  const c=candidate();
  const record=registryRecord('software-1',c);
  const binding=createModelReleaseBinding({candidate:c,runtimeReleaseRecord:record,createdAt:4001});
  const p=promotion(c,binding);
  const link=verifyPromotionReleaseLink({promotion:p,binding,releaseRegistry:{healthy:true,records:[]}});
  assert.equal(link.ok,false);
  assert.ok(link.reasons.includes('SOFTWARE_RELEASE_NOT_REGISTERED'));
});

test('rollback drill proves known previous model release without mutating production',()=>{
  const c=candidate('a');
  const prevCandidate=candidate('b');
  const currentRecord=registryRecord('software-current',c);
  const previousRecord=registryRecord('software-previous',prevCandidate);
  const currentBinding=createModelReleaseBinding({candidate:c,runtimeReleaseRecord:currentRecord,createdAt:4001});
  const previousBinding=createModelReleaseBinding({candidate:prevCandidate,runtimeReleaseRecord:previousRecord,createdAt:4001});
  const p=promotion(c,currentBinding,previousBinding.modelReleaseId);
  const drill=createModelRollbackDrill({
    promotion:p,
    candidateBinding:currentBinding,
    previousBinding,
    drilledAt:6000
  });
  assert.equal(verifyModelRollbackDrill(drill).ok,true);
  assert.equal(drill.result,'ROLLBACK_READY');
  assert.equal(drill.checks.productionMutationPerformed,false);
});

test('promotion and rollback drill are idempotently audit-bound',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-governance-'));
  const ledger=await openAuditLedger(path.join(dir,'audit.jsonl'));
  const c=candidate('a');
  const prevCandidate=candidate('b');
  const currentBinding=createModelReleaseBinding({candidate:c,runtimeReleaseRecord:registryRecord('software-current',c),createdAt:4001});
  const previousBinding=createModelReleaseBinding({candidate:prevCandidate,runtimeReleaseRecord:registryRecord('software-previous',prevCandidate),createdAt:4001});
  const p=promotion(c,currentBinding,previousBinding.modelReleaseId);
  const drill=createModelRollbackDrill({promotion:p,candidateBinding:currentBinding,previousBinding,drilledAt:6000});

  const a=await appendModelPromotionAudit(ledger,p,currentBinding);
  const b=await appendModelPromotionAudit(ledger,p,currentBinding);
  const d1=await appendModelRollbackDrillAudit(ledger,drill);
  const d2=await appendModelRollbackDrillAudit(ledger,drill);
  assert.equal(a.duplicate,false);
  assert.equal(b.duplicate,true);
  assert.equal(d1.duplicate,false);
  assert.equal(d2.duplicate,true);
});


test('model release binding rejects mismatched forecast config hash',()=>{
  const c=candidate();
  const wrong=candidate('b');
  const record=registryRecord('software-wrong',wrong);
  assert.throws(
    ()=>createModelReleaseBinding({candidate:c,runtimeReleaseRecord:record,createdAt:4001}),
    /forecast config hash/
  );
});
