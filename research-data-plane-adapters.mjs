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

export const RESEARCH_DATA_PLANE_ADAPTER_VERSION='TCX_RESEARCH_DATA_PLANE_ADAPTER_V1';

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

function derivativesInput(symbol,snapshot,ingestedAt){
  const features=derivativesSnapshotToExtraFeatures(snapshot);
  if(!features.length) return null;
  const availableAt=finite(snapshot?.availableAt);
  if(availableAt==null) return null;
  const publishedAt=Math.max(
    finite(snapshot?.binance?.publishedAt)||0,
    finite(snapshot?.okx?.publishedAt)||0
  )||availableAt;
  const sourceCount=Math.max(0,Number(snapshot?.witness?.sourceCount||0));
  return createResearchFeatureSnapshot({
    streamKey:symbol,
    domain:'DERIVATIVES',
    source:'BINANCE_OKX_PUBLIC_DERIVATIVES',
    sourceVersion:DERIVATIVES_PUBLIC_PROVIDER_VERSION,
    sourceEventId:makeSourceEventId({
      symbol,
      availableAt,
      binancePublishedAt:snapshot?.binance?.publishedAt||null,
      okxPublishedAt:snapshot?.okx?.publishedAt||null,
      features:features.map(x=>[x.id,x.value])
    }),
    eventTime:eventTimeOrAvailable(publishedAt,availableAt),
    availableAt,
    ingestedAt,
    ttlMs:10*60_000,
    finality:'OBSERVED',
    quality:{
      completeness:Math.max(0,Math.min(1,sourceCount/2)),
      sourceCount,
      expectedSourceCount:2,
      status:sourceCount>=2?'MULTI_SOURCE':'PARTIAL_SOURCE'
    },
    features,
    provenance:{
      adapterVersion:RESEARCH_DATA_PLANE_ADAPTER_VERSION,
      providerVersion:DERIVATIVES_PUBLIC_PROVIDER_VERSION,
      binancePresent:Boolean(snapshot?.binance),
      okxPresent:Boolean(snapshot?.okx),
      witnessSourceCount:sourceCount,
      researchOnly:true
    }
  });
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
  symbol,snapshot,ingestedAt,domain,source,features,ttlMs,finality='OBSERVED',qualityStatus='SOURCE_RESPONSE_COMPLETE'
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
      mayExecute:false
    }
  });
}

function externalInputs(symbol,bundle,ingestedAt){
  if(!bundle) return [];
  const coinMetricsFeatures=coinMetricsSnapshotToExtraFeatures(bundle.coinMetrics);
  coinMetricsFeatures.expectedCount=6;
  const optionsFeatures=deribitOptionsSnapshotToExtraFeatures(bundle.deribitOptions);
  optionsFeatures.expectedCount=5;
  const macroFeatures=macroSnapshotToExtraFeatures(bundle.macro);
  macroFeatures.expectedCount=5;
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
    externalInput({
      symbol,snapshot:bundle.macro,ingestedAt,domain:'MACRO',source:String(bundle.macro?.source||'FRED_REALTIME_V1'),
      features:macroFeatures,ttlMs:6*60*60_000,qualityStatus:bundle.macro?.provenance?.historicalVintageGuarantee===true?'CURRENT_VINTAGE_CAPTURE':'CURRENT_SERIES_CAPTURE'
    }),
    externalInput({
      symbol,snapshot:bundle.predictionMarket,ingestedAt,domain:'PREDICTION_MARKET',source:'POLYMARKET_GAMMA_CONFIGURED',
      features:predictionFeatures,ttlMs:10*60_000,qualityStatus:'CONFIGURED_MARKET_PROBABILITY'
    })
  ].filter(Boolean);
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
  externalSnapshot=null
}={}){
  const s=String(symbol||'').toUpperCase();
  const t=finite(ingestedAt);
  if(!/^[A-Z0-9]{2,18}USDT$/.test(s)) throw new Error('invalid research data plane symbol');
  if(t==null) throw new Error('ingestedAt must be finite');
  return [
    derivativesInput(s,derivativesSnapshot,t),
    liquidationInput(s,liquidationSnapshot,t),
    onchainInput(s,onchainSnapshot,t),
    entityFlowInput(s,entityFlowSnapshot,t),
    walletInput(s,walletSnapshot,t),
    ...externalInputs(s,externalSnapshot,t)
  ].filter(Boolean);
}
