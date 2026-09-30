import { sha256 } from './institutional-kernel.mjs';

export const RESEARCH_FEATURE_CATALOG_VERSION='TCX_RESEARCH_FEATURE_CATALOG_V1';

const defs=[];

function define(id,domain,{
  unit='UNITLESS',
  transform='IDENTITY',
  min=null,
  max=null,
  description=''
}={}){
  defs.push(Object.freeze({
    id,
    schemaVersion:1,
    domain,
    valueType:'FINITE_NUMBER',
    unit,
    transform,
    naturalRange:Object.freeze({min,max}),
    description,
    researchOnly:true,
    canExecute:false
  }));
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

define('research.onchain.btc.mempoolLogCount','ONCHAIN',{unit:'LOG_COUNT',min:0,description:'log1p Bitcoin mempool transaction count'});
define('research.onchain.btc.mempoolLogVsize','ONCHAIN',{unit:'LOG_VBYTES',min:0,description:'log1p Bitcoin mempool virtual size'});
define('research.onchain.btc.fastestFeeSatVb','ONCHAIN',{unit:'SAT_VB',min:0,max:100000,description:'Bitcoin fastest recommended fee'});
define('research.onchain.btc.halfHourFeeSatVb','ONCHAIN',{unit:'SAT_VB',min:0,max:100000,description:'Bitcoin half-hour recommended fee'});
define('research.onchain.eth.gasUtilization','ONCHAIN',{unit:'SHARE',min:0,max:1,description:'Ethereum finalized/current block gas utilization'});
define('research.onchain.eth.baseFeeGwei','ONCHAIN',{unit:'GWEI',min:0,max:1000000,description:'Ethereum base fee'});
define('research.onchain.eth.gasPriceGwei','ONCHAIN',{unit:'GWEI',min:0,max:1000000,description:'Ethereum gas price'});
define('research.onchain.eth.txCountLog','ONCHAIN',{unit:'LOG_COUNT',min:0,description:'log1p Ethereum block transaction count'});
define('research.onchain.eth.largeNativeTransferLogEth','ONCHAIN',{unit:'LOG_ETH',min:0,description:'log1p native ETH transferred in >=100 ETH transactions'});
define('research.onchain.eth.largeNativeTransferCount','ONCHAIN',{unit:'COUNT',min:0,description:'Count of >=100 ETH native transfers'});
define('research.onchain.sol.tps','ONCHAIN',{unit:'TPS',min:0,max:1000000,description:'Solana recent transactions per second'});
define('research.onchain.sol.nonVoteTps','ONCHAIN',{unit:'TPS',min:0,max:1000000,description:'Solana non-vote transactions per second'});
define('research.onchain.sol.priorityFeeMedian','ONCHAIN',{unit:'MICROLAMPORT',min:0,max:1e15,description:'Solana median prioritization fee'});
define('research.onchain.sol.slotMs','ONCHAIN',{unit:'MILLISECONDS',min:1,max:60000,description:'Solana average slot duration'});


define('research.coinmetrics.activeAddressesLog','NETWORK_METRICS',{unit:'LOG_COUNT',min:0,description:'log1p Coin Metrics active address count'});
define('research.coinmetrics.activeAddressesChange1d','NETWORK_METRICS',{unit:'RATE',min:-1,max:100,description:'1d relative change in active addresses'});
define('research.coinmetrics.newAddressesLog','NETWORK_METRICS',{unit:'LOG_COUNT',min:0,description:'log1p Coin Metrics new address count'});
define('research.coinmetrics.txCountLog','NETWORK_METRICS',{unit:'LOG_COUNT',min:0,description:'log1p Coin Metrics transaction count'});
define('research.coinmetrics.mvrv','NETWORK_METRICS',{unit:'RATIO',min:0,max:1000,description:'Coin Metrics current MVRV'});
define('research.coinmetrics.mvrvChange1d','NETWORK_METRICS',{unit:'RATE',min:-1,max:100,description:'1d relative change in Coin Metrics MVRV'});

define('research.options.weightedIvPct','OPTIONS',{unit:'PERCENT',min:0,max:5000,description:'Deribit option open-interest-weighted mark IV'});
define('research.options.putCallOiRatio','OPTIONS',{unit:'RATIO',min:0,max:1000,description:'Deribit put/call open-interest ratio'});
define('research.options.openInterestLog','OPTIONS',{unit:'LOG_CONTRACTS',min:0,description:'log1p total Deribit option open interest'});
define('research.options.volumeUsdLog','OPTIONS',{unit:'LOG_USD',min:0,description:'log1p Deribit option USD volume'});
define('research.options.putCallIvSkewPct','OPTIONS',{unit:'PERCENTAGE_POINTS',min:-5000,max:5000,description:'Deribit put IV minus call IV'});

define('research.macro.fedFundsPct','MACRO',{unit:'PERCENT',min:-20,max:100,description:'FRED effective federal funds rate'});
define('research.macro.us10yPct','MACRO',{unit:'PERCENT',min:-20,max:100,description:'FRED US 10-year Treasury yield'});
define('research.macro.broadDollarIndex','MACRO',{unit:'INDEX',min:0,max:1000,description:'FRED broad trade-weighted US dollar index'});
define('research.macro.fedAssetsLog','MACRO',{unit:'LOG_LEVEL',min:0,description:'log1p Federal Reserve total assets'});
define('research.macro.us10yMinusFedFundsPct','MACRO',{unit:'PERCENTAGE_POINTS',min:-100,max:100,description:'US 10-year yield minus effective Fed Funds'});
define('research.macro.vix','MACRO',{unit:'INDEX',min:0,max:200,description:'FRED CBOE VIX close'});
define('research.macro.sp500Log','MACRO',{unit:'LOG_LEVEL',min:0,description:'log1p FRED S&P 500 level'});
define('research.macro.wtiUsd','MACRO',{unit:'USD_BARREL',min:-100,max:1000,description:'FRED WTI crude oil spot price'});
define('research.macro.cpiIndex','MACRO',{unit:'INDEX',min:0,max:1000,description:'FRED US CPI all urban consumers index'});
define('research.macro.unemploymentPct','MACRO',{unit:'PERCENT',min:0,max:100,description:'FRED US unemployment rate'});

define('research.prediction.yesProbability','PREDICTION_MARKET',{unit:'PROBABILITY',min:0,max:1,description:'Configured Polymarket YES probability'});
define('research.prediction.confidenceFromHalf','PREDICTION_MARKET',{unit:'SHARE',min:0,max:1,description:'Distance of configured market probability from 50 percent'});
define('research.prediction.liquidityLog','PREDICTION_MARKET',{unit:'LOG_USD',min:0,description:'log1p configured Polymarket liquidity'});
define('research.prediction.volume24hLog','PREDICTION_MARKET',{unit:'LOG_USD',min:0,description:'log1p configured Polymarket 24h volume'});

define('research.sentiment.fearGreedLevel','SENTIMENT',{unit:'SHARE',min:0,max:1,description:'Alternative.me Fear & Greed index normalized to 0..1'});
define('research.sentiment.fearGreedCentered','SENTIMENT',{unit:'SIGNED_SHARE',min:-1,max:1,description:'Alternative.me Fear & Greed centered around neutral 50'});
define('research.sentiment.fearGreedDelta','SENTIMENT',{unit:'RATE',min:-1,max:1,description:'Change in Alternative.me Fear & Greed versus prior observation normalized by 100'});

define('research.marketContext.bitcoinDominancePct','MARKET_CONTEXT',{unit:'PERCENT',min:0,max:100,description:'Alternative.me Bitcoin share of global crypto market cap'});
define('research.marketContext.totalMarketCapLog','MARKET_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p global crypto market capitalization'});
define('research.marketContext.totalVolume24hLog','MARKET_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p global crypto 24h volume'});
define('research.marketContext.volumeToCapRatio','MARKET_CONTEXT',{unit:'RATIO',min:0,max:100,description:'Global crypto 24h volume divided by market cap'});
define('research.marketContext.activeCryptocurrenciesLog','MARKET_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p active crypto assets'});
define('research.marketContext.activeMarketsLog','MARKET_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p active crypto markets'});

