import { sha256 } from './institutional-kernel.mjs';
import { createResearchFeatureSnapshot } from './research-data-plane.mjs';
import {
  derivativesSnapshotToExtraFeatures,
  DERIVATIVES_PUBLIC_PROVIDER_VERSION
} from './expansion-runtime/derivatives-public-provider.mjs';
import {
  liquidationSnapshotToExtraFeatures,
  LIQUIDATION_PUBLIC_STREAM_VERSION
} from './expansion-runtime/liquidation-public-stream.mjs';
import {
  onchainSnapshotToExtraFeatures,
  ONCHAIN_RESEARCH_PROVIDER_VERSION
} from './expansion-runtime/onchain-research-provider.mjs';
import {
  walletCohortSnapshotToExtraFeatures,
  WALLET_COHORT_PUBLIC_PROVIDER_VERSION
} from './expansion-runtime/wallet-cohort-public-provider.mjs';
import {
  entityFlowSnapshotToExtraFeatures,
  ENTITY_FLOW_ENGINE_VERSION
} from './expansion-runtime/entity-flow-engine.mjs';
import {
  coinMetricsSnapshotToExtraFeatures,
  deribitOptionsSnapshotToExtraFeatures,
  macroSnapshotToExtraFeatures,
  predictionMarketSnapshotToExtraFeatures,
  EXTERNAL_RESEARCH_PROVIDER_VERSION
} from './expansion-runtime/external-research-provider.mjs';
import {
  publicMarketContextToExtraFeatures,
  PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION
} from './expansion-runtime/public-market-context-provider.mjs';
import {
  dexScreenerTrendingMetasToExtraFeatures,
  DEXSCREENER_PUBLIC_PROVIDER_VERSION
} from './expansion-runtime/dexscreener-public-provider.mjs';

export const RESEARCH_DATA_PLANE_ADAPTER_VERSION='TCX_RESEARCH_DATA_PLANE_ADAPTER_V5';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function eventTimeOrAvailable(candidate,availableAt){
  const c=finite(candidate);
  const a=finite(availableAt);
  if(a==null) return null;
  return c!=null&&c<=a+5000?c:a;
}
function makeSourceEventId(parts){
  return sha256(parts);
}

const BINANCE_DERIVATIVE_FEATURES=new Set([
  'research.derivatives.fundingRate',
  'research.derivatives.premiumPct',
  'research.derivatives.openInterestUsd',
  'research.derivatives.openInterestDelta5m',
  'research.derivatives.globalLongShortRatio',
  'research.derivatives.takerBuySellRatio'
]);
const OKX_DERIVATIVE_FEATURES=new Set([
  'research.derivatives.okxFundingRate',
  'research.derivatives.okxOpenInterestUsd'
]);
const CROSS_VENUE_DERIVATIVE_FEATURES=new Set([
  'research.derivatives.fundingRateVenueSpread'
]);

function derivativeVenueInput({
  symbol,
  ingestedAt,
  availableAt,
  source,
  publishedAt,
  features,
  expectedFeatureCount,
  status,
  provenance={}
}={}){
  if(!Array.isArray(features)||!features.length) return null;
  const completeness=Math.max(0,Math.min(1,features.length/Math.max(1,Number(expectedFeatureCount)||features.length)));
  return createResearchFeatureSnapshot({
    streamKey:symbol,
    domain:'DERIVATIVES',
    source,
    sourceVersion:DERIVATIVES_PUBLIC_PROVIDER_VERSION,
    sourceEventId:makeSourceEventId({
      symbol,source,availableAt,publishedAt,
      features:features.map(x=>[x.id,x.value])
    }),
    eventTime:eventTimeOrAvailable(publishedAt,availableAt),
    availableAt,
    ingestedAt,
    ttlMs:10*60_000,
    finality:'OBSERVED',
    quality:{
      completeness,
      sourceCount:1,
      expectedSourceCount:1,
      status
    },
    features,
    provenance:{
      adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
      providerVersion:DERIVATIVES_PUBLIC_PROVIDER_VERSION,
      venueIsolated:true,
      researchOnly:true,
      ...provenance
    }
  });
}

