import { sha256 } from './institutional-kernel.mjs';
import { verifyFrozenShadowPolicy } from './shadow-policy-freeze.mjs';
export const FROZEN_POLICY_OOS_ACCUMULATOR_VERSION='TCX_FROZEN_POLICY_OOS_ACCUMULATOR_V1';
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
function eligible(p){return p?.execution==='SHADOW_ONLY'&&p?.canExecuteLive===false&&p?.status==='CLOSED'&&!['COVERAGE_PROBE','ABSTAIN_PROBE','CHALLENGER'].includes(String(p.entryMode||'STANDARD').toUpperCase())&&Number.isFinite(Number(p.realizedNetPnlQuote));}
export function buildFrozenPolicyOosCohorts(ledger){
 const groups=new Map(),rejected={missingPolicy:0,invalidPolicy:0,preFreeze:0};
 for(const p of ledger?.positions||[]){if(!eligible(p))continue;const fp=String(p.frozenPolicyFingerprint||''),params=p.frozenPolicyParameters,policy={policyVersion:String(p.frozenPolicyVersion||''),frozenAt:Number(p.frozenPolicyFrozenAt),parameters:params,fingerprint:fp,execution:'SHADOW_ONLY',canExecuteLive:false};
  if(!fp||!params){rejected.missingPolicy++;continue;}if(!verifyFrozenShadowPolicy(policy)){rejected.invalidPolicy++;continue;}if(!Number.isFinite(Number(p.openedAt))||Number(p.openedAt)<Number(policy.frozenAt)){rejected.preFreeze++;continue;}
  const a=groups.get(fp)||[];a.push(p);groups.set(fp,a);
 }
 const cohorts=[...groups.entries()].map(([fingerprint,rows])=>{rows.sort((a,b)=>Number(a.openedAt)-Number(b.openedAt));let gp=0,gl=0,net=0;for(const p of rows){const x=Number(p.realizedNetPnlQuote);net+=x;x>0?gp+=x:gl+=Math.abs(x);}const first=rows[0];return{fingerprint,policyVersion:first.frozenPolicyVersion,frozenAt:Number(first.frozenPolicyFrozenAt),trades:rows.length,firstOpenedAt:Number(first.openedAt),lastClosedAt:Number(rows.at(-1).closedAt),netPnlQuote:net,expectancyQuote:rows.length?net/rows.length:null,profitFactor:gl?gp/gl:(gp?999:null)};}).sort((a,b)=>a.frozenAt-b.frozenAt);
 const core={version:FROZEN_POLICY_OOS_ACCUMULATOR_VERSION,cohorts,totalEligibleTrades:cohorts.reduce((s,x)=>s+x.trades,0),rejected,execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false};
 return freeze({...core,fingerprint:sha256(core)});
}
