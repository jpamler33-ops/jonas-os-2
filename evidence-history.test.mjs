import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import {
  deriveDisagreementMap,
  deriveEvidenceIndex,
  createEvidenceRecord,
  appendEvidenceRecord,
  loadEvidenceHistory,
  saveEvidenceHistory,
  appendEvidenceHistoryWal,
  compactEvidenceHistory,
  evidenceHistoryWalPath,
  evidenceHistoryFor
} from "./evidence-history.mjs";

function ctx(overrides={}){
  return {
    capturedAt:1000,
    state:{regime:"TREND_ORDERLY",mtfBias:"BULLISH",structure:"BULLISH",flow:"BID_PRESSURE"},
    witness:{agreement:0.9,contradiction:false,satisfied:true},
    memory:{support:14,sufficient:true,novelty:0.15},
    engine:{evidenceStrength:0.8,contradiction:0.1,gate:"HYPOTHESIS_SUPPORTED"},
    safety:{state:"VALID",canResearch:true,canExecute:false},
    ...overrides
  };
}

test("disagreement map detects directional conflict",()=>{
  const c=ctx();
  c.state.flow="ASK_PRESSURE";
  const map=deriveDisagreementMap(c);
  const flow=map.layers.find(x=>x.layer==="FLOW");
  assert.equal(map.reference,"BULLISH");
  assert.equal(flow.relation,"CONFLICT");
  assert.equal(map.conflictCount,1);
});

test("evidence index is a bounded diagnostic and safety capped",()=>{
  const good=deriveEvidenceIndex(ctx());
  const bad=deriveEvidenceIndex(ctx({
    witness:{agreement:0.1,contradiction:true},
    memory:{support:0,sufficient:false,novelty:1},
    engine:{evidenceStrength:0.1,contradiction:0.9,gate:"INSUFFICIENT_EVIDENCE"},
    safety:{state:"SAFE_STOP",canResearch:false,canExecute:false}
  }));
  assert.ok(good>bad);
  assert.ok(good<=100&&good>=0);
  assert.ok(bad<=25);
});

test("history trend becomes rising when evidence index improves materially",()=>{
  const first=createEvidenceRecord("BTCUSDT",ctx(),null);
  const weaker=ctx({
    capturedAt:2000,
    witness:{agreement:0.4,contradiction:false},
    memory:{support:4,sufficient:false,novelty:0.5},
    engine:{evidenceStrength:0.4,contradiction:0.2,gate:"INSUFFICIENT_EVIDENCE"},
    safety:{state:"VALID",canResearch:true,canExecute:false}
  });
  const low=createEvidenceRecord("BTCUSDT",weaker,null);
  const high=createEvidenceRecord("BTCUSDT",{...ctx(),capturedAt:3000},low);
  assert.equal(high.trend,"RISING");
  assert.ok(first.index>0);
});

test("persistent evidence history round-trips",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-"));
  const file=path.join(dir,"history.json");
  let records=[];
  const one=createEvidenceRecord("BTCUSDT",ctx(),null);
  records=appendEvidenceRecord(records,one);
  records=appendEvidenceRecord(records,createEvidenceRecord("BTCUSDT",{...ctx(),capturedAt:2000},one));
  await saveEvidenceHistory(file,records);
  const stored=await readFile(file);
  assert.equal(stored[0],0x1f);
  assert.equal(stored[1],0x8b);
  const parsed=JSON.parse(gunzipSync(stored).toString("utf8"));
  assert.equal(parsed.records.length,2);
  const loaded=await loadEvidenceHistory(file);
  assert.equal(evidenceHistoryFor(loaded.records,"BTCUSDT").length,2);
  assert.equal(loaded.recoveredFromCorrupt,false);
  assert.equal(loaded.storageEncoding,"gzip");
  assert.ok(loaded.storageBytes<loaded.logicalBytes);
});


