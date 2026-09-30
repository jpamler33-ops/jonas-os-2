import { sha256 } from './institutional-kernel.mjs';

export const RESEARCH_FEATURE_CATALOG_VERSION='TCX_RESEARCH_FEATURE_CATALOG_V5';

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

define('research.defi.totalTvlLog','DEFI_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p aggregate DeFi TVL across DefiLlama chains'});
define('research.defi.chainCountLog','DEFI_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p number of chains with observable DefiLlama TVL'});
define('research.defi.ethereumTvlShare','DEFI_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Ethereum share of observed aggregate DeFi TVL'});
define('research.defi.solanaTvlShare','DEFI_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Solana share of observed aggregate DeFi TVL'});
define('research.defi.bitcoinTvlShare','DEFI_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Bitcoin share of observed aggregate DeFi TVL'});
define('research.defi.top10TvlShare','DEFI_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Top ten chains share of observed aggregate DeFi TVL'});

define('research.dex.trendingMetaCountLog','DEX_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p number of DEX Screener trending meta groups'});
define('research.dex.trendingMarketCapLog','DEX_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p aggregate market cap across trending meta groups'});
define('research.dex.trendingLiquidityLog','DEX_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p aggregate liquidity across trending meta groups'});
define('research.dex.trendingVolumeLog','DEX_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p aggregate volume across trending meta groups'});
define('research.dex.trendingVolumeLiquidityRatio','DEX_CONTEXT',{unit:'RATIO',min:0,description:'Aggregate trending DEX volume divided by aggregate liquidity'});
define('research.dex.trendingTopLiquidityShare','DEX_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Largest trending meta liquidity share'});
define('research.dex.trendingH1MedianPct','DEX_CONTEXT',{unit:'PERCENT',min:-100,max:1000000,description:'Median one-hour market-cap change across trending DEX metas'});
define('research.dex.trendingH24MedianPct','DEX_CONTEXT',{unit:'PERCENT',min:-100,max:1000000,description:'Median 24-hour market-cap change across trending DEX metas'});

define('research.stablecoin.totalSupplyLog','STABLECOIN_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p aggregate stablecoin supply observed across DefiLlama chains'});
define('research.stablecoin.chainCountLog','STABLECOIN_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p chains with observable stablecoin supply'});
define('research.stablecoin.ethereumSupplyShare','STABLECOIN_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Ethereum share of observed stablecoin supply'});
define('research.stablecoin.tronSupplyShare','STABLECOIN_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Tron share of observed stablecoin supply'});
define('research.stablecoin.solanaSupplyShare','STABLECOIN_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Solana share of observed stablecoin supply'});
define('research.stablecoin.baseSupplyShare','STABLECOIN_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Base share of observed stablecoin supply'});
define('research.stablecoin.top5SupplyShare','STABLECOIN_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Top five chains share of observed stablecoin supply'});
define('research.stablecoin.supplyToDefiTvlRatio','STABLECOIN_CONTEXT',{unit:'RATIO',min:0,max:1000,description:'Observed aggregate stablecoin supply divided by observed aggregate DeFi TVL'});

define('research.dex.promotionPairCountLog','DEX_PROMOTION_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p DEX Screener boosted-token pairs with observable market pairs'});
define('research.dex.promotionChainDiversityLog','DEX_PROMOTION_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p distinct chains represented by DEX Screener boosted-token radar'});
define('research.dex.promotionLiquidityLog','DEX_PROMOTION_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p aggregate liquidity across DEX Screener promoted-token radar pairs'});
define('research.dex.promotionVolumeH1Log','DEX_PROMOTION_CONTEXT',{unit:'LOG_USD',min:0,description:'log1p aggregate one-hour volume across DEX Screener promoted-token radar pairs'});
define('research.dex.promotionBuySellImbalanceH1','DEX_PROMOTION_CONTEXT',{unit:'SIGNED_SHARE',min:-1,max:1,description:'One-hour buy/sell transaction imbalance across observed promoted-token radar pairs'});
define('research.dex.promotionBoostAmountLog','DEX_PROMOTION_CONTEXT',{unit:'LOG_INDEX',min:0,description:'log1p aggregate current DEX Screener boost amount units; promotion signal, not USD'});
define('research.dex.promotionTotalBoostAmountLog','DEX_PROMOTION_CONTEXT',{unit:'LOG_INDEX',min:0,description:'log1p aggregate cumulative DEX Screener boost amount units; promotion signal, not USD'});
define('research.dex.promotionH1MedianPct','DEX_PROMOTION_CONTEXT',{unit:'PERCENT',min:-100,max:1000000,description:'Median one-hour price change across promoted-token radar pairs'});
define('research.dex.promotionTopLiquidityShare','DEX_PROMOTION_CONTEXT',{unit:'SHARE',min:0,max:1,description:'Largest pair share of observed promoted-token radar liquidity'});

