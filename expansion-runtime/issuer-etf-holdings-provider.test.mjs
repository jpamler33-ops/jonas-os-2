import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ISSUER_ETF_FUNDS,
  createIssuerEtfHoldingsProvider,
  createIssuerEtfHoldingsState,
  enrichIssuerEtfSnapshotWithPrior,
  issuerEtfHoldingsToExtraFeatures,
  loadIssuerEtfHoldingsState,
  observeIssuerEtfHoldingsState,
  parseIssuerHoldingsCsv,
  saveIssuerEtfHoldingsState
} from './issuer-etf-holdings-provider.mjs';

const NOW=Date.parse('2026-09-30T12:00:00Z');
const IBIT_CSV=`iShares Bitcoin Trust ETF
Fund Holdings as of,"Sep 28, 2026"
Inception Date,"Jan 05, 2024"
Shares Outstanding,"1,412,720,000.00"
Stock,"-"
Bond,"-"
Cash,"-"
Other,"-"

Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Market Currency,Accrual Date
"BTC","BITCOIN","-","Alternative","66,755,340,897.25","100.00","66,755,340,897.25","800,535.28920","BTC","-"
"USD","USD CASH","-","Cash","22,646.77","0.00","22,646.77","22,646.77000","USD","-"`;

test('issuer CSV parser extracts direct IBIT holdings levels',()=>{
  const row=parseIssuerHoldingsCsv(IBIT_CSV,ISSUER_ETF_FUNDS.BTCUSDT,{capturedAt:NOW});
  assert.equal(row.fundTicker,'IBIT');
  assert.equal(row.assetTicker,'BTC');
  assert.equal(row.sharesOutstanding,1412720000);
  assert.equal(row.assetQuantity,800535.2892);
  assert.equal(row.assetMarketValueUsd,66755340897.25);
  assert.equal(row.cashUsd,22646.77);
  assert.equal(row.availableAt,NOW);
});

test('delta is stable across repeated observations of the same current date',()=>{
  const state=createIssuerEtfHoldingsState();
  observeIssuerEtfHoldingsState(state,{
    ok:true,fundTicker:'IBIT',asOfDate:Date.parse('2026-09-27T00:00:00Z'),
    assetQuantity:799000,sharesOutstanding:1410000000,assetMarketValueUsd:66000000000,cashUsd:20000
  },{observedAt:NOW-86400000});
  const current=parseIssuerHoldingsCsv(IBIT_CSV,ISSUER_ETF_FUNDS.BTCUSDT,{capturedAt:NOW});
  const first=enrichIssuerEtfSnapshotWithPrior(current,state);
  observeIssuerEtfHoldingsState(state,current,{observedAt:NOW});
  const repeated=enrichIssuerEtfSnapshotWithPrior(current,state);
  assert.equal(first.assetQuantityChangeShare,repeated.assetQuantityChangeShare);
  assert.equal(first.sharesOutstandingChangeShare,repeated.sharesOutstandingChangeShare);
  assert.equal(first.observationDayGap,1);
});

test('feature conversion omits deltas when no prior observation exists instead of fabricating zero',()=>{
  const current=parseIssuerHoldingsCsv(IBIT_CSV,ISSUER_ETF_FUNDS.BTCUSDT,{capturedAt:NOW});
  const enriched=enrichIssuerEtfSnapshotWithPrior(current,createIssuerEtfHoldingsState());
  const features=issuerEtfHoldingsToExtraFeatures(enriched);
  assert.equal(features.some(x=>x.id==='research.etf.assetQuantityChangeShare'),false);
  assert.equal(features.some(x=>x.id==='research.etf.sharesOutstandingChangeShare'),false);
  assert.ok(features.some(x=>x.id==='research.etf.assetQuantityLog'));
});

test('state persistence keeps multiple unique dates and recovers corrupt state separately',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-etf-state-'));
  const file=path.join(dir,'state.json');
  const state=createIssuerEtfHoldingsState();
  observeIssuerEtfHoldingsState(state,{ok:true,fundTicker:'IBIT',asOfDate:1,assetQuantity:10,sharesOutstanding:20,assetMarketValueUsd:30,cashUsd:1});
  observeIssuerEtfHoldingsState(state,{ok:true,fundTicker:'IBIT',asOfDate:2,assetQuantity:11,sharesOutstanding:21,assetMarketValueUsd:31,cashUsd:1});
  await saveIssuerEtfHoldingsState(file,state);
  const loaded=await loadIssuerEtfHoldingsState(file);
  assert.equal(loaded.recoveredFromCorrupt,false);
  assert.equal(loaded.state.byFund.IBIT.length,2);
  await writeFile(file,'{bad json','utf8');
  const recovered=await loadIssuerEtfHoldingsState(file);
  assert.equal(recovered.recoveredFromCorrupt,true);
  assert.ok(recovered.backupPath);
});

test('provider isolates a failed issuer feed and enriches healthy fund with prior state',async()=>{
  const state=createIssuerEtfHoldingsState();
  observeIssuerEtfHoldingsState(state,{
    ok:true,fundTicker:'IBIT',asOfDate:Date.parse('2026-09-27T00:00:00Z'),
    assetQuantity:799000,sharesOutstanding:1410000000,assetMarketValueUsd:66000000000,cashUsd:20000
  });
  const fetchImpl=async url=>{
    if(String(url).includes('333011')) return {ok:true,status:200,text:async()=>IBIT_CSV};
    return {ok:false,status:503,text:async()=>''};
  };
  const p=createIssuerEtfHoldingsProvider({fetchImpl,state,now:()=>NOW});
  const out=await p.fetchContext({force:true});
  assert.equal(out.ok,true);
  assert.equal(out.rows.length,1);
  assert.equal(out.rows[0].fundTicker,'IBIT');
  assert.ok(out.rows[0].assetQuantityChangeShare>0);
  assert.equal(out.errors.length,1);
  assert.equal(out.errors[0].fundTicker,'ETHA');
});
