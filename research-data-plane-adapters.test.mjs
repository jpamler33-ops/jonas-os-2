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
  assert.equal(rows.length,6);
  assert.deepEqual(rows.map(x=>x.domain),['DERIVATIVES','DERIVATIVES','DERIVATIVES','LIQUIDATION','ONCHAIN','ENTITY_FLOW']);
  assert.deepEqual(rows.filter(x=>x.domain==='DERIVATIVES').map(x=>x.source),[
    'BINANCE_USDM_PUBLIC','OKX_PUBLIC','BINANCE_OKX_DERIVED'
  ]);
  assert.equal(rows.find(x=>x.source==='BINANCE_USDM_PUBLIC').quality.completeness,1);
  assert.equal(rows.find(x=>x.source==='OKX_PUBLIC').quality.completeness,1);
  assert.equal(rows.find(x=>x.source==='BINANCE_OKX_DERIVED').quality.completeness,1);
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

test('derivatives venue isolation keeps healthy venue usable when peer venue is absent',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    derivativesSnapshot:{
      ok:true,availableAt:1_999_900,
      binance:{
        fundingRate:.0001,premiumPct:.001,openInterestUsd:1000,
        openInterestDelta5m:.01,globalLongShortRatio:1.1,takerBuySellRatio:1.2,
        publishedAt:1_999_800
      },
      okx:null,
      witness:{sourceCount:1}
    }
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].source,'BINANCE_USDM_PUBLIC');
  assert.equal(rows[0].quality.completeness,1);
  assert.equal(rows[0].quality.status,'BINANCE_PUBLIC_DERIVATIVES');
  assert.equal(rows.some(x=>x.source==='BINANCE_OKX_DERIVED'),false);
});

test('cross venue spread is emitted only when both venues contribute',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    derivativesSnapshot:{
      ok:true,availableAt:1_999_900,
      binance:{fundingRate:.0001,publishedAt:1_999_800},
      okx:{fundingRate:.0002,openInterestUsd:900,publishedAt:1_999_700},
      witness:{sourceCount:2}
    }
  });
  const spread=rows.find(x=>x.source==='BINANCE_OKX_DERIVED');
  assert.ok(spread);
  assert.deepEqual(spread.features.map(x=>x.id),['research.derivatives.fundingRateVenueSpread']);
  assert.deepEqual(spread.provenance.dependencies,[
    'DERIVATIVES:BINANCE_USDM_PUBLIC','DERIVATIVES:OKX_PUBLIC'
  ]);
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
  assert.deepEqual(rows.map(x=>x.domain),['NETWORK_METRICS','OPTIONS','MACRO','MACRO','MACRO','MACRO','MACRO','PREDICTION_MARKET']);
  assert.ok(rows.find(x=>x.domain==='NETWORK_METRICS').features.some(x=>x.id==='research.coinmetrics.mvrv'&&x.value===2.5));
  assert.ok(rows.find(x=>x.domain==='OPTIONS').features.some(x=>x.id==='research.options.putCallOiRatio'&&x.value===.7));
  assert.ok(rows.find(x=>x.source==='FRED_DFF_DGS10_DERIVED').features.some(x=>x.id==='research.macro.us10yMinusFedFundsPct'&&x.value===-1));
  assert.deepEqual(rows.find(x=>x.source==='FRED_DFF_DGS10_DERIVED').provenance.dependencies,[
    'MACRO:FRED_DFF_CURRENT','MACRO:FRED_DGS10_CURRENT'
  ]);
  assert.ok(rows.find(x=>x.domain==='PREDICTION_MARKET').features.some(x=>x.id==='research.prediction.yesProbability'&&x.value===.63));
});


