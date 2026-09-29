import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResearchDataPlaneSnapshots } from './research-data-plane-adapters.mjs';

test('adapters normalize derivatives, liquidation, onchain and entity flow snapshots',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'ETHUSDT',
    ingestedAt:2_000_000,
    derivativesSnapshot:{
      ok:true,availableAt:1_999_900,
      version:'TCX_DERIVATIVES_PUBLIC_PROVIDER_V1',
      binance:{fundingRate:.0001,premiumPct:.001,openInterestUsd:1000,openInterestDelta5m:.01,globalLongShortRatio:1.1,takerBuySellRatio:1.2,publishedAt:1_999_800},
      okx:{fundingRate:.0002,openInterestUsd:900,publishedAt:1_999_700},
      witness:{sourceCount:2}
    },
    liquidationSnapshot:{
      availableAt:1_999_900,ready5m:true,ready15m:true,coverageMs:1_000_000,lastMessageAt:1_999_850,bufferedEvents:3,
      window5m:{totalUsd:1000,imbalance:.2,longShare:.6,largestShare:.5,count:2},
      window15m:{totalUsd:2000,imbalance:.1}
    },
    onchainSnapshot:{
      ok:true,availableAt:1_999_900,chain:'ETHEREUM',source:'ETHEREUM_PUBLIC_RPC',
      metrics:{blockNumber:100,blockTimestampMs:1_999_700,gasUtilization:.5,baseFeeGwei:2,gasPriceGwei:3,txCount:10,largeNativeTransferEth:100,largeNativeTransferCount:1}
    },
    entityFlowSnapshot:{
      ok:true,availableAt:1_999_900,finalizedBlockNumber:100,finalizedBlockTimestamp:1_999_700,addressCount:5000,entityCount:1,fingerprint:'abc',
      entities:{OKX:{
        '5m':{netExternalEth:10,grossExternalEth:20,inflowShare:.75,externalTxCount:4,largestExternalShare:.5,grossExternalRobustZ:2},
        '15m':{netExternalEth:12,grossExternalEth:30,inflowShare:.7,externalTxCount:6,largestExternalShare:.4,grossExternalRobustZ:1}
      }}
    }
  });
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map(x=>x.domain),['DERIVATIVES','LIQUIDATION','ONCHAIN','ENTITY_FLOW']);
  const entity=rows.find(x=>x.domain==='ENTITY_FLOW');
  assert.equal(entity.finality,'FINALIZED');
  assert.equal(entity.provenance.coverage,'BOUNDED_VERIFIED_ADDRESS_SAMPLE');
  assert.ok(entity.features.some(x=>x.id==='research.entityflow.eth.netExternal5m'));
});

test('weak or unavailable snapshots are omitted instead of fabricated',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    derivativesSnapshot:{ok:false,availableAt:1_999_900,witness:{sourceCount:0}},
    liquidationSnapshot:{availableAt:1_999_900,ready5m:false},
    onchainSnapshot:{ok:false,availableAt:1_999_900,chain:'BITCOIN'},
    entityFlowSnapshot:null,
    walletSnapshot:{ok:false,availableAt:1_999_900}
  });
  assert.deepEqual(rows,[]);
});

test('derivatives completeness records partial witness coverage',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    derivativesSnapshot:{
      ok:true,availableAt:1_999_900,
      binance:{fundingRate:.0001,publishedAt:1_999_800},
      okx:null,
      witness:{sourceCount:1}
    }
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].quality.completeness,.5);
  assert.equal(rows[0].quality.status,'PARTIAL_SOURCE');
});


test('external data hub snapshots enter the governed research plane',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    externalSnapshot:{
      coinMetrics:{
        ok:true,source:'COINMETRICS_COMMUNITY_V4',eventTime:1_900_000,availableAt:1_999_900,
        metrics:{activeAddresses:1000,previousActiveAddresses:900,newAddresses:200,txCount:500,mvrv:2.5,previousMvrv:2.4},
        provenance:{communityApi:true}
      },
      deribitOptions:{
        ok:true,source:'DERIBIT_PUBLIC_OPTIONS',eventTime:1_999_900,availableAt:1_999_900,
        metrics:{weightedIvPct:60,putCallOiRatio:.7,totalOpenInterest:1000,totalVolumeUsd:200000,putCallIvSkewPct:4}
      },
      macro:{
        ok:true,source:'FRED_REALTIME_V1',eventTime:1_999_900,availableAt:1_999_900,
        metrics:{fedFundsPct:5,us10yPct:4,broadDollarIndex:120,fedAssets:7000},
        quality:{completeness:1}
      },
      predictionMarket:{
        ok:true,source:'POLYMARKET_GAMMA_CONFIGURED',eventTime:1_999_900,availableAt:1_999_900,slug:'btc-test',
        metrics:{yesProbability:.63,liquidity:100000,volume24h:50000}
      }
    }
  });
  assert.deepEqual(rows.map(x=>x.domain),['NETWORK_METRICS','OPTIONS','MACRO','PREDICTION_MARKET']);
  assert.ok(rows.find(x=>x.domain==='NETWORK_METRICS').features.some(x=>x.id==='research.coinmetrics.mvrv'&&x.value===2.5));
  assert.ok(rows.find(x=>x.domain==='OPTIONS').features.some(x=>x.id==='research.options.putCallOiRatio'&&x.value===.7));
  assert.ok(rows.find(x=>x.domain==='MACRO').features.some(x=>x.id==='research.macro.us10yMinusFedFundsPct'&&x.value===-1));
  assert.ok(rows.find(x=>x.domain==='PREDICTION_MARKET').features.some(x=>x.id==='research.prediction.yesProbability'&&x.value===.63));
});


test('FRED CSV fallback preserves source lineage in the research plane',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    externalSnapshot:{
      macro:{
        ok:true,source:'FRED_GRAPH_CSV_CURRENT',eventTime:1_900_000,availableAt:1_999_900,
        metrics:{fedFundsPct:5,us10yPct:4,broadDollarIndex:120,fedAssets:7000},
        quality:{completeness:1},
        provenance:{transport:'FRED_GRAPH_CSV',historicalVintageGuarantee:false}
      }
    }
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].domain,'MACRO');
  assert.equal(rows[0].source,'FRED_GRAPH_CSV_CURRENT');
  assert.equal(rows[0].quality.status,'CURRENT_SERIES_CAPTURE');
});
