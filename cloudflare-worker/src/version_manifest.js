import { STRATEGY_CORE_VERSION } from "./strategy_core.js";

export const SYSTEM_VERSION="3.6.0";
export const RESEARCH_MODEL_VERSION="3.5.0";
export const FEATURE_SCHEMA_VERSION="3.5.0";
export const GOVERNANCE_VERSION="2.0.0";
export const DATA_SCHEMA_VERSION="10";
export const PREDICTION_LEDGER_VERSION="1.0.0";

export function currentVersionManifest(){
  return {
    systemVersion:SYSTEM_VERSION,
    strategyVersion:STRATEGY_CORE_VERSION,
    researchModelVersion:RESEARCH_MODEL_VERSION,
    featureSchemaVersion:FEATURE_SCHEMA_VERSION,
    governanceVersion:GOVERNANCE_VERSION,
    dataSchemaVersion:DATA_SCHEMA_VERSION,
    predictionLedgerVersion:PREDICTION_LEDGER_VERSION
  };
}

export function canonicalStringify(value){
  const normalize=v=>{
    if(v===null||typeof v!=="object") return v;
    if(Array.isArray(v)) return v.map(normalize);
    const out={};
    for(const k of Object.keys(v).sort()) out[k]=normalize(v[k]);
    return out;
  };
  return JSON.stringify(normalize(value));
}

export function fnv1a64(text){
  let hash=0xcbf29ce484222325n;
  const prime=0x100000001b3n;
  const mask=0xffffffffffffffffn;
  const bytes=new TextEncoder().encode(String(text));
  for(const b of bytes){
    hash^=BigInt(b);
    hash=(hash*prime)&mask;
  }
  return hash.toString(16).padStart(16,"0");
}

export function manifestId(manifest=currentVersionManifest()){
  return [
    manifest.systemVersion,
    manifest.strategyVersion,
    manifest.researchModelVersion,
    manifest.featureSchemaVersion,
    manifest.governanceVersion,
    manifest.dataSchemaVersion
  ].join("|");
}
