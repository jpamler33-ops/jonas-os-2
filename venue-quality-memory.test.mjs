import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import {
  venueSizeBucket,createVenueQualityObservations,appendVenueQualityObservations,
  matureVenueQualityObservation,estimateVenueQuality,loadVenueQualityMemory,saveVenueQualityMemory,
  VENUE_QUALITY_MEMORY_CAPABILITIES
} from './venue-quality-memory.mjs';

function report(){
  return {
    routeHash:'abc',
    intent:{side:'BUY',notionalQuote:1000},
    route:{
      filledBase:10,
      legs:[
        {venue:'BINANCE',baseQty:6},
        {venue:'OKX',baseQty:4}
      ]
    },
    singleVenueCounterfactuals:[
      {venue:'BINANCE',source:'B',quote:'USDT',fillRatio:1,avgFillPrice:100,slippageBps:1,allInBps:2,feesQuote:1,feeBps:10,fetchLatencyMs:20,depthExhausted:false,exclusionReasons:[]},
      {venue:'OKX',source:'O',quote:'USDT',fillRatio:0.8,avgFillPrice:100.2,slippageBps:3,allInBps:4,feesQuote:1,feeBps:10,fetchLatencyMs:40,depthExhausted:true,exclusionReasons:[]},
      {venue:'KRAKEN',source:'K',quote:'USD',fillRatio:0,avgFillPrice:null,slippageBps:null,allInBps:null,feesQuote:0,feeBps:10,fetchLatencyMs:30,depthExhausted:true,exclusionReasons:['QUOTE_MISMATCH_USD_VS_USDT']}
    ]
  };
}

test('VQM never has live execution capability',()=>{
  assert.equal(VENUE_QUALITY_MEMORY_CAPABILITIES.execution,'SHADOW_ONLY');
  assert.equal(VENUE_QUALITY_MEMORY_CAPABILITIES.canExecuteLive,false);
});

test('size buckets are deterministic',()=>{
  assert.equal(venueSizeBucket(50),'MICRO');
  assert.equal(venueSizeBucket(500),'SMALL');
  assert.equal(venueSizeBucket(5000),'MEDIUM');
  assert.equal(venueSizeBucket(50000),'LARGE');
  assert.equal(venueSizeBucket(500000),'BLOCK');
});

test('creates observations for all venue counterfactuals not only selected route legs',()=>{
  const xs=createVenueQualityObservations({report:report(),symbol:'BTCUSDT',regime:'RANGE',liquidity:'TIGHT',capturedAt:1000});
  assert.equal(xs.length,3);
  const b=xs.find(x=>x.venue==='BINANCE');
  const o=xs.find(x=>x.venue==='OKX');
  const k=xs.find(x=>x.venue==='KRAKEN');
  assert.equal(b.selectedShare,0.6);
  assert.equal(o.selectedShare,0.4);
  assert.equal(k.eligible,false);
  assert.equal(k.exclusionReasons[0],'QUOTE_MISMATCH_USD_VS_USDT');
});

test('append deduplicates identical observations',()=>{
  const xs=createVenueQualityObservations({report:report(),symbol:'BTCUSDT',capturedAt:1000});
  let r=appendVenueQualityObservations([],xs);
  assert.equal(r.added,3);
  r=appendVenueQualityObservations(r.records,xs);
  assert.equal(r.added,0);
  assert.equal(r.records.length,3);
});

test('markout matures only after requested horizon and signs adverse selection',()=>{
  const x=createVenueQualityObservations({report:report(),symbol:'BTCUSDT',capturedAt:1000})[0];
  let r=matureVenueQualityObservation(x,{mid:99,at:50_000});
  assert.equal(r.changed,false);
  r=matureVenueQualityObservation(x,{mid:99,at:61_000});
  assert.equal(r.changed,true);
  assert.ok(r.record.markouts['60000'].adverseSelectionBps>0);
  assert.equal(r.record.markouts['300000'],undefined);
});

test('quality estimate falls back hierarchically instead of inventing exact confidence',()=>{
  const base=createVenueQualityObservations({report:report(),symbol:'BTCUSDT',regime:'RANGE',liquidity:'TIGHT',capturedAt:1000})[0];
  const records=[];
  for(let i=0;i<15;i++) records.push({...base,id:'x'+i,capturedAt:1000+i,regime:'TREND_ORDERLY'});
  const e=estimateVenueQuality(records,{venue:'BINANCE',symbol:'BTCUSDT',side:'BUY',notionalQuote:1000,regime:'STRESS',liquidity:'WIDE'},{minSamples:12,now:10_000});
  assert.equal(e.scope,'SIZE');
  assert.equal(e.sampleN,15);
});

test('toxicity is gated until enough matured 5m observations exist',()=>{
  const base=createVenueQualityObservations({report:report(),symbol:'BTCUSDT',regime:'RANGE',liquidity:'TIGHT',capturedAt:1000})[0];
  const make=(i)=>({
    ...base,id:'m'+i,capturedAt:1000+i,
    markouts:{'300000':{horizonMs:300000,observedAt:400000+i,venueMid:99,signedMarkoutBps:-100,adverseSelectionBps:100}}
  });
  let records=Array.from({length:29},(_,i)=>make(i));
  let e=estimateVenueQuality(records,{venue:'BINANCE',symbol:'BTCUSDT',side:'BUY',notionalQuote:1000,regime:'RANGE',liquidity:'TIGHT'},{minSamples:12,minToxicitySamples:30,now:500000});
  assert.equal(e.toxicityBps,0);
  assert.equal(e.toxicityStatus,'NOT_APPLIED_INSUFFICIENT_EVIDENCE');
  records.push(make(29));
  e=estimateVenueQuality(records,{venue:'BINANCE',symbol:'BTCUSDT',side:'BUY',notionalQuote:1000,regime:'RANGE',liquidity:'TIGHT'},{minSamples:12,minToxicitySamples:30,now:500000});
  assert.ok(e.toxicityBps>0);
  assert.equal(e.toxicityStatus,'MODELLED_FROM_MATURED_VQM');
});

test('persistence round-trips VQM records',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-vqm-'));
  const file=path.join(dir,'vqm.json');
  const xs=createVenueQualityObservations({report:report(),symbol:'BTCUSDT',capturedAt:1000});
  await saveVenueQualityMemory(file,xs);
  const loaded=await loadVenueQualityMemory(file);
  assert.equal(loaded.healthy,true);
  assert.equal(loaded.records.length,3);
});

test('corrupt VQM state fails closed and is recovered separately',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-vqm-'));
  const file=path.join(dir,'vqm.json');
  await writeFile(file,'{bad');
  const loaded=await loadVenueQualityMemory(file);
  assert.equal(loaded.healthy,false);
  assert.equal(loaded.recoveredFromCorrupt,true);
  assert.equal(loaded.records.length,0);
});