test('FRED macro series are isolated by cadence and retain transport lineage',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    externalSnapshot:{
      macro:{
        ok:true,source:'FRED_GRAPH_CSV_CURRENT',eventTime:1_900_000,availableAt:1_999_900,
        metrics:{fedFundsPct:5,us10yPct:4,broadDollarIndex:120,fedAssets:7000},
        series:{
          DFF:{date:'2026-09-25'},
          DGS10:{date:'2026-09-25'},
          DTWEXBGS:{date:'2026-09-25'},
          WALCL:{date:'2026-09-24'}
        },
        quality:{completeness:1},
        provenance:{transport:'FRED_GRAPH_CSV',historicalVintageGuarantee:false}
      }
    }
  });
  assert.equal(rows.length,5);
  assert.deepEqual(rows.map(x=>x.source),[
    'FRED_DFF_CURRENT',
    'FRED_DGS10_CURRENT',
    'FRED_DTWEXBGS_CURRENT',
    'FRED_WALCL_CURRENT',
    'FRED_DFF_DGS10_DERIVED'
  ]);
  assert.ok(rows.every(x=>x.domain==='MACRO'&&x.quality.completeness===1));
  assert.ok(rows.every(x=>x.provenance.fredTransport==='FRED_GRAPH_CSV'));
  assert.equal(rows.find(x=>x.source==='FRED_WALCL_CURRENT').features[0].id,'research.macro.fedAssetsLog');
  assert.deepEqual(rows.find(x=>x.source==='FRED_DFF_DGS10_DERIVED').provenance.dependencies,[
    'MACRO:FRED_DFF_CURRENT','MACRO:FRED_DGS10_CURRENT'
  ]);
});


test('public market context enters the governed research plane',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    publicContextSnapshot:{
      capturedAt:1_999_900,
      sentiment:{
        value:69,delta:3,timestamp:1_900_000,
        source:'Alternative.me Fear & Greed Index',
        attributionRequired:true,
        epistemic:'MARKET_SENTIMENT_INDEX_NOT_FORECAST_PROBABILITY'
      },
      global:{
        bitcoinDominancePct:55.2,
        totalMarketCapUsd:1000000,
        totalVolume24hUsd:250000,
        activeCryptocurrencies:1000,
        activeMarkets:5000,
        lastUpdated:1_999_800,
        source:'Alternative.me Crypto API',
        epistemic:'GLOBAL_MARKET_SNAPSHOT_NOT_FORECAST_PROBABILITY'
      }
    }
  });
  assert.deepEqual(rows.map(x=>x.domain),['SENTIMENT','MARKET_CONTEXT']);
  const sentiment=rows[0];
  const market=rows[1];
  assert.equal(sentiment.source,'ALTERNATIVE_ME_FEAR_GREED');
  assert.equal(market.source,'ALTERNATIVE_ME_GLOBAL');
  assert.ok(sentiment.features.some(x=>x.id==='research.sentiment.fearGreedLevel'&&x.value===.69));
  assert.ok(market.features.some(x=>x.id==='research.marketContext.volumeToCapRatio'&&x.value===.25));
  assert.equal(sentiment.provenance.attributionRequired,true);
});


test('DefiLlama liquidity context enters the governed research plane',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    publicContextSnapshot:{
      capturedAt:1_999_900,
      defi:{
        totalTvlUsd:1000,
        chainCount:4,
        ethereumTvlUsd:600,
        solanaTvlUsd:250,
        bitcoinTvlUsd:50,
        top10TvlShare:1,
        source:'DefiLlama Public API',
        endpoint:'/v2/chains',
        epistemic:'CURRENT_DEFI_TVL_SNAPSHOT_NOT_FLOW_OR_FORECAST'
      }
    }
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].domain,'DEFI_CONTEXT');
  assert.equal(rows[0].source,'DEFILLAMA_PUBLIC_CHAINS');
  assert.equal(rows[0].quality.completeness,1);
  assert.equal(rows[0].eventTime,1_999_900);
  assert.equal(rows[0].provenance.timestampSemantics,'CAPTURE_TIME_CURRENT_SNAPSHOT');
  assert.ok(rows[0].features.some(x=>x.id==='research.defi.ethereumTvlShare'&&x.value===.6));
});

