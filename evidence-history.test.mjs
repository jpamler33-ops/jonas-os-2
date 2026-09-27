import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import {
  deriveDisagreementMap,
  deriveEvidenceIndex,
  createEvidenceRecord,
  appendEvidenceRecord,
  loadEvidenceHistory,
  saveEvidenceHistory,
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
  const loaded=await loadEvidenceHistory(file);
  assert.equal(evidenceHistoryFor(loaded.records,"BTCUSDT").length,2);
  assert.equal(loaded.recoveredFromCorrupt,false);
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
