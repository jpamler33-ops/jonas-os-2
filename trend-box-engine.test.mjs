import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TREND_BOX_ENGINE_VERSION,
  TREND_BOX_SCALES,
  buildTrendBoxes,
  trendBoxesForScale,
  trendBoxSummary,
  trendBoxForecastContext
} from './trend-box-engine.mjs';

function candlesFromCloses(values,{start=1_000_000,step=60_000}={}){
  return values.map((c,i)=>{
    const prev=i?values[i-1]:c;
    const o=prev;
    const high=Math.max(o,c)+.15;
    const low=Math.min(o,c)-.15;
    return {openTime:start+i*step,closeTime:start+(i+1)*step-1,o,h:high,l:low,c,v:1000+i,closed:true};
  });
}
function wave(){
  const out=[];
  let p=100;
  for(let i=0;i<28;i++){p+=.55;out.push(p);}
  for(let i=0;i<14;i++){p-=.75;out.push(p);}
  for(let i=0;i<20;i++){p+=.65;out.push(p);}
  return out;
}

test('builds independent trend boxes on XS through XL scales',()=>{
  const rows=candlesFromCloses(wave());
  const r=buildTrendBoxes(rows,{asOf:rows.at(-1).closeTime+1});
  assert.equal(r.version,TREND_BOX_ENGINE_VERSION);
  assert.deepEqual(Object.keys(r.scales),TREND_BOX_SCALES);
  assert.equal(r.canExecuteLive,false);
  for(const scale of TREND_BOX_SCALES){
    assert.ok(r.scales[scale]);
    assert.ok(['ACTIVE','AT_RISK','NO_BOX'].includes(r.scales[scale].status));
  }
});

test('closed box keeps historical pivot end while storing later confirmation time',()=>{
  const rows=candlesFromCloses(wave());
  const r=buildTrendBoxes(rows,{
    asOf:rows.at(-1).closeTime+1,
    config:{
      atrPeriod:5,riskConfirmBars:2,
      scales:{M:{startAtr:.5,reversalAtr:.7}}
    },
    scales:['M']
  });
  assert.ok(r.scales.M.boxes.length>=1);
  const b=r.scales.M.boxes[0];
  assert.equal(b.status,'CLOSED');
  assert.ok(b.confirmedAt>=b.endTime);
  assert.equal(b.termination.reversalPivotTime,b.endTime);
  assert.equal(b.termination.confirmedAt,b.confirmedAt);
  assert.ok(b.termination.confirmationLagMs>=0);
});

test('new box begins at the same reversal pivot so there is no structural gap',()=>{
  const rows=candlesFromCloses(wave());
  const r=buildTrendBoxes(rows,{
    asOf:rows.at(-1).closeTime+1,
    config:{atrPeriod:5,riskConfirmBars:2,scales:{S:{startAtr:.45,reversalAtr:.65}}},
    scales:['S']
  });
  const all=[...r.scales.S.boxes,...(r.scales.S.active?[r.scales.S.active]:[])];
  assert.ok(all.length>=2);
  for(let i=1;i<all.length;i++){
    assert.equal(all[i].startTime,all[i-1].endTime);
    assert.equal(all[i].startPrice,all[i-1].endPrice);
    assert.notEqual(all[i].direction,all[i-1].direction);
  }
});

test('active box can enter AT_RISK without being prematurely closed',()=>{
  const vals=[];
  let p=100;
  for(let i=0;i<25;i++){p+=.5;vals.push(p);}
  for(let i=0;i<1;i++){p-=1.2;vals.push(p);}
  const rows=candlesFromCloses(vals);
  const r=buildTrendBoxes(rows,{
    asOf:rows.at(-1).closeTime+1,
    config:{atrPeriod:5,riskConfirmBars:3,scales:{XS:{startAtr:.35,reversalAtr:.55}}},
    scales:['XS']
  });
  assert.ok(r.scales.XS.active);
  assert.ok(['ACTIVE','AT_RISK'].includes(r.scales.XS.active.status));
  if(r.scales.XS.active.status==='AT_RISK'){
    assert.ok(r.scales.XS.active.risk);
    assert.equal(r.scales.XS.boxes.length,0);
  }
});

test('scale selector returns closed history plus current active box',()=>{
  const rows=candlesFromCloses(wave());
  const r=buildTrendBoxes(rows,{asOf:rows.at(-1).closeTime+1});
  const m=trendBoxesForScale(r,'M',{limit:4});
  assert.ok(m.length>=1);
  assert.ok(m.length<=5);
  const all=trendBoxesForScale(r,'ALL',{limit:10});
  assert.ok(all.length>=m.length);
});

test('forecast context reports alignment with active trend without inventing trading authority',()=>{
  const rows=candlesFromCloses(wave());
  const r=buildTrendBoxes(rows,{
    asOf:rows.at(-1).closeTime+1,
    config:{atrPeriod:5,scales:{M:{startAtr:.45,reversalAtr:.65}}},
    scales:['M']
  });
  const active=r.scales.M.active;
  assert.ok(active);
  const anchor=active.endPrice;
  const overlay={
    anchorPrice:anchor,
    horizons:[{horizonId:'1h',horizonMs:3600000,medianPrice:active.direction==='UP'?anchor*1.01:anchor*.99}]
  };
  const ctx=trendBoxForecastContext(r,overlay,{scale:'M'});
  assert.equal(ctx.available,true);
  assert.equal(ctx.alignment,'ALIGNED');
  assert.equal(ctx.authority,'NONE');
  assert.equal(ctx.probabilistic,true);
});

test('summary does not expose execution authority',()=>{
  const rows=candlesFromCloses(wave());
  const s=trendBoxSummary(buildTrendBoxes(rows,{asOf:rows.at(-1).closeTime+1}));
  assert.equal(s.canExecuteLive,false);
  assert.ok(s.scales.M);
});