test('DEX Screener trending context enters the governed research plane',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'SOLUSDT',
    ingestedAt:2_000_000,
    dexContextSnapshot:{
      capturedAt:1_999_900,
      source:'DEXSCREENER_PUBLIC_API',
      epistemic:'TRENDING_META_ACTIVITY_NOT_SOCIAL_SENTIMENT_OR_FORECAST',
      rows:[
        {marketCap:1000,liquidity:100,volume:200,marketCapChange:{h1:10,h24:20}},
        {marketCap:3000,liquidity:300,volume:100,marketCapChange:{h1:-2,h24:4}}
      ]
    }
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].domain,'DEX_CONTEXT');
  assert.equal(rows[0].source,'DEXSCREENER_TRENDING_METAS');
  assert.equal(rows[0].quality.completeness,1);
  assert.equal(rows[0].eventTime,1_999_900);
  assert.equal(rows[0].provenance.timestampSemantics,'CAPTURE_TIME_CURRENT_SNAPSHOT');
  assert.ok(rows[0].features.some(x=>x.id==='research.dex.trendingTopLiquidityShare'&&x.value===.75));
});


test('DefiLlama stablecoin supply enters its own governed context',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'ETHUSDT',
    ingestedAt:2_000_000,
    publicContextSnapshot:{
      capturedAt:1_999_900,
      defi:{totalTvlUsd:500},
      stablecoins:{
        totalSupplyUsd:1000,
        chainCount:4,
        ethereumSupplyUsd:600,
        tronSupplyUsd:250,
        solanaSupplyUsd:100,
        baseSupplyUsd:50,
        top5SupplyShare:1,
        source:'DefiLlama Stablecoins Public API',
        endpoint:'/stablecoinchains',
        epistemic:'CURRENT_STABLECOIN_SUPPLY_SNAPSHOT_NOT_FLOW_OR_FORECAST'
      }
    }
  });
  const stable=rows.find(x=>x.domain==='STABLECOIN_CONTEXT');
  assert.ok(stable);
  assert.equal(stable.source,'DEFILLAMA_STABLECOIN_CHAINS');
  assert.equal(stable.quality.completeness,1);
  assert.equal(stable.eventTime,1_999_900);
  assert.equal(stable.provenance.timestampSemantics,'CAPTURE_TIME_CURRENT_SNAPSHOT');
  assert.ok(stable.features.some(x=>x.id==='research.stablecoin.ethereumSupplyShare'&&x.value===.6));
  assert.ok(stable.features.some(x=>x.id==='research.stablecoin.supplyToDefiTvlRatio'&&x.value===2));
});

test('DEX Screener promotion radar stays isolated from ordinary DEX context',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'SOLUSDT',
    ingestedAt:2_000_000,
    dexPromotionSnapshot:{
      capturedAt:1_999_900,
      source:'DEXSCREENER_PUBLIC_API',
      rows:[
        {chainId:'solana',boost:{amount:10,totalAmount:50},pair:{liquidityUsd:100,volumeH1:200,buysH1:8,sellsH1:2,priceChangeH1:10}},
        {chainId:'base',boost:{amount:5,totalAmount:20},pair:{liquidityUsd:300,volumeH1:100,buysH1:3,sellsH1:7,priceChangeH1:-2}}
      ]
    }
  });
  assert.equal(rows.length,1);
  const promo=rows[0];
  assert.equal(promo.domain,'DEX_PROMOTION_CONTEXT');
  assert.equal(promo.source,'DEXSCREENER_PROMOTION_RADAR');
  assert.equal(promo.provenance.promotionBiased,true);
  assert.equal(promo.provenance.causalClaim,false);
  assert.equal(promo.provenance.researchOnly,true);
  assert.ok(promo.features.some(x=>x.id==='research.dex.promotionTopLiquidityShare'&&x.value===.75));
});

test('adapter rejects null ingest time instead of converting it to epoch zero',()=>{
  assert.throws(()=>buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:null
  }),/ingestedAt must be finite/);
});


