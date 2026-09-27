import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import {
  canonicalJson,sha256,auditMarketSnapshot,auditWitnessReport,auditEngineResult,determineSafetyState,
  buildResearchEnvelope,openAuditLedger,appendAuditRecord,verifyLedgerRecords,replayEnvelopeIntegrity
} from './institutional-kernel.mjs';

function market(now=1_000_000){
  return {
    symbol:'BTCUSDT',price:100,bid:99.99,ask:100.01,spreadBps:2,imbalance:0.2,
    timestamp:now-100,availableAt:now-50,source:'TEST',version:'v1',provenance:'test'
  };
}
function witness(){
  return {
    externalWitnessCount:2,agreementScore:0.8,independentWitnessSatisfied:true,
    sourceIndependence:'MULTI_VENUE_INDEPENDENT',distinctVenues:['BINANCE','OKX','KRAKEN'],
    contradictions:[],rejected:[],witnessErrors:[]
  };
}
function engine(){
  return {
    version:'MTL_V1',action:'ABSTAIN',execution:'SHADOW_ONLY',
    hypothesis:{candidate:'FORCED_FLOW',gate:'HYPOTHESIS_SUPPORTED',causalStatus:'NOT_IDENTIFIED',evidenceStrength:0.7},
    audit:{contradictionScore:0.1,modalityCoverage:1},
    lattice:{novelty:0.2,transitionEntropy:0.3,transitionCoherence:0.7,support:10}
  };
}

test('canonical JSON and SHA256 are key-order deterministic',()=>{
  assert.equal(canonicalJson({b:2,a:1}),canonicalJson({a:1,b:2}));
  assert.equal(sha256({b:2,a:1}),sha256({a:1,b:2}));
});

test('data quality firewall rejects crossed or stale primary book',()=>{
  const now=1_000_000;
  assert.equal(auditMarketSnapshot(market(now),{now}).ok,true);
  const crossed={...market(now),bid:101,ask:100};
  assert.ok(auditMarketSnapshot(crossed,{now}).errors.includes('CROSSED_BOOK'));
  const stale={...market(now),availableAt:now-30_000};
  assert.ok(auditMarketSnapshot(stale,{now,maxAgeMs:15_000}).errors.includes('PRIMARY_STALE'));
});

test('engine invariant rejects any non-shadow execution or non-abstain action',()=>{
  assert.equal(auditEngineResult(engine()).ok,true);
  assert.ok(auditEngineResult({...engine(),execution:'LIVE'}).errors.includes('EXECUTION_MODE_VIOLATION'));
  assert.ok(auditEngineResult({...engine(),action:'BUY'}).errors.includes('ACTION_INVARIANT_VIOLATION'));
});

test('control plane fails closed on hard data or ledger failure',()=>{
  const now=1_000_000;
  const good=determineSafetyState({
    marketAudit:auditMarketSnapshot(market(now),{now}),
    witnessAudit:auditWitnessReport(witness()),
    engineAudit:auditEngineResult(engine()),
    ledgerHealthy:true
  });
  assert.equal(good.state,'NORMAL');
  assert.equal(good.canExecute,false);

  const stopped=determineSafetyState({
    marketAudit:auditMarketSnapshot({...market(now),bid:200,ask:100},{now}),
    witnessAudit:auditWitnessReport(witness()),
    engineAudit:auditEngineResult(engine()),
    ledgerHealthy:true
  });
  assert.equal(stopped.state,'SAFE_STOP');
  assert.equal(stopped.canResearch,false);
  assert.equal(stopped.canExecute,false);
});

test('research envelope is deterministic and self-verifiable',()=>{
  const now=1_000_000;
  const safety={state:'NORMAL',canResearch:true,canExecute:false,executionMode:'SHADOW_ONLY',hardReasons:[],softReasons:[]};
  const args={
    symbol:'BTCUSDT',availableAt:now,market:market(now),witness:witness(),engine:engine(),safety,
    config:{maxAgeMs:15000,mode:'SHADOW_ONLY'},versions:{kernel:'IK_V1',engine:'MTL_V1'}
  };
  const a=buildResearchEnvelope(args),b=buildResearchEnvelope(args);
  assert.equal(a.envelopeHash,b.envelopeHash);
  assert.equal(replayEnvelopeIntegrity(a).ok,true);
});

test('hash-chain ledger appends and verifies',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-ledger-'));
  const file=path.join(dir,'audit.jsonl');
  const ledger=await openAuditLedger(file);
  const a=await appendAuditRecord(ledger,{kind:'TEST',payload:{x:1},occurredAt:1});
  const b=await appendAuditRecord(ledger,{kind:'TEST',payload:{x:2},occurredAt:2});
  assert.equal(a.seq,1);assert.equal(b.seq,2);assert.equal(b.prevHash,a.recordHash);
  const reopened=await openAuditLedger(file);
  assert.equal(reopened.healthy,true);
  assert.equal(reopened.seq,2);
  assert.equal(verifyLedgerRecords(reopened.records).ok,true);
});

test('ledger detects historical tampering',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-ledger-'));
  const file=path.join(dir,'audit.jsonl');
  const ledger=await openAuditLedger(file);
  await appendAuditRecord(ledger,{kind:'TEST',payload:{x:1},occurredAt:1});
  await appendAuditRecord(ledger,{kind:'TEST',payload:{x:2},occurredAt:2});
  const lines=(await readFile(file,'utf8')).trim().split('\n').map(JSON.parse);
  lines[0].payload.x=999;
  await writeFile(file,lines.map(JSON.stringify).join('\n')+'\n');
  const reopened=await openAuditLedger(file);
  assert.equal(reopened.healthy,false);
  assert.equal(reopened.verification.error,'PAYLOAD_HASH_MISMATCH');
});

test('missing independent witnesses degrades but does not corrupt research engine',()=>{
  const now=1_000_000;
  const weak={externalWitnessCount:0,agreementScore:0,independentWitnessSatisfied:false,rejected:[],witnessErrors:[]};
  const s=determineSafetyState({
    marketAudit:auditMarketSnapshot(market(now),{now}),
    witnessAudit:auditWitnessReport(weak),
    engineAudit:auditEngineResult(engine()),
    ledgerHealthy:true
  });
  assert.equal(s.state,'DEGRADED');
  assert.equal(s.canResearch,true);
  assert.equal(s.canExecute,false);
});


test('malformed ledger boots diagnostics in unhealthy SAFE_STOP-compatible state',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-ledger-'));
  const file=path.join(dir,'audit.jsonl');
  await writeFile(file,'{bad-json\n');
  const ledger=await openAuditLedger(file);
  assert.equal(ledger.healthy,false);
  assert.equal(ledger.verification.error,'LEDGER_READ_OR_PARSE_FAILURE');
});


test('control plane SAFE_STOPs when market data fabric integrity is unhealthy',()=>{
  const now=1_000_000;
  const s=determineSafetyState({
    marketAudit:auditMarketSnapshot(market(now),{now}),
    witnessAudit:auditWitnessReport(witness()),
    engineAudit:auditEngineResult(engine()),
    ledgerHealthy:true,
    fabricHealthy:false
  });
  assert.equal(s.state,'SAFE_STOP');
  assert.ok(s.hardReasons.includes('MARKET_DATA_FABRIC_UNHEALTHY'));
  assert.equal(s.canResearch,false);
  assert.equal(s.canExecute,false);
});