define('research.dex.boostedPairCount','DEX_ACTIVITY',{unit:'COUNT',min:0,max:20,description:'Count of boosted DEX pairs represented in the public learning context'});
define('research.dex.boostedLiquidityLog','DEX_ACTIVITY',{unit:'LOG_USD',min:0,description:'log1p aggregate visible liquidity across boosted DEX pairs'});
define('research.dex.boostedVolumeH1Log','DEX_ACTIVITY',{unit:'LOG_USD',min:0,description:'log1p aggregate 1h volume across boosted DEX pairs'});
define('research.dex.boostedBuySellImbalanceH1','DEX_ACTIVITY',{unit:'SIGNED_SHARE',min:-1,max:1,description:'1h buy minus sell transaction imbalance across boosted DEX pairs'});
define('research.dex.trendingMetaLiquidityLog','DEX_ACTIVITY',{unit:'LOG_USD',min:0,description:'log1p aggregate liquidity across DEX Screener trending metas'});
define('research.dex.trendingMetaVolumeLog','DEX_ACTIVITY',{unit:'LOG_USD',min:0,description:'log1p aggregate volume across DEX Screener trending metas'});
define('research.dex.trendingMetaTokenCountLog','DEX_ACTIVITY',{unit:'LOG_COUNT',min:0,description:'log1p token breadth across DEX Screener trending metas'});