test("legacy plain JSON evidence history remains readable and migrates to gzip on next save",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-legacy-"));
  const file=path.join(dir,"history.json");
  const one=createEvidenceRecord("BTCUSDT",ctx(),null);
  const legacy={schemaVersion:1,version:"TCX_EVIDENCE_HISTORY_V2",updatedAt:new Date().toISOString(),records:[one]};
  await writeFile(file,JSON.stringify(legacy,null,2),"utf8");
  const loaded=await loadEvidenceHistory(file);
  assert.equal(loaded.recoveredFromCorrupt,false);
  assert.equal(loaded.storageEncoding,"json");
  assert.equal(loaded.records.length,1);
  await saveEvidenceHistory(file,loaded.records);
  const migrated=await readFile(file);
  assert.equal(migrated[0],0x1f);
  assert.equal(migrated[1],0x8b);
});

test("bulk save trims per symbol without quadratic append replay",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-trim-"));
  const file=path.join(dir,"history.json");
  const rows=[];
  for(let i=0;i<50;i++) rows.push(createEvidenceRecord("BTCUSDT",{...ctx(),capturedAt:1000+i},null));
  const saved=await saveEvidenceHistory(file,rows,{maxPerSymbol:7});
  assert.equal(saved.length,7);
  assert.equal(saved[0].capturedAt,1043);
  assert.equal(saved.at(-1).capturedAt,1049);
});

test("evidence snapshots persist state fingerprints and lifecycle metadata",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-"));
  const file=path.join(dir,"history.json");
  const one=createEvidenceRecord("BTCUSDT",ctx(),null);
  assert.ok(one.stateFingerprint);
  assert.equal(one.stateFingerprint.hash.length,64);
  one.validityLast={
    version:"TCX_STATE_VALIDITY_V1",
    status:"DRIFTED",
    driftScore:0.31,
    ageMs:5000,
    canExecute:false,
    execution:"SHADOW_ONLY"
  };
  one.closedAt=6000;
  await saveEvidenceHistory(file,[one]);
  const loaded=await loadEvidenceHistory(file);
  const restored=loaded.records[0];
  assert.equal(restored.stateFingerprint.hash,one.stateFingerprint.hash);
  assert.equal(restored.validityLast.status,"DRIFTED");
  assert.equal(restored.closedAt,6000);
});


test("streaming evidence save cleans temporary file when logical limit is exceeded",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-limit-"));
  const file=path.join(dir,"history.json");
  const oversized={
    ...createEvidenceRecord("BTCUSDT",ctx(),null),
    diagnosticBlob:"x".repeat(8192)
  };

  await assert.rejects(
    ()=>saveEvidenceHistory(file,[oversized],{maxLogicalBytes:1024}),
    /persistence safety limit/
  );

  const names=await readdir(dir);
  assert.ok(!names.some(name=>name.startsWith("history.json.tmp-")));
});

test("streaming evidence save preserves exact schema for a larger batch",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-stream-"));
  const file=path.join(dir,"history.json");
  const rows=[];
  for(let i=0;i<200;i++){
    rows.push({
      ...createEvidenceRecord("BTCUSDT",{...ctx(),capturedAt:1000+i},null),
      diagnosticBlob:"repeatable-evidence-".repeat(80)
    });
  }

  await saveEvidenceHistory(file,rows,{maxPerSymbol:200});
  const stored=await readFile(file);
  const parsed=JSON.parse(gunzipSync(stored).toString("utf8"));
  assert.equal(parsed.schemaVersion,1);
  assert.equal(parsed.version,"TCX_EVIDENCE_HISTORY_V2");
  assert.equal(parsed.records.length,200);

  const loaded=await loadEvidenceHistory(file);
  assert.equal(loaded.recoveredFromCorrupt,false);
  assert.equal(loaded.records.length,200);
});