function derivativesInputs(symbol,snapshot,ingestedAt){
  const availableAt=finite(snapshot?.availableAt);
  if(availableAt==null) return [];
  const all=derivativesSnapshotToExtraFeatures(snapshot);
  if(!all.length) return [];

  const binanceFeatures=all.filter(x=>BINANCE_DERIVATIVE_FEATURES.has(x.id));
  const okxFeatures=all.filter(x=>OKX_DERIVATIVE_FEATURES.has(x.id));
  const crossFeatures=all.filter(x=>CROSS_VENUE_DERIVATIVE_FEATURES.has(x.id));

  const rows=[
    snapshot?.binance?derivativeVenueInput({
      symbol,ingestedAt,availableAt,
      source:'BINANCE_USDM_PUBLIC',
      publishedAt:snapshot.binance.publishedAt,
      features:binanceFeatures,
      expectedFeatureCount:BINANCE_DERIVATIVE_FEATURES.size,
      status:'BINANCE_PUBLIC_DERIVATIVES',
      provenance:{venue:'BINANCE',upstreamSource:String(snapshot.binance.source||'BINANCE_USDM_PUBLIC')}
    }):null,
    snapshot?.okx?derivativeVenueInput({
      symbol,ingestedAt,availableAt,
      source:'OKX_PUBLIC',
      publishedAt:snapshot.okx.publishedAt,
      features:okxFeatures,
      expectedFeatureCount:OKX_DERIVATIVE_FEATURES.size,
      status:'OKX_PUBLIC_DERIVATIVES',
      provenance:{venue:'OKX',upstreamSource:String(snapshot.okx.source||'OKX_PUBLIC')}
    }):null
  ];

  if(snapshot?.binance&&snapshot?.okx&&crossFeatures.length){
    rows.push(derivativeVenueInput({
      symbol,ingestedAt,availableAt,
      source:'BINANCE_OKX_DERIVED',
      publishedAt:Math.max(
        finite(snapshot.binance.publishedAt)||0,
        finite(snapshot.okx.publishedAt)||0
      )||availableAt,
      features:crossFeatures,
      expectedFeatureCount:CROSS_VENUE_DERIVATIVE_FEATURES.size,
      status:'CROSS_VENUE_DERIVED',
      provenance:{
        derived:true,
        dependencies:['DERIVATIVES:BINANCE_USDM_PUBLIC','DERIVATIVES:OKX_PUBLIC'],
        venuePair:['BINANCE','OKX']
      }
    }));
  }
  return rows.filter(Boolean);
}

function liquidationInput(symbol,snapshot,ingestedAt){
  const features=liquidationSnapshotToExtraFeatures(snapshot);
  if(!features.length) return null;
  const availableAt=finite(snapshot?.availableAt);
  if(availableAt==null) return null;
  return createResearchFeatureSnapshot({
    streamKey:symbol,
    domain:'LIQUIDATION',
    source:'BYBIT_PUBLIC_ALL_LIQUIDATION',
    sourceVersion:LIQUIDATION_PUBLIC_STREAM_VERSION,
    sourceEventId:makeSourceEventId({
      symbol,
      availableAt,
      lastMessageAt:snapshot?.lastMessageAt||null,
      coverageMs:snapshot?.coverageMs||0,
      features:features.map(x=>[x.id,x.value])
    }),
    eventTime:eventTimeOrAvailable(snapshot?.lastMessageAt,availableAt),
    availableAt,
    ingestedAt,
    ttlMs:10*60_000,
    finality:'OBSERVED',
    quality:{
      completeness:snapshot?.ready15m===true?1:.8,
      sourceCount:1,
      expectedSourceCount:1,
      status:snapshot?.ready15m===true?'FULL_15M_WINDOW':'FULL_5M_WINDOW'
    },
    features,
    provenance:{
      adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
      providerVersion:LIQUIDATION_PUBLIC_STREAM_VERSION,
      ready5m:snapshot?.ready5m===true,
      ready15m:snapshot?.ready15m===true,
      coverageMs:Number(snapshot?.coverageMs||0),
      bufferedEvents:Number(snapshot?.bufferedEvents||0),
      researchOnly:true
    }
  });
}

