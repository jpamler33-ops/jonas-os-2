import { sha256 } from './institutional-kernel.mjs';

export const RESEARCH_SOURCE_CONTRACTS_VERSION='TCX_RESEARCH_SOURCE_CONTRACTS_V1';

const contracts=[
  {id:'DERIVATIVES_MULTI_VENUE',domain:'DERIVATIVES',source:'BINANCE_OKX_PUBLIC_DERIVATIVES',minCompleteness:.5,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'BYBIT_LIQUIDATION_STREAM',domain:'LIQUIDATION',source:'BYBIT_PUBLIC_ALL_LIQUIDATION',minCompleteness:.8,maxPublicationLagMs:120000,maxIngestLagMs:60000,maxSilenceMs:1800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'BITCOIN_PUBLIC_ONCHAIN',domain:'ONCHAIN',source:'MEMPOOL_SPACE_PUBLIC',minCompleteness:1,maxPublicationLagMs:1200000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'ETHEREUM_PUBLIC_ONCHAIN',domain:'ONCHAIN',source:'ETHEREUM_PUBLIC_RPC',minCompleteness:1,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'SOLANA_PUBLIC_ONCHAIN',domain:'ONCHAIN',source:'SOLANA_PUBLIC_RPC',minCompleteness:1,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'COINMETRICS_COMMUNITY',domain:'NETWORK_METRICS',source:'COINMETRICS_COMMUNITY_V4',minCompleteness:.5,maxPublicationLagMs:604800000,maxIngestLagMs:60000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'DERIBIT_PUBLIC_OPTIONS',domain:'OPTIONS',source:'DERIBIT_PUBLIC_OPTIONS',minCompleteness:.5,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:1800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_REALTIME_MACRO',domain:'MACRO',source:'FRED_REALTIME_V1',minCompleteness:.25,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'FRED_GRAPH_CSV_MACRO',domain:'MACRO',source:'FRED_GRAPH_CSV_CURRENT',minCompleteness:.25,maxPublicationLagMs:172800000,maxIngestLagMs:60000,maxSilenceMs:172800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'POLYMARKET_CONFIGURED',domain:'PREDICTION_MARKET',source:'POLYMARKET_GAMMA_CONFIGURED',minCompleteness:.5,maxPublicationLagMs:600000,maxIngestLagMs:60000,maxSilenceMs:1800000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:null},
  {id:'VERIFIED_ENTITY_FLOW',domain:'ENTITY_FLOW',source:'VERIFIED_ENTITY_FINALIZED_FLOW',minCompleteness:1,maxPublicationLagMs:900000,maxIngestLagMs:60000,maxSilenceMs:2700000,quarantineAfterConsecutiveViolations:3,recoverAfterConsecutiveHealthy:3,requiredFinality:'FINALIZED'},
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