test("canonical runtime save can reuse validated record objects without changing persisted schema",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-reuse-"));
  const file=path.join(dir,"history.json");
  const one=createEvidenceRecord("BTCUSDT",ctx(),null);
  one.validityLast={status:"VALID",driftScore:0.1,ageMs:10};
  const saved=await saveEvidenceHistory(file,[one],{
    maxPerSymbol:2000,
    reuseCanonicalRecords:true
  });
  assert.equal(saved.length,1);
  assert.equal(saved[0],one);

  const stored=await readFile(file);
  const parsed=JSON.parse(gunzipSync(stored).toString("utf8"));
  assert.equal(parsed.records.length,1);
  assert.equal(parsed.records[0].fingerprint,one.fingerprint);

  const loaded=await loadEvidenceHistory(file);
  assert.equal(loaded.records.length,1);
  assert.equal(loaded.records[0].fingerprint,one.fingerprint);
  assert.notEqual(loaded.records[0],one);
});

test("reuse fast path still sanitizes non-canonical input instead of trusting it",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-reuse-guard-"));
  const file=path.join(dir,"history.json");
  const one={
    ...createEvidenceRecord("BTCUSDT",ctx(),null),
    index:999,
    trend:42
  };
  const saved=await saveEvidenceHistory(file,[one],{
    reuseCanonicalRecords:true
  });
  assert.equal(saved.length,1);
  assert.notEqual(saved[0],one);
  assert.equal(saved[0].index,100);
  assert.equal(saved[0].trend,"42");
});


test("evidence WAL replays durable upserts over the compressed snapshot",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-wal-"));
  const file=path.join(dir,"history.json");
  const wal=evidenceHistoryWalPath(file);
  const btc=createEvidenceRecord("BTCUSDT",ctx({capturedAt:1000}),null);
  await saveEvidenceHistory(file,[btc],{maxPerSymbol:2000,reuseCanonicalRecords:true});

  const revised={
    ...btc,
    validityLast:{status:"DRIFTED",driftScore:0.8,ageMs:5000,reasons:["TEST"]},
    closedAt:2000
  };
  const eth=createEvidenceRecord("ETHUSDT",ctx({capturedAt:2000}),null);
  const appended=await appendEvidenceHistoryWal(file,[revised,eth],{walPath});
  assert.equal(appended.appended,2);

  const loaded=await loadEvidenceHistory(file,{walPath,maxPerSymbol:2000});
  assert.equal(loaded.records.length,2);
  assert.equal(loaded.walRecords,2);
  assert.equal(loaded.records.find(x=>x.symbol==="BTCUSDT").closedAt,2000);
  assert.equal(loaded.records.find(x=>x.symbol==="BTCUSDT").validityLast.status,"DRIFTED");
  assert.ok(loaded.records.find(x=>x.symbol==="ETHUSDT"));
});

test("evidence WAL can recover records when no snapshot exists yet",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-wal-only-"));
  const file=path.join(dir,"history.json");
  const wal=evidenceHistoryWalPath(file);
  const one=createEvidenceRecord("BTCUSDT",ctx({capturedAt:3000}),null);
  await appendEvidenceHistoryWal(file,[one],{walPath});

  const loaded=await loadEvidenceHistory(file,{walPath,maxPerSymbol:2000});
  assert.equal(loaded.storageEncoding,null);
  assert.equal(loaded.records.length,1);
  assert.equal(loaded.records[0].fingerprint,one.fingerprint);
});

test("snapshot compaction preserves WAL evidence then clears the WAL",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tcx-evidence-compact-"));
  const file=path.join(dir,"history.json");
  const wal=evidenceHistoryWalPath(file);
  const one=createEvidenceRecord("BTCUSDT",ctx({capturedAt:4000}),null);
  await appendEvidenceHistoryWal(file,[one],{walPath});
  const loaded=await loadEvidenceHistory(file,{walPath,maxPerSymbol:2000});

  const compacted=await compactEvidenceHistory(file,loaded.records,{
    walPath,
    maxPerSymbol:2000,
    reuseCanonicalRecords:true
  });
  assert.equal(compacted.length,1);
  await assert.rejects(readFile(wal),err=>err?.code==="ENOENT");

  const reloaded=await loadEvidenceHistory(file,{walPath,maxPerSymbol:2000});
  assert.equal(reloaded.records.length,1);
  assert.equal(reloaded.walRecords,0);
  assert.equal(reloaded.records[0].fingerprint,one.fingerprint);
});