function onchainInput(symbol,snapshot,ingestedAt){
  const features=onchainSnapshotToExtraFeatures(snapshot);
  if(!features.length) return null;
  const availableAt=finite(snapshot?.availableAt);
  if(availableAt==null) return null;
  const chain=String(snapshot?.chain||'UNKNOWN');
  const chainEventTime=chain==='ETHEREUM'
    ?snapshot?.metrics?.blockTimestampMs
    :availableAt;
  return createResearchFeatureSnapshot({
    streamKey:symbol,
    domain:'ONCHAIN',
    source:String(snapshot?.source||chain+'_PUBLIC'),
    sourceVersion:ONCHAIN_RESEARCH_PROVIDER_VERSION,
    sourceEventId:makeSourceEventId({
      symbol,
      chain,
      availableAt,
      blockNumber:snapshot?.metrics?.blockNumber||null,
      blockHeight:snapshot?.metrics?.blockHeight||null,
      slot:snapshot?.metrics?.slot||null,
      features:features.map(x=>[x.id,x.value])
    }),
    eventTime:eventTimeOrAvailable(chainEventTime,availableAt),
    availableAt,
    ingestedAt,
    ttlMs:20*60_000,
    finality:'OBSERVED',
    quality:{
      completeness:1,
      sourceCount:1,
      expectedSourceCount:1,
      status:'SOURCE_RESPONSE_COMPLETE'
    },
    features,
    provenance:{
      adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
      providerVersion:ONCHAIN_RESEARCH_PROVIDER_VERSION,
      chain,
      source:String(snapshot?.source||'UNKNOWN'),
      researchOnly:true
    }
  });
}

function entityFlowInput(symbol,snapshot,ingestedAt){
  const features=entityFlowSnapshotToExtraFeatures(snapshot,{entityId:'OKX'});
  if(!features.length) return null;
  const availableAt=finite(snapshot?.availableAt);
  if(availableAt==null) return null;
  return createResearchFeatureSnapshot({
    streamKey:symbol,
    domain:'ENTITY_FLOW',
    source:'VERIFIED_ENTITY_FINALIZED_FLOW',
    sourceVersion:ENTITY_FLOW_ENGINE_VERSION,
    sourceEventId:makeSourceEventId({
      symbol,
      finalizedBlockNumber:snapshot?.finalizedBlockNumber||null,
      fingerprint:snapshot?.fingerprint||null
    }),
    eventTime:eventTimeOrAvailable(snapshot?.finalizedBlockTimestamp,availableAt),
    availableAt,
    ingestedAt,
    ttlMs:15*60_000,
    finality:'FINALIZED',
    quality:{
      completeness:1,
      sourceCount:1,
      expectedSourceCount:1,
      status:'FINALIZED_BOUNDED_ENTITY_SAMPLE'
    },
    features,
    provenance:{
      adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
      providerVersion:ENTITY_FLOW_ENGINE_VERSION,
      finalizedBlockNumber:Number(snapshot?.finalizedBlockNumber||0),
      addressCount:Number(snapshot?.addressCount||0),
      entityCount:Number(snapshot?.entityCount||0),
      coverage:'BOUNDED_VERIFIED_ADDRESS_SAMPLE',
      knownInternalTransfersExcludedFromExternalNet:true,
      knownInterEntityTransfersExcludedFromExternalNet:true,
      nativeAssetOnly:true,
      researchOnly:true
    }
  });
}

