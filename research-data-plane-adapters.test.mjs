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