define('research.news.present','NEWS_EVENT',{unit:'BINARY',min:1,max:1,description:'Observed relevant news event present at BIGGJ knowledge time'});
define('research.news.familyCode','NEWS_EVENT',{unit:'CATEGORY_CODE',min:0,max:6,description:'Non-directional event-family code'});
define('research.news.impactPriority','NEWS_EVENT',{unit:'HEURISTIC_PRIORITY',min:0,max:1,description:'Headline priority heuristic, not probability or expected return'});
define('research.news.independentConfirmation','NEWS_EVENT',{unit:'SHARE',min:0,max:1,description:'Observed independent-confirmation metadata from upstream event processing'});
define('research.news.contentVerified','NEWS_EVENT',{unit:'BINARY',min:0,max:1,description:'Whether event content is independently verified; official source origin alone does not set this'});
define('research.news.worldRelevant','NEWS_EVENT',{unit:'BINARY',min:0,max:1,description:'Broad world/macro relevance flag'});
define('research.news.affectedAssetCount','NEWS_EVENT',{unit:'COUNT',min:0,max:16,description:'Number of explicitly tagged affected assets or risk factors'});
define('research.news.primarySource','NEWS_EVENT',{unit:'BINARY',min:0,max:1,description:'Direct primary-source publication flag'});
define('research.news.sourceOriginVerified','NEWS_EVENT',{unit:'BINARY',min:0,max:1,description:'Verified direct source origin; not verification of substantive claims'});
define('research.news.sourceClassCode','NEWS_EVENT',{unit:'CATEGORY_CODE',min:0,max:2,description:'Source class code: unknown 0, discovery aggregator 1, official primary 2'});

define('research.cftc.openInterestLog','CFTC_POSITIONING',{unit:'LOG_CONTRACTS',min:0,description:'log1p open interest for the fixed CFTC crypto futures contract'});
define('research.cftc.openInterestChangeShare','CFTC_POSITIONING',{unit:'RATE',min:-20,max:20,description:'Weekly CFTC open-interest change divided by current open interest'});
define('research.cftc.dealerNetShare','CFTC_POSITIONING',{unit:'SIGNED_SHARE',min:-1,max:1,description:'Dealer long minus short positions divided by open interest'});
define('research.cftc.assetManagerNetShare','CFTC_POSITIONING',{unit:'SIGNED_SHARE',min:-1,max:1,description:'Asset-manager long minus short positions divided by open interest'});
define('research.cftc.leveragedMoneyNetShare','CFTC_POSITIONING',{unit:'SIGNED_SHARE',min:-1,max:1,description:'Leveraged-money long minus short positions divided by open interest'});
define('research.cftc.nonreportableNetShare','CFTC_POSITIONING',{unit:'SIGNED_SHARE',min:-1,max:1,description:'Nonreportable long minus short positions divided by open interest'});
define('research.cftc.assetManagerLongShare','CFTC_POSITIONING',{unit:'SHARE',min:0,max:1,description:'Asset-manager long positions as share of open interest'});
define('research.cftc.assetManagerShortShare','CFTC_POSITIONING',{unit:'SHARE',min:0,max:1,description:'Asset-manager short positions as share of open interest'});
define('research.cftc.leveragedMoneyLongShare','CFTC_POSITIONING',{unit:'SHARE',min:0,max:1,description:'Leveraged-money long positions as share of open interest'});
define('research.cftc.leveragedMoneyShortShare','CFTC_POSITIONING',{unit:'SHARE',min:0,max:1,description:'Leveraged-money short positions as share of open interest'});
define('research.cftc.top4LongConcentration','CFTC_POSITIONING',{unit:'SHARE',min:0,max:1,description:'Gross long share held by the four largest traders'});
define('research.cftc.top4ShortConcentration','CFTC_POSITIONING',{unit:'SHARE',min:0,max:1,description:'Gross short share held by the four largest traders'});