function externalInput({
  symbol,snapshot,ingestedAt,domain,source,features,ttlMs,finality='OBSERVED',qualityStatus='SOURCE_RESPONSE_COMPLETE',provenanceExtra={}
}={}){
  if(!snapshot?.ok||!Array.isArray(features)||!features.length) return null;
  const availableAt=finite(snapshot?.availableAt);
  if(availableAt==null) return null;
  const eventTime=eventTimeOrAvailable(snapshot?.eventTime,availableAt);
  const expected=Math.max(1,Number(features.expectedCount||features.length||1));
  const completeness=Math.max(0,Math.min(1,
    finite(snapshot?.quality?.completeness)??Math.min(1,features.length/expected)
  ));
  return createResearchFeatureSnapshot({
    streamKey:symbol,
    domain,
    source,
    sourceVersion:EXTERNAL_RESEARCH_PROVIDER_VERSION,
    sourceEventId:makeSourceEventId({
      symbol,domain,source,availableAt,eventTime,
      features:features.map(x=>[x.id,x.value]),
      fingerprint:snapshot?.fingerprint||null,
      slug:snapshot?.slug||null
    }),
    eventTime,
    availableAt,
    ingestedAt,
    ttlMs,
    finality,
    quality:{
      completeness,
      sourceCount:1,
      expectedSourceCount:1,
      status:qualityStatus
    },
    features,
    provenance:{
      adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
      providerVersion:EXTERNAL_RESEARCH_PROVIDER_VERSION,
      upstreamSource:String(snapshot?.source||source),
      upstreamProvenance:snapshot?.provenance||{},
      researchOnly:true,
      mayExecute:false,
      ...provenanceExtra
    }
  });
}

const FRED_FEATURE_GROUPS=Object.freeze([
  Object.freeze({source:'FRED_DFF_CURRENT',seriesIds:['DFF'],featureIds:['research.macro.fedFundsPct']}),
  Object.freeze({source:'FRED_DGS10_CURRENT',seriesIds:['DGS10'],featureIds:['research.macro.us10yPct']}),
  Object.freeze({source:'FRED_DTWEXBGS_CURRENT',seriesIds:['DTWEXBGS'],featureIds:['research.macro.broadDollarIndex']}),
  Object.freeze({source:'FRED_WALCL_CURRENT',seriesIds:['WALCL'],featureIds:['research.macro.fedAssetsLog']}),
  Object.freeze({source:'FRED_VIXCLS_CURRENT',seriesIds:['VIXCLS'],featureIds:['research.macro.vix']}),
  Object.freeze({source:'FRED_SP500_CURRENT',seriesIds:['SP500'],featureIds:['research.macro.sp500Log']}),
  Object.freeze({source:'FRED_DCOILWTICO_CURRENT',seriesIds:['DCOILWTICO'],featureIds:['research.macro.wtiUsd']}),
  Object.freeze({source:'FRED_CPIAUCSL_CURRENT',seriesIds:['CPIAUCSL'],featureIds:['research.macro.cpiIndex']}),
  Object.freeze({source:'FRED_UNRATE_CURRENT',seriesIds:['UNRATE'],featureIds:['research.macro.unemploymentPct']}),
  Object.freeze({
    source:'FRED_DFF_DGS10_DERIVED',
    seriesIds:['DFF','DGS10'],
    featureIds:['research.macro.us10yMinusFedFundsPct'],
    dependencies:['MACRO:FRED_DFF_CURRENT','MACRO:FRED_DGS10_CURRENT']
  })
]);

function fredSeriesEventTime(snapshot,seriesIds){
  const dates=(seriesIds||[])
    .map(id=>Date.parse(String(snapshot?.series?.[id]?.date||'')))
    .filter(Number.isFinite);
  if(dates.length) return Math.min(...dates);
  return eventTimeOrAvailable(snapshot?.eventTime,finite(snapshot?.availableAt));
}

