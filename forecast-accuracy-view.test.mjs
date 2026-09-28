import test from 'node:test';
import assert from 'node:assert/strict';
import {buildForecastAccuracyView} from './forecast-accuracy-view.mjs';

function row(i,{symbol='BTCUSDT',h='5m',correct=true,confidence=.7}={}){
  return {
    id:String(i),symbol,horizonId:h,horizonMs:300000,asOf:i*600000,
    status:'RESOLVED',gate:'PASS',operationalConfidence:.6,
    probabilities:correct?{up:confidence,down:.2,flat:1-confidence-.2}:{up:confidence,down:.2,flat:1-confidence-.2},
    resolution:{
      topCorrect:correct,
      brier:correct?.18:.82,
      logLoss:correct?.3:1.4,
      intervalMiss:!correct,
      absoluteReturnError:correct?.01:.04
    }
  };
}

test('suppresses headline metrics until minimum sample size',()=>{
  const out=buildForecastAccuracyView([row(1),row(2)],{minDisplaySamples:5});
  assert.equal(out.ready,false);
  assert.match(out.text,/zu wenige aufgelöste Forecasts/);
});

test('shows accuracy and calibration once sample threshold is reached',()=>{
  const rows=[];
  for(let i=0;i<40;i++) rows.push(row(i,{correct:i%4!==0,confidence:.7}));
  const out=buildForecastAccuracyView(rows,{minDisplaySamples:30,foldSize:10});
  assert.equal(out.ready,true);
  assert.match(out.text,/Directional accuracy/);
  assert.match(out.text,/Brier score/);
  assert.match(out.text,/CALIBRATION BINS/);
  assert.ok(out.folds.length>=4);
});
