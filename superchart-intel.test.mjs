import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSuperchartIntel} from './superchart-intel.mjs';

test('clean mode stays sparse',()=>{
 const x=buildSuperchartIntel({mode:'CLEAN',symbol:'BTCUSDT',confluence:{zones:[{price:100,score:90,role:'SUPPORT',sources:['STRUCTURE']}]},liquidation:{clusters5m:[{price:99,totalUsd:1000}]}});
 assert.equal(x.mode,'CLEAN');assert.equal(x.panel.length,0);assert.equal(x.badges.some(b=>b.label==='ACC'),false);
});
test('full mode combines confluence liquidation flow and calibrated accuracy',()=>{
 const x=buildSuperchartIntel({
  mode:'FULL',symbol:'ETHUSDT',
  confluence:{zones:[{price:100,score:88,role:'SUPPORT',sources:['STRUCTURE','ORDERBOOK']}]},
  liquidation:{clusters15m:[{price:101,totalUsd:500000,longUsd:400000,shortUsd:100000}]},
  entityFlow:{ok:true,entities:{OKX:{'5m':{grossExternalEth:1000,netExternalEth:-200}}}},
  accuracy:{ready:true,evaluation:{overall:{directionalAccuracy:.64,multiclassBrier:.31,expectedCalibrationError:.07}}},
  onchain:{ok:true,chain:'ETHEREUM'},walletCohort:{ok:true},events:{events:[{type:'BOS_UP'}]}
 });
 assert.equal(x.confluenceZones[0].score,88);assert.match(x.panel.join(' '),/FLOW OKX -200/);assert.match(x.panel.join(' '),/ACC 64.0%/);
});
