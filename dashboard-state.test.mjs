import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveChartDashboard } from './dashboard-state.mjs';

function candles({trend='up'}={}){
  const out=[];
  for(let i=0;i<40;i++){
    const base=trend==='up'?100+i*0.3:100;
    out.push({
      openTime:i*60_000,o:base,h:base+0.5,l:base-0.4,c:base+0.2,v:i===39?220:100,
      closeTime:i*60_000+59_999,closed:true
    });
  }
  out.push({openTime:40*60_000,o:999,h:1200,l:1,c:500,v:99999,closeTime:9999999999999,closed:false});
  return out;
}

test('dashboard bounds RIFT pressure and does not claim mechanism identification',()=>{
  const d=deriveChartDashboard(
    candles(),
    {trend:'BULLISH'},
    {bias:'BULLISH',biasScore:5},
    {spreadBps:0.5,imbalance:0.22}
  );
  assert.ok(d.pressureScore>=0&&d.pressureScore<=100);
  assert.equal(d.mechanismPosterior,'NOT_IDENTIFIED');
  assert.equal(d.epistemic.riftPressure,'DERIVED_HEURISTIC');
  assert.equal(d.epistemic.mechanism,'NOT_INFERRED');
});

test('active candle cannot distort closed-candle regime metrics',()=>{
  const a=candles();
  const b=a.slice(0,-1);
  const x=deriveChartDashboard(a,{trend:'BULLISH'},{bias:'BULLISH',biasScore:4},{spreadBps:0.5,imbalance:0.1});
  const y=deriveChartDashboard(b,{trend:'BULLISH'},{bias:'BULLISH',biasScore:4},{spreadBps:0.5,imbalance:0.1});
  assert.equal(x.atrPct,y.atrPct);
  assert.equal(x.volumeRatio,y.volumeRatio);
  assert.equal(x.regime,y.regime);
});

test('stress regime requires elevated pressure plus liquidity/range stress',()=>{
  const d=deriveChartDashboard(
    candles(),
    {trend:'NEUTRAL'},
    {bias:'MIXED',biasScore:0},
    {spreadBps:8,imbalance:0.5}
  );
  assert.equal(d.pressureBand,'HIGH');
  assert.equal(d.regime,'STRESS');
});
