import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECHNICAL_INDICATOR_FACTORY_VERSION,
  TECHNICAL_INDICATOR_FAMILIES,
  TECHNICAL_INDICATOR_EXPERIMENTS,
  buildTechnicalIndicatorFeatures,
  technicalIndicatorFeatureSummary
} from './technical-indicator-feature-factory.mjs';

function candles(n=240,{stepMs=300000,start=1_000_000}={}){
  const out=[];
  let prev=100;
  for(let i=0;i<n;i++){
    const drift=.08+Math.sin(i/11)*.18;
    const o=prev;
    const c=Math.max(1,o+drift+Math.sin(i/4)*.05);
    const h=Math.max(o,c)+.3+Math.abs(Math.sin(i/7))*.15;
    const l=Math.min(o,c)-.3-Math.abs(Math.cos(i/8))*.15;
    const v=1000+200*Math.sin(i/9)+i*2;
    out.push({openTime:start+i*stepMs,closeTime:start+(i+1)*stepMs-1,o,h,l,c,v,closed:true});
    prev=c;
  }
  return out;
}
function byTf(){
  return {
    '5m':candles(260,{stepMs:5*60_000,start:1_000_000}),
    '15m':candles(220,{stepMs:15*60_000,start:2_000_000}),
    '1h':candles(220,{stepMs:60*60_000,start:3_000_000}),
    '4h':candles(220,{stepMs:4*60*60_000,start:4_000_000})
  };
}

test('broad indicator pool spans many classic families and four timeframes',()=>{
  assert.ok(TECHNICAL_INDICATOR_FAMILIES.length>=50);
  assert.equal(TECHNICAL_INDICATOR_EXPERIMENTS.length,TECHNICAL_INDICATOR_FAMILIES.length*4);
  const ids=new Set(TECHNICAL_INDICATOR_EXPERIMENTS.map(x=>x.id));
  assert.equal(ids.size,TECHNICAL_INDICATOR_EXPERIMENTS.length);
  for(const family of ['RSI','MACD','BOLLINGER','ATR','ADX_DMI','ICHIMOKU','SUPERTREND','VWAP','OBV','CMF','PARABOLIC_SAR','KST']){
    assert.ok(TECHNICAL_INDICATOR_FAMILIES.some(x=>x.id===family),family);
  }
});

test('factory emits finite point-in-time features without future candles',()=>{
  const input=byTf();
  const maxClose=Math.max(...Object.values(input).flat().map(x=>x.closeTime));
  const a=buildTechnicalIndicatorFeatures(input,{asOf:maxClose+1});
  assert.equal(a.version,TECHNICAL_INDICATOR_FACTORY_VERSION);
  assert.ok(a.features.length>250);
  assert.equal(a.familyCount,TECHNICAL_INDICATOR_FAMILIES.length);
  assert.equal(a.experimentCount,TECHNICAL_INDICATOR_EXPERIMENTS.length);
  assert.ok(a.features.every(x=>Number.isFinite(x.value)&&x.availableAt<=maxClose+1));
  for(const id of [
    'research.ta.5m.rsi14',
    'research.ta.5m.macdHistPct',
    'research.ta.15m.bbPosition20',
    'research.ta.1h.adx14',
    'research.ta.4h.ichimokuCloudDistance',
    'research.ta.4h.vwap20Distance'
  ]) assert.ok(a.features.some(x=>x.id===id),id);

  const future={...input['5m'].at(-1),openTime:maxClose+1000,closeTime:maxClose+300000,o:999999,h:1000000,l:1,c:999999,v:1e12,closed:false};
  const b=buildTechnicalIndicatorFeatures({...input,'5m':[...input['5m'],future]},{asOf:maxClose+1});
  const mapA=new Map(a.features.map(x=>[x.id,x.value]));
  const mapB=new Map(b.features.map(x=>[x.id,x.value]));
  assert.equal(mapA.get('research.ta.5m.rsi14'),mapB.get('research.ta.5m.rsi14'));
  assert.equal(mapA.get('research.ta.5m.macdHistPct'),mapB.get('research.ta.5m.macdHistPct'));
});

test('summary reports coverage and remains research-only',()=>{
  const input=byTf();
  const asOf=Math.max(...Object.values(input).flat().map(x=>x.closeTime))+1;
  const result=buildTechnicalIndicatorFeatures(input,{asOf});
  const s=technicalIndicatorFeatureSummary(result);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.timeframes.length,4);
  assert.ok(s.coverage['5m'].features>50);
  assert.ok(s.coverage['4h'].bars>=200);
});
