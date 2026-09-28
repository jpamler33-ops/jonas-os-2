import test from 'node:test';
import assert from 'node:assert/strict';
import {createExternalResearchProvider,coinMetricsSnapshotToExtraFeatures,deribitOptionsSnapshotToExtraFeatures,macroSnapshotToExtraFeatures,predictionMarketSnapshotToExtraFeatures} from './external-research-provider.mjs';

function response(body){return {ok:true,status:200,json:async()=>body};}

test('external research provider normalizes public and optional sources',async()=>{
  const fetchImpl=async url=>{
    const u=String(url);
    if(u.includes('coinmetrics')) return response({data:[
      {asset:'btc',time:'2026-09-28T00:00:00.000000000Z',AdrActCnt:'1000',AdrNewCnt:'200',TxCnt:'500',CapMVRVCur:'2.5'},
      {asset:'btc',time:'2026-09-27T00:00:00.000000000Z',AdrActCnt:'900',AdrNewCnt:'180',TxCnt:'450',CapMVRVCur:'2.4'}
    ]});
    if(u.includes('deribit')) return response({result:[
      {instrument_name:'BTC-30OCT26-100000-C',mark_iv:60,open_interest:100,volume_usd:100000},
      {instrument_name:'BTC-30OCT26-90000-P',mark_iv:70,open_interest:50,volume_usd:50000}
    ]});
    if(u.includes('series/observations')){
      const sid=new URL(u).searchParams.get('series_id');
      const val={DFF:5,DGS10:4,DTWEXBGS:120,WALCL:7000}[sid];
      return response({realtime_start:'2026-09-28',realtime_end:'2026-09-28',observations:[{date:'2026-09-26',value:String(val),realtime_start:'2026-09-28',realtime_end:'2026-09-28'},{date:'2026-09-25',value:String(val-1)}]});
    }
    if(u.includes('polymarket')) return response([{id:'m1',question:'Will BTC close above X?',outcomes:'["Yes","No"]',outcomePrices:'["0.63","0.37"]',liquidityNum:100000,volume24hr:50000,endDate:'2026-10-01'}]);
    throw new Error('unexpected '+u);
  };
  const provider=createExternalResearchProvider({fetchImpl,fredApiKey:'a'.repeat(32),polymarketMarkets:{BTCUSDT:'btc-test'},now:()=>1790629200000});
  const bundle=await provider.fetchBundle('BTCUSDT');
  assert.equal(bundle.coinMetrics.ok,true);
  assert.equal(bundle.deribitOptions.metrics.putCallOiRatio,.5);
  assert.equal(bundle.macro.metrics.us10yPct,4);
  assert.equal(bundle.predictionMarket.metrics.yesProbability,.63);
  assert.ok(coinMetricsSnapshotToExtraFeatures(bundle.coinMetrics).length>=4);
  assert.ok(deribitOptionsSnapshotToExtraFeatures(bundle.deribitOptions).some(x=>x.id==='research.options.putCallIvSkewPct'&&x.value===10));
  assert.ok(macroSnapshotToExtraFeatures(bundle.macro).some(x=>x.id==='research.macro.us10yMinusFedFundsPct'&&x.value===-1));
  assert.ok(predictionMarketSnapshotToExtraFeatures(bundle.predictionMarket).some(x=>x.id==='research.prediction.yesProbability'&&x.value===.63));
});

test('optional sources fail closed when not configured',async()=>{
  const provider=createExternalResearchProvider({fetchImpl:async()=>{throw new Error('must not fetch');},now:()=>1});
  const macro=await provider.fetchMacroSnapshot();
  const poly=await provider.fetchPredictionMarketSnapshot('BTCUSDT');
  assert.equal(macro.ok,false);
  assert.equal(poly.ok,false);
});
