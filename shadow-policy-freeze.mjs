import { sha256 } from './institutional-kernel.mjs';
export const SHADOW_POLICY_FREEZE_VERSION='TCX_SHADOW_POLICY_FREEZE_V1';
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
export function createFrozenShadowPolicy({policyVersion='AUTO_SHADOW_POLICY_V1',frozenAt,parameters={}}={}){
 if(!Number.isFinite(Number(frozenAt)))throw new Error('POLICY_FREEZE_TIME_REQUIRED');
 const canonical=stable(parameters);const fingerprint=sha256({policyVersion,parameters:canonical});
 return freeze({freezeVersion:SHADOW_POLICY_FREEZE_VERSION,policyVersion:String(policyVersion),frozenAt:Number(frozenAt),parameters:canonical,fingerprint,execution:'SHADOW_ONLY',canExecuteLive:false});
}
export function verifyFrozenShadowPolicy(policy){
 if(!policy||policy.execution!=='SHADOW_ONLY'||policy.canExecuteLive!==false)return false;
 return policy.fingerprint===sha256({policyVersion:String(policy.policyVersion),parameters:stable(policy.parameters||{})});
}
