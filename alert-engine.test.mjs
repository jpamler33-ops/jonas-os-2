import test from "node:test";
import assert from "node:assert/strict";
import {
  createAlert,
  legacyPriceAlertToV2,
  sanitizeAlert,
  evaluateAlert,
  formatAlert,
  requiredContext
} from "./alert-engine.mjs";

test("legacy price alerts migrate",()=>{
  const a=legacyPriceAlertToV2({symbol:"BTCUSDT",target:70000,direction:"ABOVE",createdAt:1000});
  assert.equal(a.schemaVersion,2);
  assert.equal(a.type,"PRICE");
  assert.equal(a.once,true);
  assert.equal(a.conditions[0].op,"GTE");
});

test("price alert triggers once and disables",()=>{
  const a=createAlert({
    symbol:"BTCUSDT",type:"PRICE",createdAt:1000,once:true,cooldownMs:0,
    conditions:[{path:"market.price",op:"GTE",value:70000}]
  });
  const r=evaluateAlert(a,{market:{price:71000}},{now:2000});
  assert.equal(r.triggered,true);
  assert.equal(r.alert.enabled,false);
});

test("change alert establishes baseline before triggering",()=>{
  let a=createAlert({
    symbol:"BTCUSDT",type:"REGIME_CHANGE",createdAt:1000,
    conditions:[{path:"state.regime",op:"CHANGED"}]
  });
  let r=evaluateAlert(a,{state:{regime:"RANGE"}},{now:2000});
  assert.equal(r.triggered,false);
  assert.equal(r.reason,"NO_MATCH");
  a=r.alert;
  r=evaluateAlert(a,{state:{regime:"TREND_EXPANSION"}},{now:3000});
  assert.equal(r.triggered,true);
});

test("cooldown and fingerprint dedupe suppress repeats",()=>{
  let a=createAlert({
    symbol:"BTCUSDT",type:"WITNESS_AGREEMENT",createdAt:1000,cooldownMs:60000,
    conditions:[{path:"witness.agreement",op:"GTE",value:0.75}]
  });
  let r=evaluateAlert(a,{witness:{agreement:0.8}},{now:2000});
  assert.equal(r.triggered,true);
  a=r.alert;
  r=evaluateAlert(a,{witness:{agreement:0.81}},{now:3000});
  assert.equal(r.triggered,false);
  assert.equal(r.reason,"COOLDOWN");
  r=evaluateAlert(a,{witness:{agreement:0.8}},{now:70000});
  assert.equal(r.triggered,false);
  assert.equal(r.reason,"DEDUPED");
});

test("composite ALL requires every condition",()=>{
  const a=createAlert({
    symbol:"BTCUSDT",type:"COMPOSITE",createdAt:1000,
    conditions:[
      {path:"witness.agreement",op:"GTE",value:0.7},
      {path:"memory.support",op:"GTE",value:8},
      {path:"safety.state",op:"EQ",value:"VALID"}
    ]
  });
  const good=evaluateAlert(a,{witness:{agreement:0.8},memory:{support:10},safety:{state:"VALID"}},{now:2000});
  assert.equal(good.triggered,true);
  const bad=evaluateAlert(a,{witness:{agreement:0.8},memory:{support:2},safety:{state:"VALID"}},{now:2000});
  assert.equal(bad.triggered,false);
});

test("format and context requirements are deterministic",()=>{
  const a=createAlert({
    symbol:"ETHUSDT",type:"MEMORY_SUPPORT",createdAt:1000,
    conditions:[{path:"memory.support",op:"GTE",value:8}]
  });
  assert.match(formatAlert(a),/MEMORY_SUPPORT/);
  assert.deepEqual([...requiredContext(a)].sort(),["market","memory"]);
  assert.ok(sanitizeAlert(a));
});


test("threshold alert rearms only after leaving matched state",()=>{
  let a=createAlert({
    symbol:"BTCUSDT",type:"WITNESS_AGREEMENT",createdAt:1000,cooldownMs:0,
    conditions:[{path:"witness.agreement",op:"GTE",value:0.75}]
  });
  let r=evaluateAlert(a,{witness:{agreement:0.80}},{now:2000});
  assert.equal(r.triggered,true);
  a=r.alert;
  r=evaluateAlert(a,{witness:{agreement:0.82}},{now:3000});
  assert.equal(r.triggered,false);
  assert.equal(r.reason,"DEDUPED");
  a=r.alert;
  r=evaluateAlert(a,{witness:{agreement:0.60}},{now:4000});
  assert.equal(r.triggered,false);
  a=r.alert;
  r=evaluateAlert(a,{witness:{agreement:0.78}},{now:5000});
  assert.equal(r.triggered,true);
});
