import { sha256 } from './institutional-kernel.mjs';

export const RESEARCH_FEATURE_CATALOG_VERSION='TCX_RESEARCH_FEATURE_CATALOG_V2';

const defs=[];

function define(id,domain,{
  unit='UNITLESS',
  transform='IDENTITY',
  min=null,
  max=null,
  description=''
}={}){
  defs.push(Object.freeze({id,schemaVersion:1,domain,valueType:'FINITE_NUMBER',unit,transform,naturalRange:Object.freeze({min,max}),description,researchOnly:true,canExecute:false}));
}

define('research.derivatives.fundingRate','DERIVATIVES',{unit:'RATE',min:-0.1,max:0.1,description:'Binance perpetual funding rate'});
define('research.derivatives.premiumPct','DERIVATIVES',{unit:'RATE',min:-0.5,max:0.5,description:'Mark/index premium'});
define('research.derivatives.openInterestUsd','DERIVATIVES',{unit:'USD',min:0,description:'Binance open interest notional'});
define('research.derivatives.openInterestDelta5m','DERIVATIVES',{unit:'RATE',min:-1,max:10,description:'5m open-interest change'});
define('research.derivatives.globalLongShortRatio','DERIVATIVES',{unit:'RATIO',min:0,max:100,description:'Global long/short account ratio'});
define('research.derivatives.takerBuySellRatio','DERIVATIVES',{unit:'RATIO',min:0,max:100,description:'Taker buy/sell volume ratio'});
define('research.derivatives.okxFundingRate','DERIVATIVES',{unit:'RATE',min:-0.1,max:0.1,description:'OKX perpetual funding rate'});
define('research.derivatives.okxOpenInterestUsd','DERIVATIVES',{unit:'USD',min:0,description:'OKX open interest notional'});
define('research.derivatives.fundingRateVenueSpread','DERIVATIVES',{unit:'RATE',min:-0.2,max:0.2,description:'Binance minus OKX funding spread'});
define('research.liquidation.logUsd5m','LIQUIDATION',{unit:'LOG_USD',min:0,description:'log1p liquidation notional over 5m'});
define('research.liquidation.imbalance5m','LIQUIDATION',{unit:'SIGNED_SHARE',min:-1,max:1,description:'Long vs short liquidation imbalance over 5m'});
define('research.liquidation.longShare5m','LIQUIDATION',{unit:'SHARE',min:0,max:1,description:'Share of liquidated long notional over 5m'});
define('research.liquidation.concentration5m','LIQUIDATION',{unit:'SHARE',min:0,max:1,description:'Largest liquidation share over 5m'});
define('research.liquidation.logCount5m','LIQUIDATION',{unit:'LOG_COUNT',min:0,description:'log1p liquidation count over 5m'});
define('research.liquidation.logUsd15m','LIQUIDATION',{unit:'LOG_USD',min:0,description:'log1p liquidation notional over 15m'});
define('research.liquidation.imbalance15m','LIQUIDATION',{unit:'SIGNED_SHARE',min:-1,max:1,description:'Long vs short liquidation imbalance over 15m'});
define('research.onchain.btc.mempoolLogCount','ONCHAIN',{unit:'LOG_COUNT',min:0});define('research.onchain.btc.mempoolLogVsize','ONCHAIN',{unit:'LOG_VBYTES',min:0});define('research.onchain.btc.fastestFeeSatVb','ONCHAIN',{unit:'SAT_VB',min:0,max:100000});define('research.onchain.btc.halfHourFeeSatVb','ONCHAIN',{unit:'SAT_VB',min:0,max:100000});define('research.onchain.eth.gasUtilization','ONCHAIN',{unit:'SHARE',min:0,max:1});define('research.onchain.eth.baseFeeGwei','ONCHAIN',{unit:'GWEI',min:0,max:1000000});define('research.onchain.eth.gasPriceGwei','ONCHAIN',{unit:'GWEI',min:0,max:1000000});define('research.onchain.eth.txCountLog','ONCHAIN',{unit:'LOG_COUNT',min:0});define('research.onchain.eth.largeNativeTransferLogEth','ONCHAIN',{unit:'LOG_ETH',min:0});define('research.onchain.eth.largeNativeTransferCount','ONCHAIN',{unit:'COUNT',min:0});define('research.onchain.sol.tps','ONCHAIN',{unit:'TPS',min:0,max:1000000});define('research.onchain.sol.nonVoteTps','ONCHAIN',{unit:'TPS',min:0,max:1000000});define('research.onchain.sol.priorityFeeMedian','ONCHAIN',{unit:'MICROLAMPORT',min:0,max:1e15});define('research.onchain.sol.slotMs','ONCHAIN',{unit:'MILLISECONDS',min:1,max:60000});
define('research.coinmetrics.activeAddressesLog','NETWORK_METRICS',{unit:'LOG_COUNT',min:0});define('research.coinmetrics.activeAddressesChange1d','NETWORK_METRICS',{unit:'RATE',min:-1,max:100});define('research.coinmetrics.newAddressesLog','NETWORK_METRICS',{unit:'LOG_COUNT',min:0});define('research.coinmetrics.txCountLog','NETWORK_METRICS',{unit:'LOG_COUNT',min:0});define('research.coinmetrics.mvrv','NETWORK_METRICS',{unit:'RATIO',min:0,max:1000});define('research.coinmetrics.mvrvChange1d','NETWORK_METRICS',{unit:'RATE',min:-1,max:100});
define('research.options.weightedIvPct','OPTIONS',{unit:'PERCENT',min:0,max:5000});define('research.options.putCallOiRatio','OPTIONS',{unit:'RATIO',min:0,max:1000});define('research.options.openInterestLog','OPTIONS',{unit:'LOG_CONTRACTS',min:0});define('research.options.volumeUsdLog','OPTIONS',{unit:'LOG_USD',min:0});define('research.options.putCallIvSkewPct','OPTIONS',{unit:'PERCENTAGE_POINTS',min:-5000,max:5000});
define('research.macro.fedFundsPct','MACRO',{unit:'PERCENT',min:-20,max:100});define('research.macro.us10yPct','MACRO',{unit:'PERCENT',min:-20,max:100});define('research.macro.broadDollarIndex','MACRO',{unit:'INDEX',min:0,max:1000});define('research.macro.fedAssetsLog','MACRO',{unit:'LOG_LEVEL',min:0});define('research.macro.us10yMinusFedFundsPct','MACRO',{unit:'PERCENTAGE_POINTS',min:-100,max:100});define('research.macro.vix','MACRO',{unit:'INDEX',min:0,max:200});define('research.macro.sp500Log','MACRO',{unit:'LOG_LEVEL',min:0});define('research.macro.wtiUsd','MACRO',{unit:'USD_BARREL',min:-100,max:1000});define('research.macro.cpiIndex','MACRO',{unit:'INDEX',min:0,max:1000});define('research.macro.unemploymentPct','MACRO',{unit:'PERCENT',min:0,max:100});
define('research.prediction.yesProbability','PREDICTION_MARKET',{unit:'PROBABILITY',min:0,max:1});define('research.prediction.confidenceFromHalf','PREDICTION_MARKET',{unit:'SHARE',min:0,max:1});define('research.prediction.liquidityLog','PREDICTION_MARKET',{unit:'LOG_USD',min:0});define('research.prediction.volume24hLog','PREDICTION_MARKET',{unit:'LOG_USD',min:0});
define('research.sentiment.fearGreedLevel','SENTIMENT',{unit:'SHARE',min:0,max:1});define('research.sentiment.fearGreedCentered','SENTIMENT',{unit:'SIGNED_SHARE',min:-1,max:1});define('research.sentiment.fearGreedDelta','SENTIMENT',{unit:'RATE',min:-1,max:1});
define('research.marketContext.bitcoinDominancePct','MARKET_CONTEXT',{unit:'PERCENT',min:0,max:100});define('research.marketContext.totalMarketCapLog','MARKET_CONTEXT',{unit:'LOG_USD',min:0});define('research.marketContext.totalVolume24hLog','MARKET_CONTEXT',{unit:'LOG_USD',min:0});define('research.marketContext.volumeToCapRatio','MARKET_CONTEXT',{unit:'RATIO',min:0,max:100});define('research.marketContext.activeCryptocurrenciesLog','MARKET_CONTEXT',{unit:'LOG_COUNT',min:0});define('research.marketContext.activeMarketsLog','MARKET_CONTEXT',{unit:'LOG_COUNT',min:0});
for(const window of ['5m','15m']){define('research.entityflow.eth.netExternal'+window,'ENTITY_FLOW',{unit:'SIGNED_LOG_ETH'});define('research.entityflow.eth.grossExternal'+window,'ENTITY_FLOW',{unit:'LOG_ETH',min:0});define('research.entityflow.eth.inflowShare'+window,'ENTITY_FLOW',{unit:'SHARE',min:0,max:1});define('research.entityflow.eth.externalTxCount'+window,'ENTITY_FLOW',{unit:'LOG_COUNT',min:0});define('research.entityflow.eth.largestShare'+window,'ENTITY_FLOW',{unit:'SHARE',min:0,max:1});define('research.entityflow.eth.grossAnomaly'+window,'ENTITY_FLOW',{unit:'ROBUST_Z',min:-1000,max:1000});}
define('research.wallet.activity5m','WALLET_COHORT',{unit:'COUNT',min:0});define('research.wallet.activity15m','WALLET_COHORT',{unit:'COUNT',min:0});define('research.wallet.successRate15m','WALLET_COHORT',{unit:'SHARE',min:0,max:1});define('research.wallet.nativeNetFlowSignedLog','WALLET_COHORT',{unit:'SIGNED_LOG_NATIVE'});define('research.wallet.nativeGrossFlowLog','WALLET_COHORT',{unit:'LOG_NATIVE',min:0});