define('research.treasury.bidToCover','TREASURY_AUCTION',{unit:'RATIO',min:0,max:20,description:'Official U.S. Treasury auction bid-to-cover ratio'});
define('research.treasury.clearingRatePct','TREASURY_AUCTION',{unit:'PERCENT',min:-20,max:100,description:'Official auction high yield/investment/discount rate'});
define('research.treasury.totalAcceptedLogUsd','TREASURY_AUCTION',{unit:'LOG_USD',min:0,description:'log1p total accepted Treasury auction amount'});
define('research.treasury.primaryDealerAcceptedShare','TREASURY_AUCTION',{unit:'SHARE',min:0,max:1,description:'Primary-dealer accepted amount divided by total accepted'});
define('research.treasury.directBidderAcceptedShare','TREASURY_AUCTION',{unit:'SHARE',min:0,max:1,description:'Direct-bidder accepted amount divided by total accepted'});
define('research.treasury.indirectBidderAcceptedShare','TREASURY_AUCTION',{unit:'SHARE',min:0,max:1,description:'Indirect-bidder accepted amount divided by total accepted'});
define('research.treasury.offeringAcceptedRatio','TREASURY_AUCTION',{unit:'RATIO',min:0,max:5,description:'Total accepted amount divided by announced offering amount'});

define('research.sec.filingPresent','SEC_FILING',{unit:'BINARY',min:1,max:1,description:'Relevant official SEC filing observed'});
define('research.sec.formClassCode','SEC_FILING',{unit:'CATEGORY_CODE',min:0,max:4,description:'Form class only; no semantic interpretation of filing content'});
define('research.sec.isCurrentReport','SEC_FILING',{unit:'BINARY',min:0,max:1,description:'8-K/6-K current-report class flag'});
define('research.sec.isPeriodicReport','SEC_FILING',{unit:'BINARY',min:0,max:1,description:'10-Q/10-K/20-F periodic-report class flag'});
define('research.sec.isOfferingFiling','SEC_FILING',{unit:'BINARY',min:0,max:1,description:'S-1/S-3/424B offering-related filing class flag'});
define('research.sec.isOwnershipFiling','SEC_FILING',{unit:'BINARY',min:0,max:1,description:'Schedule 13D/13G ownership filing class flag'});

define('research.exchange.coinbaseIncidentSeverity','EXCHANGE_CONTEXT',{unit:'SEVERITY',min:0,max:1,description:'Coinbase official status-page incident severity'});
define('research.exchange.krakenIncidentSeverity','EXCHANGE_CONTEXT',{unit:'SEVERITY',min:0,max:1,description:'Kraken official status-page incident severity'});
define('research.exchange.coinbaseUnresolvedIncidentCount','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:1000,description:'Unresolved Coinbase status incidents'});
define('research.exchange.krakenUnresolvedIncidentCount','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:1000,description:'Unresolved Kraken status incidents'});
define('research.exchange.coinbaseProductCountLog','EXCHANGE_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p current Coinbase Exchange public product count'});
define('research.exchange.krakenPairCountLog','EXCHANGE_CONTEXT',{unit:'LOG_COUNT',min:0,description:'log1p current Kraken public pair count'});
define('research.exchange.coinbaseAddedMarkets','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:10000,description:'Markets added since previous in-process Coinbase universe observation'});
define('research.exchange.coinbaseRemovedMarkets','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:10000,description:'Markets removed since previous in-process Coinbase universe observation'});
define('research.exchange.krakenAddedMarkets','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:10000,description:'Markets added since previous in-process Kraken universe observation'});
define('research.exchange.krakenRemovedMarkets','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:10000,description:'Markets removed since previous in-process Kraken universe observation'});
define('research.exchange.btcVenueCoverage','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:2,description:'Count of Coinbase/Kraken public universes containing BTC spot markets'});
define('research.exchange.ethVenueCoverage','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:2,description:'Count of Coinbase/Kraken public universes containing ETH spot markets'});
define('research.exchange.solVenueCoverage','EXCHANGE_CONTEXT',{unit:'COUNT',min:0,max:2,description:'Count of Coinbase/Kraken public universes containing SOL spot markets'});

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
