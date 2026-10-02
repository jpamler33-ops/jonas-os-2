import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TREND_PHASE_FORECAST_VERSION,
  buildTrendPhaseForecasts,
  trendPhaseForecastSummary
} from './trend-phase-forecast.mjs';

function multi(){
  const active={};
  for(const [scale,direction] of [['XS','UP'],['S','UP'],['M','UP'],['L','DOWN'],['XL','DOWN']]){
    active[scale]={id:'box_'+scale,direction,status:'ACTIVE',bars:12};
  }
  return {active};
}
function overlay(){
  return {
    asOf:1000,
    anchorPrice:100,
    horizons:[
      {horizonId:'5m',horizonMs:300000,lowerPrice:99,medianPrice:101,upperPrice:103,gate:'PASS',operationalConfidence:.7},
      {horizonId:'15m',horizonMs:900000,lowerPrice:98,medianPrice:102,upperPrice:105,gate:'PASS',operationalConfidence:.68},
      {horizonId:'1h',horizonMs:3600000,lowerPrice:96,medianPrice:104,upperPrice:108,gate:'PASS',operationalConfidence:.63},
      {horizonId:'3h',horizonMs:10800000,lowerPrice:94,medianPrice:97,upperPrice:106,gate:'CAUTION',operationalConfidence:.52},
      {horizonId:'4h',horizonMs:14400000,lowerPrice:92,medianPrice:95,upperPrice:107,gate:'CAUTION',operationalConfidence:.49}
    ],
    scenarios:[
      {id:'UP',probability:.55,points:[
        {horizonMs:300000,targetPrice:101},{horizonMs:900000,targetPrice:102},{horizonMs:3600000,targetPrice:104},{horizonMs:10800000,targetPrice:105},{horizonMs:14400000,targetPrice:106}
      ]},
      {id:'DOWN',probability:.35,points:[
        {horizonMs:300000,targetPrice:99},{horizonMs:900000,targetPrice:98},{horizonMs:3600000,targetPrice:96},{horizonMs:10800000,targetPrice:95},{horizonMs:14400000,targetPrice:94}
      ]},
      {id:'FLAT',probability:.10,points:[
        {horizonMs:300000,targetPrice:100},{horizonMs:900000,targetPrice:100},{horizonMs:3600000,targetPrice:100},{horizonMs:10800000,targetPrice:100},{horizonMs:14400000,targetPrice:100}
      ]}
    ]
  };
}

test('maps each trend size to its nearest forecast horizon',()=>{
  const r=buildTrendPhaseForecasts(multi(),overlay());
  assert.equal(r.version,TREND_PHASE_FORECAST_VERSION);
  assert.equal(r.byScale.XS.targetHorizonId,'5m');
  assert.equal(r.byScale.S.targetHorizonId,'15m');
  assert.equal(r.byScale.M.targetHorizonId,'1h');
  assert.equal(r.byScale.L.targetHorizonId,'3h');
  assert.equal(r.byScale.XL.targetHorizonId,'4h');
});

test('reports alignment without pretending model path mass is empirical trend probability',()=>{
  const r=buildTrendPhaseForecasts(multi(),overlay());
  assert.equal(r.byScale.M.alignment,'ALIGNED');
  assert.equal(r.byScale.L.alignment,'ALIGNED');
  assert.ok(r.byScale.M.modelAlignedPathMass>.5);
  assert.match(r.byScale.M.semantics,/NOT_EMPIRICAL_CONTINUATION_PROBABILITY/);
  assert.equal(r.canExecuteLive,false);
});

test('summary carries explicit caveat and no execution authority',()=>{
  const s=trendPhaseForecastSummary(buildTrendPhaseForecasts(multi(),overlay()),'M');
  assert.equal(s.available,true);
  assert.equal(s.direction,'UP');
  assert.equal(s.horizonId,'1h');
  assert.match(s.caveat,/not empirical trend continuation probability/i);
  assert.equal(s.execution,'SHADOW_ONLY');
  assert.equal(s.canExecuteLive,false);
});

test('missing forecast fails closed instead of inventing a phase prediction',()=>{
  const r=buildTrendPhaseForecasts(multi(),null);
  assert.equal(r.available,false);
  assert.equal(r.summary.state,'NO_FORECAST');
  assert.equal(trendPhaseForecastSummary(r,'M').available,false);
});
