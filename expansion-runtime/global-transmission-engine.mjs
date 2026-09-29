import {sha256} from '../institutional-kernel.mjs';

export const GLOBAL_TRANSMISSION_ENGINE_VERSION='TCX_GLOBAL_TRANSMISSION_ENGINE_V1';
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
const EVENT_FAMILIES=Object.freeze({
 MACRO:['CENTRAL_BANK','INFLATION','JOBS','GDP','LIQUIDITY','RATES','FX'],
 GEOPOLITICS:['WAR','CEASEFIRE','SANCTIONS','TARIFF','TRADE','ELECTION_POLICY','DIPLOMACY'],
 CORPORATE:['EARNINGS','GUIDANCE','M_AND_A','BANKRUPTCY','CAPEX','LAYOFFS','BUYBACK'],
 CAPITAL_MARKETS:['IPO','DIRECT_LISTING','ETF','INDEX_INCLUSION','SECONDARY_OFFERING','LOCKUP','DEBT_ISSUANCE'],
 TECHNOLOGY:['AI','CHIPS','COMPUTE','CYBER','ENERGY_TECH','BREAKTHROUGH'],
 CRYPTO:['ETF_FLOW','REGULATION','EXCHANGE','STABLECOIN','HACK','PROTOCOL','TOKEN_LISTING','WHALE_FLOW'],
 COMMODITIES:['OIL','GAS','GOLD','COPPER','URANIUM','CRITICAL_MINERALS','SUPPLY_SHOCK'],
 SYSTEMIC:['BANK_STRESS','CREDIT_EVENT','DEFAULT','LIQUIDITY_CRISIS','INFRASTRUCTURE_OUTAGE','NATURAL_DISASTER']
});
const CHANNELS=Object.freeze({
 MACRO:['RATES','USD','LIQUIDITY','RISK_APPETITE'],
 GEOPOLITICS:['SUPPLY','INFLATION','FX','RISK_PREMIUM','RISK_APPETITE'],
 CORPORATE:['EQUITY_EXPECTATIONS','SECTOR_ROTATION','RISK_APPETITE'],
 CAPITAL_MARKETS:['PRIMARY_CAPITAL_DEMAND','VALUATION_DISCOVERY','SECTOR_ROTATION','LIQUIDITY_COMPETITION'],
 TECHNOLOGY:['GROWTH_EXPECTATIONS','CAPEX','SECTOR_ROTATION','RISK_APPETITE'],
 CRYPTO:['CRYPTO_LIQUIDITY','REGULATORY_PREMIUM','COUNTERPARTY_RISK','SPECULATIVE_FLOW'],
 COMMODITIES:['INPUT_COSTS','INFLATION','RATES','RISK_APPETITE'],
 SYSTEMIC:['CREDIT','LIQUIDITY','VOLATILITY','RISK_APPETITE']
});
export function classifyGlobalEvent(event={}){
 const raw=[event.eventType,event.topic,event.category,...(event.tags||[])].filter(Boolean).map(x=>String(x).toUpperCase());
 let family='OTHER',type=raw[0]||'UNKNOWN';
 for(const [f,types] of Object.entries(EVENT_FAMILIES)){const hit=raw.find(x=>types.includes(x));if(hit){family=f;type=hit;break;}}
 return Object.freeze({family,type,channels:CHANNELS[family]||['INFORMATION','RISK_APPETITE'],known:family!=='OTHER'});
}
export function buildTransmissionGraph(event,{marketMoves={},cryptoMoves={},context={}}={}){
 const cls=classifyGlobalEvent(event); const observations={...marketMoves,...cryptoMoves};
 const observed=Object.entries(observations).filter(([,v])=>finite(v)!=null).map(([asset,v])=>({asset:String(asset).toUpperCase(),movePct:Number(v)}));
 const breadth=observed.length?observed.filter(x=>Math.abs(x.movePct)>=Number(context.materialMovePct??.25)).length/observed.length:0;
 const cryptoObserved=Object.entries(cryptoMoves).filter(([,v])=>finite(v)!=null).map(([asset,v])=>({asset:String(asset).toUpperCase(),movePct:Number(v)}));
 const core={version:GLOBAL_TRANSMISSION_ENGINE_VERSION,eventClass:cls,hypothesizedChannels:cls.channels,observedMarkets:observed,crossMarketBreadth:breadth,cryptoObserved,cryptoImpactStatus:cryptoObserved.length?(breadth>=.4?'CROSS_MARKET_CONFIRMED':'OBSERVED_UNCONFIRMED'):'AWAITING_MARKET_DATA',meaning:'TRANSMISSION_HYPOTHESIS_SEPARATE_FROM_OBSERVED_RESPONSE'};
 return Object.freeze({...core,fingerprint:sha256(core)});
}
export function assessIpoEvent(event,{demand={},marketMoves={},cryptoMoves={}}={}){
 const size=finite(event?.offerSizeUsd),valuation=finite(event?.valuationUsd);
 const oversub=finite(demand?.oversubscription),firstDay=finite(demand?.firstDayReturnPct);
 const demandScore=clamp(.45*Math.min(1,(oversub||0)/10)+.35*Math.min(1,Math.abs(firstDay||0)/30)+.20*(event?.highProfile?1:0));
 const graph=buildTransmissionGraph({...event,eventType:'IPO'},{marketMoves,cryptoMoves});
 return Object.freeze({eventType:'IPO',offerSizeUsd:size,valuationUsd:valuation,demandScore,channels:['PRIMARY_CAPITAL_DEMAND','VALUATION_DISCOVERY','SECTOR_ROTATION','LIQUIDITY_COMPETITION'],graph,epistemic:'IPO_IMPACT_HYPOTHESIS_REQUIRES_LIVE_MARKET_CONFIRMATION'});
}
export function inferCryptoImpact(graph,{historicalSupport=null}={}){
 const crypto=graph?.cryptoObserved||[]; const direct=crypto.length?crypto.reduce((a,x)=>a+x.movePct,0)/crypto.length:null;
 const support=clamp(historicalSupport?.supportScore||0);
 const breadth=clamp(graph?.crossMarketBreadth||0);
 const confidence=clamp(.5*breadth+.3*support+.2*(crypto.length?1:0));
 return Object.freeze({direction:direct==null?'UNKNOWN':direct>0?'UP':direct<0?'DOWN':'FLAT',observedMeanCryptoMovePct:direct,confidence,status:confidence>=.7?'SUPPORTED':confidence>=.45?'DEVELOPING':'INSUFFICIENT',epistemic:'PROBABILISTIC_INTERPRETATION_NOT_GUARANTEED_CAUSALITY'});
}
export function eventFamilyCatalog(){return structuredClone(EVENT_FAMILIES);}