define('research.defi.totalTvlLog','DEFI_LIQUIDITY',{unit:'LOG_USD',min:0,description:'log1p aggregate DeFi TVL across DefiLlama chains'});
define('research.defi.chainTvlLog','DEFI_LIQUIDITY',{unit:'LOG_USD',min:0,description:'log1p mapped chain DeFi TVL from DefiLlama'});
define('research.defi.chainTvlShare','DEFI_LIQUIDITY',{unit:'SHARE',min:0,max:1,description:'Mapped chain share of aggregate DefiLlama DeFi TVL'});
define('research.defi.totalStablecoinSupplyLog','DEFI_LIQUIDITY',{unit:'LOG_USD',min:0,description:'log1p aggregate stablecoin supply across DefiLlama chains'});
define('research.defi.chainStablecoinSupplyLog','DEFI_LIQUIDITY',{unit:'LOG_USD',min:0,description:'log1p mapped chain stablecoin supply from DefiLlama'});
define('research.defi.chainStablecoinToTvlRatio','DEFI_LIQUIDITY',{unit:'RATIO',min:0,max:1000,description:'Mapped chain stablecoin supply divided by DeFi TVL'});

for(const window of ['5m','15m']){
  define('research.entityflow.eth.netExternal'+window,'ENTITY_FLOW',{unit:'SIGNED_LOG_ETH',description:'Signed log1p verified entity external net flow'});
  define('research.entityflow.eth.grossExternal'+window,'ENTITY_FLOW',{unit:'LOG_ETH',min:0,description:'log1p verified entity gross external flow'});
  define('research.entityflow.eth.inflowShare'+window,'ENTITY_FLOW',{unit:'SHARE',min:0,max:1,description:'Verified entity inflow share'});
  define('research.entityflow.eth.externalTxCount'+window,'ENTITY_FLOW',{unit:'LOG_COUNT',min:0,description:'log1p verified entity external transaction count'});
  define('research.entityflow.eth.largestShare'+window,'ENTITY_FLOW',{unit:'SHARE',min:0,max:1,description:'Largest verified entity external transfer share'});
  define('research.entityflow.eth.grossAnomaly'+window,'ENTITY_FLOW',{unit:'ROBUST_Z',min:-1000,max:1000,description:'Robust historical anomaly of verified entity gross flow'});
}

define('research.wallet.activity5m','WALLET_COHORT',{unit:'COUNT',min:0,description:'Configured public wallet cohort activity over 5m'});
define('research.wallet.activity15m','WALLET_COHORT',{unit:'COUNT',min:0,description:'Configured public wallet cohort activity over 15m'});
define('research.wallet.successRate15m','WALLET_COHORT',{unit:'SHARE',min:0,max:1,description:'Configured public wallet cohort success share over 15m'});
define('research.wallet.nativeNetFlowSignedLog','WALLET_COHORT',{unit:'SIGNED_LOG_NATIVE',description:'Signed log1p native net flow for configured cohort'});
define('research.wallet.nativeGrossFlowLog','WALLET_COHORT',{unit:'LOG_NATIVE',min:0,description:'log1p native gross flow for configured cohort'});

const byId=new Map(defs.map(x=>[x.id,x]));

export const RESEARCH_FEATURE_CATALOG=Object.freeze([...defs]);

export function researchFeatureDefinition(id){
  return byId.get(String(id||''))||null;
}

export function validateResearchFeatureRows(domain,rows){
  const expectedDomain=String(domain||'').toUpperCase();
  const errors=[];
  const warnings=[];
  const seen=new Set();
  for(const row of Array.isArray(rows)?rows:[]){
    const id=String(row?.id||'');
    const value=Number(row?.value);
    if(seen.has(id)){
      errors.push({code:'DUPLICATE_FEATURE',id});
      continue;
    }
    seen.add(id);
    const def=researchFeatureDefinition(id);
    if(!def){
      errors.push({code:'UNREGISTERED_FEATURE',id});
      continue;
    }
    if(def.domain!==expectedDomain){
      errors.push({code:'FEATURE_DOMAIN_MISMATCH',id,expected:def.domain,actual:expectedDomain});
      continue;
    }
    if(!Number.isFinite(value)){
      errors.push({code:'NON_FINITE_FEATURE',id});
      continue;
    }
    const min=def.naturalRange.min;
    const max=def.naturalRange.max;
    if(min!=null&&value<min) errors.push({code:'NATURAL_RANGE_LOW',id,value,min});
    if(max!=null&&value>max) errors.push({code:'NATURAL_RANGE_HIGH',id,value,max});
  }
  if(!Array.isArray(rows)||rows.length===0) errors.push({code:'EMPTY_FEATURE_SET'});
  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    warnings:Object.freeze(warnings)
  });
}

export function researchFeatureCatalogManifest(){
  const features=RESEARCH_FEATURE_CATALOG.map(x=>({
    id:x.id,
    schemaVersion:x.schemaVersion,
    domain:x.domain,
    valueType:x.valueType,
    unit:x.unit,
    transform:x.transform,
    naturalRange:x.naturalRange
  }));
  const core={
    version:RESEARCH_FEATURE_CATALOG_VERSION,
    featureCount:features.length,
    features
  };
  return Object.freeze({...core,fingerprint:sha256(core)});
}
