import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CFTC_COT_CONTRACTS,
  CFTC_COT_PUBLIC_PROVIDER_VERSION,
  cftcCotSnapshotToExtraFeatures,
  createCftcCotPublicProvider
} from './cftc-cot-public-provider.mjs';

const NOW=Date.parse('2026-09-30T12:00:00Z');
function response(body,status=200){return {ok:status>=200&&status<300,status,json:async()=>body};}

const row={
  id:'260929133741F',
  market_and_exchange_names:'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
  report_date_as_yyyy_mm_dd:'2026-09-29T00:00:00.000',
  yyyy_report_week_ww:'2026 Report Week 40',
  contract_market_name:'BITCOIN',
  cftc_contract_market_code:'133741',
  commodity:'BITCOIN',
  open_interest_all:'20000',
  change_in_open_interest_all:'1000',
  dealer_positions_long_all:'1000',
  dealer_positions_short_all:'2000',
  dealer_positions_spread_all:'500',
  asset_mgr_positions_long:'4000',
  asset_mgr_positions_short:'2000',
  asset_mgr_positions_spread:'1000',
  lev_money_positions_long:'5000',
  lev_money_positions_short:'8000',
  lev_money_positions_spread:'1200',
  nonrept_positions_long_all:'2000',
  nonrept_positions_short_all:'1500',
  pct_of_oi_dealer_long_all:'5',
  pct_of_oi_dealer_short_all:'10',
  pct_of_oi_asset_mgr_long:'20',
  pct_of_oi_asset_mgr_short:'10',
  pct_of_oi_lev_money_long:'25',
  pct_of_oi_lev_money_short:'40',
  conc_gross_le_4_tdr_long:'45',
  conc_gross_le_4_tdr_short:'55',
  traders_tot_all:'88'
};

test('contract map uses fixed CFTC market codes for BTC ETH and SOL',()=>{
  assert.equal(CFTC_COT_CONTRACTS.BTCUSDT.contractCode,'133741');
  assert.equal(CFTC_COT_CONTRACTS.ETHUSDT.contractCode,'146021');
  assert.equal(CFTC_COT_CONTRACTS.SOLUSDT.contractCode,'177LM1');
});

test('provider queries one fixed contract and uses capture time as PIT availability',async()=>{
  let requested='';
  const p=createCftcCotPublicProvider({
    fetchImpl:async url=>{requested=String(url);return response([row]);},
    baseUrl:'https://cftc.test/resource.json',
    now:()=>NOW
  });
  const out=await p.fetchSnapshot('BTCUSDT');
  assert.equal(out.version,CFTC_COT_PUBLIC_PROVIDER_VERSION);
  assert.equal(out.ok,true);
  assert.equal(out.source,'CFTC_TFF_FUTURES_ONLY');
  assert.equal(out.reportDate,Date.parse('2026-09-29T00:00:00Z'));
  assert.equal(out.availableAt,NOW);
  assert.equal(out.capturedAt,NOW);
  assert.equal(out.sourceEventId,row.id);
  assert.equal(out.leveragedMoney.netShare,-.15);
  assert.equal(out.assetManager.netShare,.1);
  assert.ok(requested.includes('133741'));
  assert.ok(requested.includes('%24order=report_date_as_yyyy_mm_dd+DESC'));
});

test('CFTC snapshot produces bounded positioning research features',async()=>{
  const p=createCftcCotPublicProvider({fetchImpl:async()=>response([row]),now:()=>NOW});
  const out=await p.fetchSnapshot('BTCUSDT');
  const features=cftcCotSnapshotToExtraFeatures(out);
  const byId=new Map(features.map(x=>[x.id,x.value]));
  assert.equal(byId.get('research.cftc.openInterestChangeShare'),.05);
  assert.equal(byId.get('research.cftc.dealerNetShare'),-.05);
  assert.equal(byId.get('research.cftc.assetManagerNetShare'),.1);
  assert.equal(byId.get('research.cftc.leveragedMoneyNetShare'),-.15);
  assert.equal(byId.get('research.cftc.nonreportableNetShare'),.025);
  assert.equal(byId.get('research.cftc.assetManagerLongShare'),.2);
  assert.equal(byId.get('research.cftc.leveragedMoneyShortShare'),.4);
  assert.equal(byId.get('research.cftc.top4LongConcentration'),.45);
  assert.ok(byId.get('research.cftc.openInterestLog')>0);
});

test('missing CFTC values stay absent instead of becoming synthetic zero',async()=>{
  const sparse={...row,asset_mgr_positions_long:null,asset_mgr_positions_short:null,pct_of_oi_asset_mgr_long:null,pct_of_oi_asset_mgr_short:null};
  const p=createCftcCotPublicProvider({fetchImpl:async()=>response([sparse]),now:()=>NOW});
  const out=await p.fetchSnapshot('BTCUSDT');
  const ids=new Set(cftcCotSnapshotToExtraFeatures(out).map(x=>x.id));
  assert.equal(ids.has('research.cftc.assetManagerNetShare'),false);
  assert.equal(ids.has('research.cftc.assetManagerLongShare'),false);
  assert.equal(ids.has('research.cftc.assetManagerShortShare'),false);
});

test('unsupported symbols fail closed without network request',async()=>{
  let calls=0;
  const p=createCftcCotPublicProvider({fetchImpl:async()=>{calls++;return response([]);},now:()=>NOW});
  const out=await p.fetchSnapshot('DOGEUSDT');
  assert.equal(out.ok,false);
  assert.equal(out.reason,'CFTC_CONTRACT_UNMAPPED');
  assert.equal(calls,0);
});