function macroInputs(symbol,snapshot,ingestedAt){
  if(!snapshot?.ok) return [];
  const all=macroSnapshotToExtraFeatures(snapshot);
  if(!all.length) return [];
  const byId=new Map(all.map(x=>[x.id,x]));
  const transport=String(snapshot?.provenance?.transport||'UNKNOWN');
  const qualityStatus=snapshot?.provenance?.historicalVintageGuarantee===true?'CURRENT_VINTAGE_CAPTURE':'CURRENT_SERIES_CAPTURE';
  const rows=[];
  for(const group of FRED_FEATURE_GROUPS){
    const features=group.featureIds.map(id=>byId.get(id)).filter(Boolean);
    if(!features.length) continue;
    features.expectedCount=group.featureIds.length;
    const eventTime=fredSeriesEventTime(snapshot,group.seriesIds);
    const isolatedSnapshot={
      ...snapshot,
      eventTime,
      quality:{...(snapshot?.quality||{}),completeness:features.length/group.featureIds.length}
    };
    rows.push(externalInput({
      symbol,
      snapshot:isolatedSnapshot,
      ingestedAt,
      domain:'MACRO',
      source:group.source,
      features,
      ttlMs:6*60*60_000,
      qualityStatus,
      provenanceExtra:{
        fredTransport:transport,
        fredSeriesIds:Object.freeze([...group.seriesIds]),
        ...(group.dependencies?{
          derived:true,
          dependencies:Object.freeze([...group.dependencies])
        }:{})
      }
    }));
  }
  return rows.filter(Boolean);
}

function externalInputs(symbol,bundle,ingestedAt){
  if(!bundle) return [];
  const coinMetricsFeatures=coinMetricsSnapshotToExtraFeatures(bundle.coinMetrics);
  coinMetricsFeatures.expectedCount=6;
  const optionsFeatures=deribitOptionsSnapshotToExtraFeatures(bundle.deribitOptions);
  optionsFeatures.expectedCount=5;
  const predictionFeatures=predictionMarketSnapshotToExtraFeatures(bundle.predictionMarket);
  predictionFeatures.expectedCount=4;
  return [
    externalInput({
      symbol,snapshot:bundle.coinMetrics,ingestedAt,domain:'NETWORK_METRICS',source:'COINMETRICS_COMMUNITY_V4',
      features:coinMetricsFeatures,ttlMs:48*60*60_000,qualityStatus:'COMMUNITY_DAILY_METRICS'
    }),
    externalInput({
      symbol,snapshot:bundle.deribitOptions,ingestedAt,domain:'OPTIONS',source:'DERIBIT_PUBLIC_OPTIONS',
      features:optionsFeatures,ttlMs:10*60_000,qualityStatus:'PUBLIC_OPTIONS_SUMMARY'
    }),
    ...macroInputs(symbol,bundle.macro,ingestedAt),
    externalInput({
      symbol,snapshot:bundle.predictionMarket,ingestedAt,domain:'PREDICTION_MARKET',source:'POLYMARKET_GAMMA_CONFIGURED',
      features:predictionFeatures,ttlMs:10*60_000,qualityStatus:'CONFIGURED_MARKET_PROBABILITY'
    })
  ].filter(Boolean);
}

