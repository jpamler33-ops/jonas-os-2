import test from 'node:test';
import assert from 'node:assert/strict';

import { ProbabilityCalibrationMemory } from './forecast-runtime/forecast/calibration.js';

test('directional calibration exposes probability-bin effective-sample deficits',()=>{
  const memory=new ProbabilityCalibrationMemory();
  for(let i=0;i<5;i++){
    memory.add({
      id:'row-'+i,
      symbol:'BTCUSDT',
      horizonMs:300_000,
      resolvedAt:10_000+i,
      predictedUp:.62,
      predictedDown:.25,
      predictedFlat:.13,
      actualReturn:i%2===0?.002:-.001,
      flatThreshold:.0005,
      quality:1,
      regimeId:'RANGE'
    });
  }
  const out=memory.calibrateDirectional({
    symbol:'BTCUSDT',
    horizonMs:300_000,
    regimeId:'RANGE',
    raw:{up:.62,down:.25,flat:.13},
    asOf:20_000,
    options:{minCases:40,bins:10,priorStrength:12,recencyHalfLifeMs:0}
  });

  assert.equal(out.status,'INSUFFICIENT');
  assert.equal(out.targetEffectiveSamples,40);
  assert.equal(out.bins,10);
  assert.equal(out.perClass.up.probabilityBinIndex,6);
  assert.equal(out.perClass.up.probabilityBinLo,.6);
  assert.equal(out.perClass.up.probabilityBinHi,.7);
  assert.equal(out.perClass.down.probabilityBinIndex,2);
  assert.equal(out.perClass.flat.probabilityBinIndex,1);
  assert.equal(out.perClass.up.effectiveSamples,5);
  assert.equal(out.perClass.up.effectiveSampleDeficit,35);
  assert.equal(out.perClass.down.effectiveSampleDeficit,35);
  assert.equal(out.perClass.flat.effectiveSampleDeficit,35);
});

test('legacy calibration still exposes empty class bins for targeted bootstrap',()=>{
  const memory=new ProbabilityCalibrationMemory();
  for(let i=0;i<3;i++){
    memory.add({
      id:'legacy-'+i,
      symbol:'BTCUSDT',
      horizonMs:900_000,
      resolvedAt:10_000+i,
      predictedUp:.71,
      actualReturn:.002,
      flatThreshold:.0005,
      quality:1,
      regimeId:'TREND'
    });
  }
  const out=memory.calibrateDirectional({
    symbol:'BTCUSDT',
    horizonMs:900_000,
    regimeId:'TREND',
    raw:{up:.71,down:.19,flat:.10},
    asOf:20_000,
    options:{minCases:40,bins:10,priorStrength:12,recencyHalfLifeMs:0}
  });

  assert.equal(out.method,'LEGACY_UP_ONLY');
  assert.equal(out.targetEffectiveSamples,40);
  assert.equal(out.perClass.up.probabilityBinIndex,7);
  assert.equal(out.perClass.down.probabilityBinIndex,1);
  assert.equal(out.perClass.flat.probabilityBinIndex,1);
  assert.equal(out.perClass.down.effectiveSamples,0);
  assert.equal(out.perClass.down.effectiveSampleDeficit,40);
  assert.equal(out.perClass.flat.effectiveSampleDeficit,40);
});