// Public channel news is intentionally research-only. These features describe
// evidence availability/quality and event class; they do not encode a bullish
// or bearish instruction.
define('research.news.present','NEWS_EVENT',{unit:'BINARY',min:0,max:1,description:'Relevant public news event is available point-in-time'});
define('research.news.familyCode','NEWS_EVENT',{unit:'CATEGORY_CODE',min:0,max:6,description:'Stable event-family code; not directional'});
define('research.news.impactPriority','NEWS_EVENT',{unit:'SHARE',min:0,max:1,description:'Headline triage priority, not causal impact'});
define('research.news.sourceReliability','NEWS_EVENT',{unit:'SHARE',min:0,max:1,description:'Configured source reliability prior'});
define('research.news.independentConfirmation','NEWS_EVENT',{unit:'SHARE',min:0,max:1,description:'Independent confirmation evidence available at ingestion'});
define('research.news.verified','NEWS_EVENT',{unit:'BINARY',min:0,max:1,description:'Verification state at ingestion'});
define('research.news.worldRelevant','NEWS_EVENT',{unit:'BINARY',min:0,max:1,description:'World/macro relevance flag'});
define('research.news.affectedAssetCount','NEWS_EVENT',{unit:'COUNT',min:0,max:32,description:'Number of tagged affected assets'});

