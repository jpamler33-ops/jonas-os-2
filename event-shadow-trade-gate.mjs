import {sha256} from './institutional-kernel.mjs';
import {inferCryptoImpact} from './expansion-runtime/global-transmission-engine.mjs';
export const EVENT_SHADOW_TRADE_GATE_VERSION='TCX_EVENT_SHADOW_TRADE_GATE_V1';
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
function reject(reason,extra={}){return Object.freeze({version:EVENT_SHADOW_TRADE_GATE_VERSION,eligible:false,reason,...extra,execution:'SHADOW_ONLY',canExecuteLive:false});}
export function deriveEventShadowTrade({event={},eventScore={},transmission={},historicalSupport={},symbol='BTCUSDT',notionalQuote=100,now=Date.now()}={}){
 const status=String(eventScore?.status||'WATCH').toUpperCase();
 const quality=clamp(eventScore?.quality),impact=clamp(eventScore?.impact);
 const source=clamp(eventScore?.inputs?.sourceReliability),confirmation=clamp(eventScore?.inputs?.confirmation);
 const manipulation=clamp(eventScore?.inputs?.manipulationRisk);
 const marketConfirmation=clamp(eventScore?.inputs?.marketConfirmation);
 const crypto=inferCryptoImpact(transmission,{historicalSupport});
 if(['UNVERIFIED','WATCH'].includes(status)) return reject('EVENT_NOT_ADMITTED',{status});
 if(source<.6||confirmation<.45) return reject('SOURCE_OR_CORROBORATION_WEAK',{source,confirmation});
 if(manipulation>.55) return reject('MANIPULATION_RISK_HIGH',{manipulation});
 if(marketConfirmation<.45||clamp(transmission?.crossMarketBreadth)<.4) return reject('CROSS_MARKET_CONFIRMATION_WEAK',{marketConfirmation,breadth:clamp(transmission?.crossMarketBreadth)});
 if(crypto.direction==='UNKNOWN'||crypto.status==='INSUFFICIENT') return reject('CRYPTO_IMPACT_UNRESOLVED',{crypto});
 const confidence=clamp(.22*quality+.20*impact+.18*source+.15*confirmation+.15*marketConfirmation+.10*clamp(historicalSupport?.supportScore));
 if(confidence<.62) return reject('EVENT_TRADE_CONFIDENCE_LOW',{confidence,crypto});
 const side=crypto.direction==='UP'?'BUY':'SELL';
 const core={eventId:String(event.id||event.eventId||''),eventFingerprint:String(event.fingerprint||transmission.fingerprint||''),symbol:String(symbol).toUpperCase(),side,confidence,generatedAt:Number(now),sourceReliability:source,independentConfirmation:confirmation,marketConfirmation,historicalSupport:clamp(historicalSupport?.supportScore),transmissionFingerprint:String(transmission.fingerprint||'')};
 return Object.freeze({...core,version:EVENT_SHADOW_TRADE_GATE_VERSION,eligible:true,reason:'EVENT_SHADOW_TRADE_ADMITTED',decisionKey:sha256(core),type:'MARKET',notionalQuote:Math.max(1,Number(notionalQuote)||100),trigger:'GLOBAL_EVENT_TRANSMISSION',execution:'SHADOW_ONLY',canExecuteLive:false,epistemic:'EVENT_CONDITIONED_SHADOW_HYPOTHESIS'});
}
export function eventTradeLearningOutcome(decision,position){
 const pnl=finite(position?.realizedNetPnlQuote),ret=finite(position?.realizedReturnPct);
 return Object.freeze({version:EVENT_SHADOW_TRADE_GATE_VERSION,decisionKey:String(decision?.decisionKey||''),eventId:String(decision?.eventId||''),symbol:String(decision?.symbol||position?.symbol||''),side:String(decision?.side||position?.side||''),realizedNetPnlQuote:pnl,realizedReturnPct:ret,won:pnl==null?null:pnl>0,resolvedAt:finite(position?.closedAt),learningClass:'EVENT_CONDITIONED_SHADOW_OUTCOME'});
}