test('CFTC weekly positioning enters its own governed research domain',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    cftcCotSnapshot:{
      ok:true,
      source:'CFTC_TFF_FUTURES_ONLY',
      sourceEventId:'260929133741F',
      contractCode:'133741',
      contractMarketName:'BITCOIN',
      marketAndExchange:'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
      reportDate:1_500_000,
      reportWeek:'2026 Report Week 40',
      capturedAt:1_999_900,
      availableAt:1_999_900,
      openInterest:20000,
      changeOpenInterest:1000,
      dealer:{netShare:-.05,longShare:.05,shortShare:.1},
      assetManager:{netShare:.1,longShare:.2,shortShare:.1},
      leveragedMoney:{netShare:-.15,longShare:.25,shortShare:.4},
      nonreportable:{netShare:.025},
      top4LongConcentration:.45,
      top4ShortConcentration:.55,
      epistemic:'OFFICIAL_WEEKLY_POSITIONING_REPORT_NOT_LIVE_FLOW_OR_FORECAST'
    }
  });
  assert.equal(rows.length,1);
  const cot=rows[0];
  assert.equal(cot.domain,'CFTC_POSITIONING');
  assert.equal(cot.source,'CFTC_TFF_FUTURES_ONLY');
  assert.equal(cot.eventTime,1_500_000);
  assert.equal(cot.availableAt,1_999_900);
  assert.equal(cot.quality.completeness,1);
  assert.equal(cot.provenance.weeklyReport,true);
  assert.equal(cot.provenance.liveFlow,false);
  assert.equal(cot.provenance.directionalExecutionAuthority,false);
  assert.ok(cot.features.some(x=>x.id==='research.cftc.leveragedMoneyNetShare'&&x.value===-.15));
});


test('Treasury SEC and exchange primary context enter isolated governed domains',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'BTCUSDT',
    ingestedAt:2_000_000,
    officialPrimaryContextSnapshot:{
      treasury:{
        rows:[{
          ok:true,source:'US_TREASURY_FISCAL_DATA_AUCTIONS',sourceEventId:'91282TEST:2026-09-29',
          cusip:'91282TEST',securityType:'Note',securityTerm:'10-Year',
          auctionDate:1_500_000,recordDate:1_500_000,availableAt:1_999_900,
          bidToCoverRatio:2.5,clearingRatePct:4.1,totalAccepted:40e9,offeringAmount:40e9,
          primaryDealerAccepted:10e9,directBidderAccepted:5e9,indirectBidderAccepted:25e9
        }]
      },
      sec:{
        rows:[{
          ok:true,source:'SEC_EDGAR_SUBMISSIONS',sourceEventId:'0001-26-000001',
          ticker:'MSTR',cik:'0001050446',companyName:'Strategy Inc.',form:'8-K',
          eventTime:1_700_000,filingDate:1_600_000,availableAt:1_999_900,
          url:'https://www.sec.gov/test',affectedAssets:['BTC','RISK'],
          epistemic:'OFFICIAL_SEC_FILING_METADATA_NOT_CONTENT_INTERPRETATION_OR_FORECAST'
        }]
      },
      exchange:{
        ok:true,source:'COINBASE_KRAKEN_PUBLIC_CONTEXT',availableAt:1_999_900,capturedAt:1_999_900,
        coinbase:{incidentSeverity:0,unresolvedIncidents:0,productCount:500,addedMarkets:1,removedMarkets:0},
        kraken:{incidentSeverity:1/3,unresolvedIncidents:1,pairCount:300,addedMarkets:0,removedMarkets:0},
        assetCoverage:{BTC:2,ETH:2,SOL:2},
        endpoints:['https://status.coinbase.com/api/v2/summary.json'],
        errors:[],
        epistemic:'OFFICIAL_EXCHANGE_STATUS_AND_MARKET_UNIVERSE_NOT_PRICE_FORECAST'
      }
    }
  });
  assert.deepEqual(rows.map(x=>x.domain),['TREASURY_AUCTION','SEC_FILING','EXCHANGE_CONTEXT']);
  const treasury=rows[0],sec=rows[1],exchange=rows[2];
  assert.equal(treasury.source,'US_TREASURY_FISCAL_DATA_AUCTIONS');
  assert.equal(treasury.eventTime,1_500_000);
  assert.equal(treasury.provenance.directionalClaim,false);
  assert.ok(treasury.features.some(x=>x.id==='research.treasury.indirectBidderAcceptedShare'&&x.value===.625));
  assert.equal(sec.source,'SEC_EDGAR_SUBMISSIONS');
  assert.equal(sec.provenance.contentInterpreted,false);
  assert.ok(sec.features.some(x=>x.id==='research.sec.isCurrentReport'&&x.value===1));
  assert.equal(exchange.source,'COINBASE_KRAKEN_PUBLIC_CONTEXT');
  assert.equal(exchange.provenance.listingDeltaScope,'IN_PROCESS_OBSERVATION_WINDOW_ONLY');
  assert.equal(exchange.provenance.restartBackfill,false);
  assert.ok(exchange.features.some(x=>x.id==='research.exchange.krakenUnresolvedIncidentCount'&&x.value===1));
});

