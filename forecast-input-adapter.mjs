import { replayEnvelopeIntegrity, sha256 } from './institutional-kernel.mjs';

export const FORECAST_INPUT_ADAPTER_VERSION='TCX_FORECAST_INPUT_ADAPTER_V1';

const SYMBOL_RE=/^[A-Z0-9]{2,18}USDT$/;

function finite(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(name+' must be finite');
  return n;
}
function bounded(v,name){
  const n=finite(v,name);
  if(n<0||n>1) throw new Error(name+' must be in [0,1]');
  return n;
}
function addFeature(target,source,id,value,kind){
  const n=Number(value);
  if(!Number.isFinite(n)) return false;
  target[id]=n;
  source[id]=kind;
  return true;
}

/**
 * Converts the canonical Master Research Envelope into ForecastInput without
 * opening a second market-data path or fabricating unavailable features.
 */
export function buildCanonicalForecastInput({
  envelope,
  dataQuality,
  regimeId='UNKNOWN',
  regimeConfidence=0,
  extraFeatures=[],
  expansionEvidence=null
}={}){
  const integrity=replayEnvelopeIntegrity(envelope);
  if(!integrity.ok) throw new Error('invalid TCX research envelope integrity');
  if(envelope?.kind!=='TCX_RESEARCH_ENVELOPE') throw new Error('research envelope required');

  const symbol=String(envelope.symbol??'').toUpperCase();
  if(!SYMBOL_RE.test(symbol)) throw new Error('invalid forecast symbol');

  const asOf=finite(envelope.availableAt,'envelope.availableAt');
  const market=envelope.inputs?.market??{};
  const marketAvailableAt=finite(market.availableAt,'market.availableAt');
  const marketTimestamp=finite(market.timestamp,'market.timestamp');
  if(marketAvailableAt>asOf||marketTimestamp>asOf){
    throw new Error('research envelope contains future market knowledge');
  }

  const price=finite(market.price,'market.price');
  if(price<=0) throw new Error('market.price must be positive');

  const features={};
  const featureSources={};
  addFeature(features,featureSources,'market.spreadBps',market.spreadBps,'MASTER_ENVELOPE');
  addFeature(features,featureSources,'market.imbalance',market.imbalance,'MASTER_ENVELOPE');

  const witness=envelope.inputs?.witness??{};
  addFeature(features,featureSources,'witness.agreementScore',witness.agreementScore,'MASTER_ENVELOPE');
  addFeature(features,featureSources,'witness.externalWitnessCount',witness.externalWitnessCount,'MASTER_ENVELOPE');

  const engine=envelope.inputs?.engine??{};
  addFeature(features,featureSources,'engine.evidenceStrength',engine.evidenceStrength,'MASTER_ENVELOPE');
  addFeature(features,featureSources,'engine.contradictionScore',engine.contradictionScore,'MASTER_ENVELOPE');
  addFeature(features,featureSources,'engine.novelty',engine.novelty,'MASTER_ENVELOPE');
  addFeature(features,featureSources,'engine.transitionCoherence',engine.transitionCoherence,'MASTER_ENVELOPE');
  addFeature(features,featureSources,'engine.transitionSupport',engine.transitionSupport,'MASTER_ENVELOPE');

  let blockedFutureExtras=0;
  let blockedFutureExpansion=0;
  let rejectedExpansion=0;
  let rejectedExtras=0;
  for(const row of Array.isArray(extraFeatures)?extraFeatures:[]){
    const id=String(row?.id??'').trim();
    const value=Number(row?.value);
    const availableAt=Number(row?.availableAt);
    if(!id||!Number.isFinite(value)||!Number.isFinite(availableAt)){
      rejectedExtras++;
      continue;
    }
    if(availableAt>asOf){
      blockedFutureExtras++;
      continue;
    }
    features[id]=value;
    featureSources[id]=String(row?.source??'MASTER_DERIVED');
  }

  if(expansionEvidence!=null){
    const expAsOf=Number(expansionEvidence?.asOf);
    const fp=String(expansionEvidence?.fingerprint??'');
    const restrictions=expansionEvidence?.restrictions??{};
    const safe=expansionEvidence?.executionMode==='SHADOW_ONLY'&&
      expansionEvidence?.action==='ABSTAIN'&&
      expansionEvidence?.canExecute===false&&
      restrictions?.mayMutateForecast===false&&
      restrictions?.mayBypassInstitutionalAdmission===false;
    if(!Number.isFinite(expAsOf)||!fp||!safe){
      rejectedExpansion++;
    }else if(expAsOf>asOf){
      blockedFutureExpansion++;
    }else{
      const liq=expansionEvidence?.liquiditySnapshot??{};
      addFeature(features,featureSources,'expansion.liquidity.spreadBps',liq.spreadBps,'TCX_EXPANSION_LIQUIDITY');
      addFeature(features,featureSources,'expansion.liquidity.imbalance',liq.imbalance,'TCX_EXPANSION_LIQUIDITY');
      addFeature(features,featureSources,'expansion.liquidity.depthBid',liq.depthBid,'TCX_EXPANSION_LIQUIDITY');
      addFeature(features,featureSources,'expansion.liquidity.depthAsk',liq.depthAsk,'TCX_EXPANSION_LIQUIDITY');
      const impact=expansionEvidence?.eventImpactEstimate??{};
      addFeature(features,featureSources,'expansion.eventImpact.meanReturn',impact.meanReturn,'TCX_EXPANSION_EVENT_IMPACT');
      addFeature(features,featureSources,'expansion.eventImpact.medianReturn',impact.medianReturn,'TCX_EXPANSION_EVENT_IMPACT');
      const source=expansionEvidence?.sourceReliability??{};
      addFeature(features,featureSources,'expansion.source.sampleSize',source.sampleSize,'TCX_EXPANSION_SOURCE_INTELLIGENCE');
      addFeature(features,featureSources,'expansion.source.reliability',source.reliability,'TCX_EXPANSION_SOURCE_INTELLIGENCE');
      const trader=expansionEvidence?.traderWalletEvidence?.performance??{};
      addFeature(features,featureSources,'expansion.traderWallet.sampleSize',trader.sampleSize,'TCX_TRADER_WALLET_INTELLIGENCE');
      addFeature(features,featureSources,'expansion.traderWallet.meanNetReturn',trader.meanNetReturn,'TCX_TRADER_WALLET_INTELLIGENCE');
      addFeature(features,featureSources,'expansion.traderWallet.hitRate',trader.hitRate,'TCX_TRADER_WALLET_INTELLIGENCE');
    }
  }

  if(!Object.keys(features).length) throw new Error('no forecast features available');

  const quality=bounded(dataQuality,'dataQuality');
  const regimeConf=bounded(regimeConfidence,'regimeConfidence');

  const guards=[
    {
      id:'MASTER_RESEARCH_SAFETY',
      status:String(envelope?.safety?.state??'UNKNOWN'),
      reasons:[
        ...(Array.isArray(envelope?.safety?.hardReasons)?envelope.safety.hardReasons:[]),
        ...(Array.isArray(envelope?.safety?.softReasons)?envelope.safety.softReasons:[])
      ]
    }
  ];

  const core={
    schemaVersion:FORECAST_INPUT_ADAPTER_VERSION,
    symbol,
    asOf,
    price,
    features,
    regimeId:String(regimeId??'UNKNOWN'),
    regimeConfidence:regimeConf,
    dataQuality:quality,
    guards,
    provenance:{
      envelopeHash:String(envelope.envelopeHash),
      inputHash:String(envelope.inputHash),
      source:'TCX_RESEARCH_ENVELOPE',
      featureSources
    },
    audit:{
      marketTimestamp,
      marketAvailableAt,
      blockedFutureExtras,
      rejectedExtras,
      blockedFutureExpansion,
      rejectedExpansion,
      expansionFingerprint:expansionEvidence&&rejectedExpansion===0&&blockedFutureExpansion===0?String(expansionEvidence.fingerprint):null,
      duplicateMarketTruthCreated:false
    }
  };

  return Object.freeze({...core,inputFingerprint:sha256(core)});
}

export function verifyCanonicalForecastInput(value){
  try{
    if(value?.schemaVersion!==FORECAST_INPUT_ADAPTER_VERSION) return {ok:false,reasons:['VERSION_INVALID']};
    if(value?.audit?.duplicateMarketTruthCreated!==false) return {ok:false,reasons:['DUPLICATE_MARKET_TRUTH']};
    if(!/^[a-f0-9]{64}$/i.test(String(value?.inputFingerprint??''))) return {ok:false,reasons:['FINGERPRINT_INVALID']};
    const {inputFingerprint,...core}=value;
    const expected=sha256(core);
    return inputFingerprint===expected
      ? {ok:true,reasons:[],expectedFingerprint:expected}
      : {ok:false,reasons:['FINGERPRINT_MISMATCH'],expectedFingerprint:expected};
  }catch(err){
    return {ok:false,reasons:['FORECAST_INPUT_INVALID',err instanceof Error?err.message:String(err)]};
  }
}