function publicContextInputs(symbol,context,ingestedAt){
  if(!context) return [];
  const all=publicMarketContextToExtraFeatures(context);
  if(!all.length) return [];
  const byId=new Map(all.map(x=>[x.id,x]));
  const rows=[];

  if(context?.sentiment){
    const features=[
      byId.get('research.sentiment.fearGreedLevel'),
      byId.get('research.sentiment.fearGreedCentered'),
      byId.get('research.sentiment.fearGreedDelta')
    ].filter(Boolean);
    if(features.length){
      const availableAt=finite(context?.capturedAt)??ingestedAt;
      const eventTime=eventTimeOrAvailable(context?.sentiment?.timestamp,availableAt);
      rows.push(createResearchFeatureSnapshot({
        streamKey:symbol,
        domain:'SENTIMENT',
        source:'ALTERNATIVE_ME_FEAR_GREED',
        sourceVersion:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
        sourceEventId:makeSourceEventId({symbol,source:'ALTERNATIVE_ME_FEAR_GREED',eventTime,features:features.map(x=>[x.id,x.value])}),
        eventTime,
        availableAt,
        ingestedAt,
        ttlMs:36*60*60_000,
        finality:'OBSERVED',
        quality:{
          completeness:features.length/3,
          sourceCount:1,
          expectedSourceCount:1,
          status:'PUBLIC_SENTIMENT_INDEX'
        },
        features,
        provenance:{
          adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
          providerVersion:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
          upstreamSource:String(context.sentiment.source||'Alternative.me Fear & Greed Index'),
          attributionRequired:context.sentiment.attributionRequired===true,
          epistemic:String(context.sentiment.epistemic||'MARKET_SENTIMENT_INDEX_NOT_FORECAST_PROBABILITY'),
          researchOnly:true
        }
      }));
    }
  }

  if(context?.global){
    const featureIds=[
      'research.marketContext.bitcoinDominancePct',
      'research.marketContext.totalMarketCapLog',
      'research.marketContext.totalVolume24hLog',
      'research.marketContext.volumeToCapRatio',
      'research.marketContext.activeCryptocurrenciesLog',
      'research.marketContext.activeMarketsLog'
    ];
    const features=featureIds.map(id=>byId.get(id)).filter(Boolean);
    if(features.length){
      const availableAt=finite(context?.capturedAt)??ingestedAt;
      const eventTime=eventTimeOrAvailable(context?.global?.lastUpdated,availableAt);
      rows.push(createResearchFeatureSnapshot({
        streamKey:symbol,
        domain:'MARKET_CONTEXT',
        source:'ALTERNATIVE_ME_GLOBAL',
        sourceVersion:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
        sourceEventId:makeSourceEventId({symbol,source:'ALTERNATIVE_ME_GLOBAL',eventTime,features:features.map(x=>[x.id,x.value])}),
        eventTime,
        availableAt,
        ingestedAt,
        ttlMs:30*60_000,
        finality:'OBSERVED',
        quality:{
          completeness:features.length/featureIds.length,
          sourceCount:1,
          expectedSourceCount:1,
          status:'PUBLIC_GLOBAL_CRYPTO_CONTEXT'
        },
        features,
        provenance:{
          adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
          providerVersion:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
          upstreamSource:String(context.global.source||'Alternative.me Crypto API'),
          epistemic:String(context.global.epistemic||'GLOBAL_MARKET_SNAPSHOT_NOT_FORECAST_PROBABILITY'),
          researchOnly:true
        }
      }));
    }
  }

  if(context?.defi){
    const featureIds=[
      'research.defi.totalTvlLog',
      'research.defi.chainCountLog',
      'research.defi.ethereumTvlShare',
      'research.defi.solanaTvlShare',
      'research.defi.bitcoinTvlShare',
      'research.defi.top10TvlShare'
    ];
    const features=featureIds.map(id=>byId.get(id)).filter(Boolean);
    if(features.length){
      const availableAt=finite(context?.capturedAt)??ingestedAt;
      const eventTime=availableAt;
      rows.push(createResearchFeatureSnapshot({
        streamKey:symbol,
        domain:'DEFI_CONTEXT',
        source:'DEFILLAMA_PUBLIC_CHAINS',
        sourceVersion:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
        sourceEventId:makeSourceEventId({symbol,source:'DEFILLAMA_PUBLIC_CHAINS',eventTime,features:features.map(x=>[x.id,x.value])}),
        eventTime,
        availableAt,
        ingestedAt,
        ttlMs:30*60_000,
        finality:'OBSERVED',
        quality:{
          completeness:features.length/featureIds.length,
          sourceCount:1,
          expectedSourceCount:1,
          status:'CURRENT_PUBLIC_DEFI_TVL_SNAPSHOT'
        },
        features,
        provenance:{
          adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
          providerVersion:PUBLIC_MARKET_CONTEXT_PROVIDER_VERSION,
          upstreamSource:String(context.defi.source||'DefiLlama Public API'),
          endpoint:String(context.defi.endpoint||'/v2/chains'),
          timestampSemantics:'CAPTURE_TIME_CURRENT_SNAPSHOT',
          epistemic:String(context.defi.epistemic||'CURRENT_DEFI_TVL_SNAPSHOT_NOT_FLOW_OR_FORECAST'),
          researchOnly:true
        }
      }));
    }
  }

  return rows.filter(Boolean);
}