test('SEC filing is not fanned out to unrelated asset without broad CRYPTO tag',()=>{
  const rows=buildResearchDataPlaneSnapshots({
    symbol:'ETHUSDT',
    ingestedAt:2_000_000,
    officialPrimaryContextSnapshot:{
      sec:{rows:[{
        ok:true,source:'SEC_EDGAR_SUBMISSIONS',sourceEventId:'0001',
        ticker:'MSTR',form:'8-K',eventTime:1_700_000,availableAt:1_999_900,
        affectedAssets:['BTC','RISK']
      }]}
    }
  });
  assert.equal(rows.some(x=>x.domain==='SEC_FILING'),false);
});


test('issuer ETF holdings map only to the matching BTC or ETH research stream',()=>{
  const context={
    ok:true,
    rows:[
      {
        ok:true,source:'ISHARES_DIGITAL_ASSET_HOLDINGS',fundTicker:'IBIT',fundName:'iShares Bitcoin Trust ETF',
        assetTicker:'BTC',sourceEventId:'IBIT:2026-09-28',asOfDate:1_500_000,availableAt:1_999_900,
        assetQuantity:800000,assetQuantityChangeShare:.01,sharesOutstanding:1400000000,sharesOutstandingChangeShare:.02,
        assetMarketValueUsd:66000000000,cashUsd:20000,observationDayGap:1,
        deltaSemantics:'CONSECUTIVE_ISSUER_HOLDINGS_CHANGE_NOT_NET_FUND_FLOW'
      },
      {
        ok:true,source:'ISHARES_DIGITAL_ASSET_HOLDINGS',fundTicker:'ETHA',fundName:'iShares Ethereum Trust ETF',
        assetTicker:'ETH',sourceEventId:'ETHA:2026-09-28',asOfDate:1_500_000,availableAt:1_999_900,
        assetQuantity:4000000,assetQuantityChangeShare:.03,sharesOutstanding:500000000,sharesOutstandingChangeShare:.04,
        assetMarketValueUsd:16000000000,cashUsd:10000,observationDayGap:1,
        deltaSemantics:'CONSECUTIVE_ISSUER_HOLDINGS_CHANGE_NOT_NET_FUND_FLOW'
      }
    ]
  };
  const btc=buildResearchDataPlaneSnapshots({symbol:'BTCUSDT',ingestedAt:2_000_000,issuerEtfContextSnapshot:context});
  const eth=buildResearchDataPlaneSnapshots({symbol:'ETHUSDT',ingestedAt:2_000_000,issuerEtfContextSnapshot:context});
  const sol=buildResearchDataPlaneSnapshots({symbol:'SOLUSDT',ingestedAt:2_000_000,issuerEtfContextSnapshot:context});
  assert.equal(btc.length,1);
  assert.equal(eth.length,1);
  assert.equal(sol.length,0);
  assert.equal(btc[0].domain,'ETF_HOLDINGS');
  assert.equal(btc[0].provenance.fundTicker,'IBIT');
  assert.equal(eth[0].provenance.fundTicker,'ETHA');
  assert.equal(btc[0].provenance.netFundFlowClaim,false);
  assert.ok(btc[0].features.some(x=>x.id==='research.etf.assetQuantityChangeShare'&&x.value===.01));
});
