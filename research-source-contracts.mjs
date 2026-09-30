import { sha256 } from './institutional-kernel.mjs';

export const RESEARCH_SOURCE_CONTRACTS_VERSION='TCX_RESEARCH_SOURCE_CONTRACTS_V11';

const contracts=[
  {id:'BINANCE_USDM_DERIVATIVES',domain:'DERIVATIVES',source:'BINANCE_USDM_PUBLIC',minCompleteness:.5,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'OKX_PUBLIC_DERIVATIVES',domain:'DERIVATIVES',source:'OKX_PUBLIC',minCompleteness:.5,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'DERIVATIVES_CROSS_VENUE_SPREAD',domain:'DERIVATIVES',source:'BINANCE_OKX_DERIVED',minCompleteness:1,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'BYBIT_LIQUIDATION_STREAM',domain:'LIQUIDATION',source:'BYBIT_PUBLIC_ALL_LIQUIDATION',minCompleteness:.8,maxPublicationLagMs:120000,maxIngestLagMs:60000,maxSilenceMs:1800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'BITCOIN_PUBLIC_ONCHAIN',domain:'ONCHAIN',source:'MEMPOOL_SPACE_PUBLIC',minCompleteness:1,maxPublicationLagMs:1200000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'ETHEREUM_PUBLIC_ONCHAIN',domain:'ONCHAIN',source:'ETHEREUM_PUBLIC_RPC',minCompleteness:1,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'SOLANA_PUBLIC_ONCHAIN',domain:'ONCHAIN',source:'SOLANA_PUBLIC_RPC',minCompleteness:1,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'COINMETRICS_COMMUNITY',domain:'NETWORK_METRICS',source:'COINMETRICS_COMMUNITY_V4',minCompleteness:.5,maxPublicationLagMs:604800000,maxIngestLagMs:60000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'DERIBIT_PUBLIC_OPTIONS',domain:'OPTIONS',source:'DERIBIT_PUBLIC_OPTIONS',minCompleteness:.5,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:1800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_DFF_CURRENT',domain:'MACRO',source:'FRED_DFF_CURRENT',minCompleteness:1,maxPublicationLagMs:604800000,maxIngestLagMs:1200000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_DGS10_CURRENT',domain:'MACRO',source:'FRED_DGS10_CURRENT',minCompleteness:1,maxPublicationLagMs:604800000,maxIngestLagMs:1200000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_DTWEXBGS_CURRENT',domain:'MACRO',source:'FRED_DTWEXBGS_CURRENT',minCompleteness:1,maxPublicationLagMs:604800000,maxIngestLagMs:1200000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_WALCL_CURRENT',domain:'MACRO',source:'FRED_WALCL_CURRENT',minCompleteness:1,maxPublicationLagMs:864000000,maxIngestLagMs:1200000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_DFF_DGS10_DERIVED',domain:'MACRO',source:'FRED_DFF_DGS10_DERIVED',minCompleteness:1,maxPublicationLagMs:604800000,maxIngestLagMs:1200000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_VIXCLS_CURRENT',domain:'MACRO',source:'FRED_VIXCLS_CURRENT',minCompleteness:1,maxPublicationLagMs:604800000,maxIngestLagMs:1200000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_SP500_CURRENT',domain:'MACRO',source:'FRED_SP500_CURRENT',minCompleteness:1,maxPublicationLagMs:604800000,maxIngestLagMs:1200000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_DCOILWTICO_CURRENT',domain:'MACRO',source:'FRED_DCOILWTICO_CURRENT',minCompleteness:1,maxPublicationLagMs:604800000,maxIngestLagMs:1200000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_CPIAUCSL_CURRENT',domain:'MACRO',source:'FRED_CPIAUCSL_CURRENT',minCompleteness:1,maxPublicationLagMs:3888000000,maxIngestLagMs:1200000,maxSilenceMs:3888000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_UNRATE_CURRENT',domain:'MACRO',source:'FRED_UNRATE_CURRENT',minCompleteness:1,maxPublicationLagMs:3888000000,maxIngestLagMs:1200000,maxSilenceMs:3888000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'ALTERNATIVE_FEAR_GREED',domain:'SENTIMENT',source:'ALTERNATIVE_ME_FEAR_GREED',minCompleteness:.66,maxPublicationLagMs:172800000,maxIngestLagMs:600000,maxSilenceMs:259200000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'ALTERNATIVE_GLOBAL_MARKET',domain:'MARKET_CONTEXT',source:'ALTERNATIVE_ME_GLOBAL',minCompleteness:.66,maxPublicationLagMs:1800000,maxIngestLagMs:600000,maxSilenceMs:7200000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'DEFILLAMA_PUBLIC_CHAINS',domain:'DEFI_CONTEXT',source:'DEFILLAMA_PUBLIC_CHAINS',minCompleteness:.5,maxPublicationLagMs:1800000,maxIngestLagMs:600000,maxSilenceMs:7200000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'DEXSCREENER_TRENDING_METAS',domain:'DEX_CONTEXT',source:'DEXSCREENER_TRENDING_METAS',minCompleteness:.5,maxPublicationLagMs:600000,maxIngestLagMs:600000,maxSilenceMs:3600000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'DEFILLAMA_STABLECOIN_CHAINS',domain:'STABLECOIN_CONTEXT',source:'DEFILLAMA_STABLECOIN_CHAINS',minCompleteness:.5,maxPublicationLagMs:1800000,maxIngestLagMs:600000,maxSilenceMs:7200000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'DEXSCREENER_PROMOTION_RADAR',domain:'DEX_PROMOTION_CONTEXT',source:'DEXSCREENER_PROMOTION_RADAR',minCompleteness:.44,maxPublicationLagMs:600000,maxIngestLagMs:600000,maxSilenceMs:3600000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'GDELT_PUBLIC_NEWS',domain:'NEWS_EVENT',source:'GDELT_DOC_API',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:43200000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'GOOGLE_PUBLIC_NEWS',domain:'NEWS_EVENT',source:'GOOGLE_NEWS_RSS',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:43200000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'FED_OFFICIAL_NEWS',domain:'NEWS_EVENT',source:'FED_PRESS',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:3888000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'SEC_OFFICIAL_NEWS',domain:'NEWS_EVENT',source:'SEC_PRESS',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:3888000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'ECB_OFFICIAL_NEWS',domain:'NEWS_EVENT',source:'ECB_PRESS',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:3888000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'CFTC_OFFICIAL_NEWS',domain:'NEWS_EVENT',source:'CFTC_PRESS',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:3888000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'BLS_EMPSIT_OFFICIAL_NEWS',domain:'NEWS_EVENT',source:'BLS_EMPSIT',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:5184000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'BLS_CPI_OFFICIAL_NEWS',domain:'NEWS_EVENT',source:'BLS_CPI',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:5184000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'BLS_JOLTS_OFFICIAL_NEWS',domain:'NEWS_EVENT',source:'BLS_JOLTS',minCompleteness:1,maxPublicationLagMs:108000000,maxIngestLagMs:300000,maxSilenceMs:5184000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'CFTC_TFF_CRYPTO_POSITIONING',domain:'CFTC_POSITIONING',source:'CFTC_TFF_FUTURES_ONLY',minCompleteness:.5,maxPublicationLagMs:864000000,maxIngestLagMs:300000,maxSilenceMs:864000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'US_TREASURY_AUCTIONS',domain:'TREASURY_AUCTION',source:'US_TREASURY_FISCAL_DATA_AUCTIONS',minCompleteness:.5,maxPublicationLagMs:604800000,maxIngestLagMs:300000,maxSilenceMs:1814400000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'SEC_EDGAR_SUBMISSIONS',domain:'SEC_FILING',source:'SEC_EDGAR_SUBMISSIONS',minCompleteness:1,maxPublicationLagMs:1814400000,maxIngestLagMs:300000,maxSilenceMs:7776000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'COINBASE_KRAKEN_CONTEXT',domain:'EXCHANGE_CONTEXT',source:'COINBASE_KRAKEN_PUBLIC_CONTEXT',minCompleteness:.4,maxPublicationLagMs:600000,maxIngestLagMs:300000,maxSilenceMs:1800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'ISHARES_DIGITAL_ASSET_HOLDINGS',domain:'ETF_HOLDINGS',source:'ISHARES_DIGITAL_ASSET_HOLDINGS',minCompleteness:.5,maxPublicationLagMs:604800000,maxIngestLagMs:300000,maxSilenceMs:864000000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:2,requiredFinality:null},
  {id:'POLYMARKET_CONFIGURED',domain:'PREDICTION_MARKET',source:'POLYMARKET_GAMMA_CONFIGURED',minCompleteness:.5,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:1800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'VERIFIED_ENTITY_FLOW',domain:'ENTITY_FLOW',source:'VERIFIED_ENTITY_FINALIZED_FLOW',minCompleteness:1,maxPublicationLagMs:1800000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:'FINALIZED'},
  {id:'PUBLIC_WALLET_COHORT',domain:'WALLET_COHORT',source:'PUBLIC_WALLET_COHORT_RPC',minCompleteness:1,maxPublicationLagMs:900000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null}
].map(x=>Object.freeze({...x}));

const byKey=new Map(contracts.map(x=>[x.domain+'\u0000'+x.source,x]));

export const RESEARCH_SOURCE_CONTRACTS=Object.freeze([...contracts]);

export function researchSourceContract(domain,source){
  return byKey.get(String(domain||'').toUpperCase()+'\u0000'+String(source||''))||null;
}

export function sourceContractKey(domain,source){
  return String(domain||'').toUpperCase()+':'+String(source||'');
}

export function researchSourceContractsManifest(){
  const rows=RESEARCH_SOURCE_CONTRACTS.map(x=>({...x}));
  const core={version:RESEARCH_SOURCE_CONTRACTS_VERSION,sourceCount:rows.length,contracts:rows};
  return Object.freeze({...core,fingerprint:sha256(core)});
}
