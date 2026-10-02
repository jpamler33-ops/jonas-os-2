import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TREND_BOX_ENGINE_VERSION,
  TREND_BOX_SCALES,
  buildTrendBoxes,
  buildMultiScaleTrendBoxes,
  trendBoxSummary
} from './trend-box-engine.mjs';

function waveCandles({future=false}={}){
  const closes=[];
  for(let i=0;i<20;i++)closes.push(100+Math.sin(i/3)*.08);
  for(let i=1;i<=10;i++)closes.push(100+i*.35);
  for(let i=1;i<=10;i++)closes.push(103.5-i*.42);
  for(let i=1;i<=10;i++)closes.push(99.3+i*.38);
  for(let i=1;i<=10;i++)closes.push(103.1-i*.36);
  const rows=closes.map((c,i)=>{
    const prev=i?closes[i-1]:c;
    const o=prev;
    return {
      openTime:i*300_000,
      closeTime:(i+1)*300_000-1,
      o,h:Math.max(o,c)+.12,l:Math.min(o,c)-.12,c,v:1000+i*5,closed:true
    };
  });
  if(future)rows.push({
    openTime:rows.length*300_000,closeTime:999_999_999,o:100,h:500,l:1,c:450,v:1e9,closed:false
  });
  return rows;
}

test('trend boxes close at the actual pivot and preserve later confirmation time',()=>{
  const rows=waveCandles();
  const asOf=rows.at(-1).closeTime+1;
  const r=buildTrendBoxes(rows,{asOf,scale:'M'});
  assert.equal(r.version,TREND_BOX_ENGINE_VERSION);
  assert.ok(r.closedBoxes>=2);
  for(const box of r.boxes.filter(x=>x.status==='CLOSED')){
    assert.ok(box.confirmedAt>box.endTime);
    assert.ok(box.confirmationLagBars>=1);
    assert.equal(box.pointInTime.futureLeakage,false);
    assert.equal(box.breakReason,'ATR_REVERSAL_CONFIRMED');
  }
});

test('closed trend boxes touch the next phase at the same reversal pivot',()=>{
  const rows=waveCandles();
  const r=buildTrendBoxes(rows,{asOf:rows.at(-1).closeTime+1,scale:'S'});
  const boxes=r.boxes;
  assert.ok(boxes.length>=3);
  for(let i=0;i<boxes.length-1;i++){
    assert.equal(boxes[i].endTime,boxes[i+1].startTime);
    assert.equal(boxes[i].endPrice,boxes[i+1].startPrice);
  }
});

test('larger trend scales segment less aggressively than smaller scales',()=>{
  const rows=waveCandles();
  const multi=buildMultiScaleTrendBoxes(rows,{asOf:rows.at(-1).closeTime+1});
  assert.equal(Object.keys(multi.byScale).length,Object.keys(TREND_BOX_SCALES).length);
  assert.ok(multi.byScale.XS.boxes.length>=multi.byScale.M.boxes.length);
  assert.ok(multi.byScale.M.boxes.length>=multi.byScale.XL.boxes.length);
  assert.ok(['ALL_UP','ALL_DOWN','MIXED','COLLECTING'].includes(multi.alignment.state));
});

test('unclosed future candle cannot rewrite existing trend boxes',()=>{
  const base=waveCandles();
  const asOf=base.at(-1).closeTime+1;
  const a=buildTrendBoxes(base,{asOf,scale:'M'});
  const b=buildTrendBoxes(waveCandles({future:true}),{asOf,scale:'M'});
  assert.deepEqual(a.boxes,b.boxes);
});

test('summary exposes only research state and no live execution authority',()=>{
  const rows=waveCandles();
  const s=trendBoxSummary(buildTrendBoxes(rows,{asOf:rows.at(-1).closeTime+1,scale:'L'}));
  assert.equal(s.available,true);
  assert.equal(s.canExecuteLive,false);
  assert.equal(s.execution,'SHADOW_ONLY');
});