const byId=new Map(defs.map(x=>[x.id,x]));
export const RESEARCH_FEATURE_CATALOG=Object.freeze([...defs]);
export function researchFeatureDefinition(id){return byId.get(String(id||''))||null;}
export function validateResearchFeatureRows(domain,rows){const expectedDomain=String(domain||'').toUpperCase();const errors=[],warnings=[],seen=new Set();for(const row of Array.isArray(rows)?rows:[]){const id=String(row?.id||''),value=Number(row?.value);if(seen.has(id)){errors.push({code:'DUPLICATE_FEATURE',id});continue;}seen.add(id);const def=researchFeatureDefinition(id);if(!def){errors.push({code:'UNREGISTERED_FEATURE',id});continue;}if(def.domain!==expectedDomain){errors.push({code:'FEATURE_DOMAIN_MISMATCH',id,expected:def.domain,actual:expectedDomain});continue;}if(!Number.isFinite(value)){errors.push({code:'NON_FINITE_FEATURE',id});continue;}const min=def.naturalRange.min,max=def.naturalRange.max;if(min!=null&&value<min)errors.push({code:'NATURAL_RANGE_LOW',id,value,min});if(max!=null&&value>max)errors.push({code:'NATURAL_RANGE_HIGH',id,value,max});}if(!Array.isArray(rows)||rows.length===0)errors.push({code:'EMPTY_FEATURE_SET'});return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),warnings:Object.freeze(warnings)});}
export function researchFeatureCatalogManifest(){const features=RESEARCH_FEATURE_CATALOG.map(x=>({id:x.id,schemaVersion:x.schemaVersion,domain:x.domain,valueType:x.valueType,unit:x.unit,transform:x.transform,naturalRange:x.naturalRange}));const core={version:RESEARCH_FEATURE_CATALOG_VERSION,featureCount:features.length,features};return Object.freeze({...core,fingerprint:sha256(core)});}
