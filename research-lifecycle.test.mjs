import test from "node:test";
import assert from "node:assert/strict";
import {
  latestEvidenceSnapshot,
  currentEvidenceLifecycle,
  advanceEvidenceLifecycle,
  compactValidity
} from "./research-lifecycle.mjs";

function ctx({at=1000,structure="BULLISH",bias="BULLISH",regime="TREND_ORDERLY",price=100}={}){
  return {
    capturedAt:at,
    market:{price},
    state:{
      regime,
      mtfBias:bias,
      structure,
      structureKey:structure+"|NONE",
      liquidity:"TIGHT",
      flow:structure==="BEARISH"?"ASK_PRESSURE":"BID_PRESSURE",
      pressure:40
    },
    witness:{agreement:0.8,contradiction:false,satisfied:true,externalCount:2},
    memory:{support:10,sufficient:true,novelty:0.2},
    engine:{evidenceStrength:0.7,contradiction:0.1,coherence:0.7,gate:"HYPOTHESIS_SUPPORTED"},
    safety:{state:"VALID",canResearch:true,canExecute:false}
  };
}

test("baseline lifecycle starts without prior validity",()=>{
  const state=currentEvidenceLifecycle([],"BTCUSDT",ctx());
  assert.equal(state.baseline,null);
  assert.equal(state.validity,null);
  assert.ok(state.record.stateFingerprint);
});

test("advance appends first record then dedupes identical short-window state",()=>{
  let records=[];
  let r=advanceEvidenceLifecycle(records,"BTCUSDT",ctx({at:1000}));
  records=r.records;
  assert.equal(r.appended,true);
  assert.equal(records.length,1);

  r=advanceEvidenceLifecycle(records,"BTCUSDT",ctx({at:2000}));
  assert.equal(r.appended,false);
  assert.equal(r.changed,true);
  assert.equal(r.validity.status,"VALID");
  assert.equal(r.records.length,1);
});

test("hard directional flip closes previous view as INVALIDATED",()=>{
  let records=advanceEvidenceLifecycle([],"BTCUSDT",ctx({at:1000})).records;
  const r=advanceEvidenceLifecycle(records,"BTCUSDT",ctx({
    at:5000,
    structure:"BEARISH",
    bias:"BEARISH",
    price:99
  }));
  assert.equal(r.validity.status,"INVALIDATED");
  assert.equal(r.previous.validityLast.status,"INVALIDATED");
  assert.equal(r.previous.closedAt,5000);
  assert.equal(r.appended,true);
  assert.equal(r.records.length,2);
});

test("latest snapshot and compact validity are deterministic",()=>{
  let records=advanceEvidenceLifecycle([],"ETHUSDT",ctx({at:1000})).records;
  const latest=latestEvidenceSnapshot(records,"ETHUSDT");
  assert.equal(latest.symbol,"ETHUSDT");
  const compact=compactValidity(null);
  assert.deepEqual(compact,{status:"BASELINE",driftScore:0,ageMs:0,reasons:[]});
});
