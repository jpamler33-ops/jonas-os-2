import test from "node:test";
import assert from "node:assert/strict";
import {
  createStateFingerprint,
  validateStateFingerprint,
  compareStateFingerprints,
  assessResearchValidity,
  STATE_VALIDITY_VERSION
} from "./state-validity.mjs";

function ctx(overrides={}){
  const base={
    capturedAt:1000,
    market:{price:100},
    state:{
      regime:"TREND_ORDERLY",
      mtfBias:"BULLISH",
      structure:"BULLISH",
      structureKey:"BULLISH|NONE",
      liquidity:"TIGHT",
      flow:"BID_PRESSURE",
      pressure:42
    },
    witness:{agreement:0.82,contradiction:false,satisfied:true,externalCount:2},
    memory:{support:10,sufficient:true,novelty:0.25},
    engine:{evidenceStrength:0.72,contradiction:0.12,coherence:0.68,gate:"HYPOTHESIS_SUPPORTED"},
    safety:{state:"VALID",canResearch:true,canExecute:false}
  };
  return {
    ...base,
    ...overrides,
    market:{...base.market,...(overrides.market||{})},
    state:{...base.state,...(overrides.state||{})},
    witness:{...base.witness,...(overrides.witness||{})},
    memory:{...base.memory,...(overrides.memory||{})},
    engine:{...base.engine,...(overrides.engine||{})},
    safety:{...base.safety,...(overrides.safety||{})}
  };
}

test("fingerprints are stable under sub-bucket noise",()=>{
  const a=createStateFingerprint("BTCUSDT",ctx());
  const b=createStateFingerprint("BTCUSDT",ctx({
    capturedAt:2000,
    market:{price:100.01},
    state:{pressure:43},
    witness:{agreement:0.821},
    memory:{novelty:0.249},
    engine:{evidenceStrength:0.721}
  }));
  assert.equal(a.version,STATE_VALIDITY_VERSION);
  assert.equal(a.hash,b.hash);
  assert.equal(validateStateFingerprint(a),true);
});

test("directional structure flip hard-invalidates",()=>{
  const a=createStateFingerprint("BTCUSDT",ctx());
  const b=createStateFingerprint("BTCUSDT",ctx({
    capturedAt:2000,
    state:{structure:"BEARISH",structureKey:"BEARISH|BREAK"}
  }));
  const r=assessResearchValidity({baseline:a,current:b,now:2000});
  assert.equal(r.status,"INVALIDATED");
  assert.ok(r.hardReasons.includes("STRUCTURE_DIRECTION_FLIP"));
  assert.equal(r.canExecute,false);
});

test("safe stop hard-invalidates regardless of age",()=>{
  const a=createStateFingerprint("BTCUSDT",ctx());
  const b=createStateFingerprint("BTCUSDT",ctx({
    capturedAt:1500,
    safety:{state:"SAFE_STOP",canResearch:false}
  }));
  const r=assessResearchValidity({baseline:a,current:b,now:1500});
  assert.equal(r.status,"INVALIDATED");
  assert.ok(r.hardReasons.includes("RESEARCH_SAFETY_INVALIDATED"));
});

test("unchanged research view becomes stale then expired by time",()=>{
  const a=createStateFingerprint("BTCUSDT",ctx());
  const fresh=assessResearchValidity({baseline:a,current:a,now:5*60*1000});
  const stale=assessResearchValidity({baseline:a,current:a,now:12*60*1000});
  const expired=assessResearchValidity({baseline:a,current:a,now:31*60*1000});
  assert.equal(fresh.status,"VALID");
  assert.equal(stale.status,"STALE");
  assert.equal(expired.status,"EXPIRED");
});

test("multi-dimensional soft changes produce DRIFTED without hard flip",()=>{
  const a=createStateFingerprint("BTCUSDT",ctx());
  const b=createStateFingerprint("BTCUSDT",ctx({
    capturedAt:4000,
    market:{price:102.2},
    state:{
      regime:"MIXED",
      liquidity:"NORMAL",
      flow:"BALANCED",
      structureKey:"BULLISH|RETEST"
    },
    witness:{agreement:0.62,satisfied:false},
    memory:{novelty:0.55},
    engine:{evidenceStrength:0.50,gate:"INSUFFICIENT_EVIDENCE"}
  }));
  const cmp=compareStateFingerprints(a,b);
  assert.ok(cmp.driftScore>=0.28);
  assert.equal(cmp.hardReasons.length,0);
  const r=assessResearchValidity({baseline:a,current:b,now:4000});
  assert.equal(r.status,"DRIFTED");
});

test("entering STRESS invalidates the prior research regime",()=>{
  const a=createStateFingerprint("BTCUSDT",ctx());
  const b=createStateFingerprint("BTCUSDT",ctx({
    capturedAt:2000,
    state:{regime:"STRESS",liquidity:"WIDE",pressure:85}
  }));
  const r=assessResearchValidity({baseline:a,current:b,now:2000});
  assert.equal(r.status,"INVALIDATED");
  assert.ok(r.hardReasons.includes("REGIME_ENTERED_STRESS"));
});