function dexContextInput(symbol,snapshot,ingestedAt){
  const features=dexScreenerTrendingMetasToExtraFeatures(snapshot);
  if(!features.length) return null;
  const availableAt=finite(snapshot?.capturedAt)??ingestedAt;
  const eventTime=eventTimeOrAvailable(snapshot?.capturedAt,availableAt);
  return createResearchFeatureSnapshot({
    streamKey:symbol,
    domain:'DEX_CONTEXT',
    source:'DEXSCREENER_TRENDING_METAS',
    sourceVersion:DEXSCREENER_PUBLIC_PROVIDER_VERSION,
    sourceEventId:makeSourceEventId({symbol,source:'DEXSCREENER_TRENDING_METAS',eventTime,features:features.map(x=>[x.id,x.value])}),
    eventTime,
    availableAt,
    ingestedAt,
    ttlMs:10*60_000,
    finality:'OBSERVED',
    quality:{
      completeness:features.length/8,
      sourceCount:1,
      expectedSourceCount:1,
      status:'CURRENT_PUBLIC_DEX_TRENDING_SNAPSHOT'
    },
    features,
    provenance:{
      adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
      providerVersion:DEXSCREENER_PUBLIC_PROVIDER_VERSION,
      upstreamSource:String(snapshot?.source||'DEXSCREENER_PUBLIC_API'),
      timestampSemantics:'CAPTURE_TIME_CURRENT_SNAPSHOT',
      epistemic:String(snapshot?.epistemic||'TRENDING_META_ACTIVITY_NOT_SOCIAL_SENTIMENT_OR_FORECAST'),
      researchOnly:true
    }
  });
}

function walletInput(symbol,snapshot,ingestedAt){
  const features=walletCohortSnapshotToExtraFeatures(snapshot);
  if(!features.length) return null;
  const availableAt=finite(snapshot?.availableAt);
  if(availableAt==null) return null;
  return createResearchFeatureSnapshot({
    streamKey:symbol,
    domain:'WALLET_COHORT',
    source:'PUBLIC_WALLET_COHORT_RPC',
    sourceVersion:WALLET_COHORT_PUBLIC_PROVIDER_VERSION,
    sourceEventId:makeSourceEventId({
      symbol,
      availableAt,
      cohorts:snapshot?.cohorts||0,
      features:features.map(x=>[x.id,x.value])
    }),
    eventTime:availableAt,
    availableAt,
    ingestedAt,
    ttlMs:15*60_000,
    finality:'OBSERVED',
    quality:{
      completeness:1,
      sourceCount:Number(snapshot?.cohorts||0),
      expectedSourceCount:Number(snapshot?.cohorts||0),
      status:'CONFIGURED_PUBLIC_COHORTS'
    },
    features,
    provenance:{
      adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
      providerVersion:WALLET_COHORT_PUBLIC_PROVIDER_VERSION,
      cohorts:Number(snapshot?.cohorts||0),
      publicAddressesOnly:true,
      naturalPersonIdentity:false,
      researchOnly:true
    }
  });
}

export function buildResearchDataPlaneSnapshots({
  symbol,
  ingestedAt=Date.now(),
  derivativesSnapshot=null,
  liquidationSnapshot=null,
  onchainSnapshot=null,
  entityFlowSnapshot=null,
  walletSnapshot=null,
  externalSnapshot=null,
  publicContextSnapshot=null,
  dexContextSnapshot=null
}={}){
  const s=String(symbol||'').toUpperCase();
  const t=finite(ingestedAt);
  if(!/^[A-Z0-9]{2,18}USDT$/.test(s)) throw new Error('invalid research data plane symbol');
  if(t==null) throw new Error('ingestedAt must be finite');
  return [
    ...derivativesInputs(s,derivativesSnapshot,t),
    liquidationInput(s,liquidationSnapshot,t),
    onchainInput(s,onchainSnapshot,t),
    entityFlowInput(s,entityFlowSnapshot,t),
    walletInput(s,walletSnapshot,t),
    ...externalInputs(s,externalSnapshot,t),
    ...publicContextInputs(s,publicContextSnapshot,t),
    dexContextInput(s,dexContextSnapshot,t)
  ].filter(Boolean);
}
