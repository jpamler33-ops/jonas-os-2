import { sha256 } from './institutional-kernel.mjs';

export const PORTFOLIO_BRAIN_VERSION='TCX_PORTFOLIO_BRAIN_V1';
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
function symbolOf(o){return String(o?.symbol||'').toUpperCase();}
function signedExposure(o){
  const n=Math.max(0,finite(o?.fillQuote)??finite(o?.notionalQuote)??0);
  return (String(o?.side).toUpperCase()==='SELL'?-1:1)*n;
}

export function buildShadowPortfolioBrain({asOf,orders=[],equityQuote=null,correlations={}}={}){
  const t=finite(asOf);if(t==null)throw new Error('asOf must be finite');
  const eligible=(Array.isArray(orders)?orders:[]).filter(o=>
    o?.execution==='SHADOW_ONLY'&&o?.canExecuteLive===false&&
    finite(o?.createdAt)!=null&&Number(o.createdAt)<=t&&
    !['CANCELLED','REJECTED'].includes(String(o?.status||'').toUpperCase()));
  const bySymbol={};
  for(const o of eligible){
    const s=symbolOf(o);if(!s)continue;
    const exp=signedExposure(o);
    const x=bySymbol[s]??={symbol:s,gross:0,net:0,orders:0};
    x.gross+=Math.abs(exp);x.net+=exp;x.orders++;bySymbol[s]=x;
  }
  const positions=Object.values(bySymbol).sort((a,b)=>b.gross-a.gross);
  const gross=positions.reduce((a,x)=>a+x.gross,0);
  const net=positions.reduce((a,x)=>a+x.net,0);
  const equity=finite(equityQuote);
  const concentration=gross>0?positions[0]?.gross/gross:0;
  let correlatedGross=0;
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
    const a=positions[i],b=positions[j];
    const rho=finite(correlations?.[a.symbol]?.[b.symbol]??correlations?.[b.symbol]?.[a.symbol]);
    if(rho!=null&&Math.abs(rho)>=.7) correlatedGross+=Math.min(a.gross,b.gross)*Math.abs(rho);
  }
  const leverage=equity!=null&&equity>0?gross/equity:null;
  const reasons=[];
  if(concentration>.5)reasons.push('SYMBOL_CONCENTRATION_HIGH');
  if(leverage!=null&&leverage>1)reasons.push('SHADOW_GROSS_EXCEEDS_EQUITY');
  if(correlatedGross>gross*.35)reasons.push('CORRELATED_EXPOSURE_HIGH');
  if(equity==null)reasons.push('EQUITY_UNKNOWN');
  const riskGate=reasons.includes('SYMBOL_CONCENTRATION_HIGH')||reasons.includes('CORRELATED_EXPOSURE_HIGH')?'CAUTION':
    reasons.includes('EQUITY_UNKNOWN')?'INSUFFICIENT':'PASS';
  const core={version:PORTFOLIO_BRAIN_VERSION,asOf:t,riskGate,reasons,
    portfolio:{grossExposure:gross,netExposure:net,equityQuote:equity,shadowLeverage:leverage,
      symbolConcentration:concentration,correlatedGross,positionCount:positions.length,positions},
    epistemic:{risk:'DESCRIPTIVE_SHADOW_PORTFOLIO_RISK',correlation:'INPUT_DIAGNOSTIC_NOT_CAUSAL',allocation:'NO_AUTONOMOUS_ALLOCATION'},
    restrictions:{mayExecute:false,maySubmitOrders:false,mayMutateShadowOms:false,mayAllocateCapital:false},
    executionMode:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false};
  return freeze({...core,fingerprint:sha256(core)});
}
export function verifyShadowPortfolioBrain(value){
  try{if(value?.version!==PORTFOLIO_BRAIN_VERSION)return{ok:false,reasons:['VERSION_INVALID']};
    const reasons=[];if(value?.executionMode!=='SHADOW_ONLY'||value?.action!=='ABSTAIN'||value?.canExecute!==false)reasons.push('EXECUTION_INVARIANT_INVALID');
    if(value?.restrictions?.maySubmitOrders!==false||value?.restrictions?.mayMutateShadowOms!==false||value?.restrictions?.mayAllocateCapital!==false)reasons.push('PORTFOLIO_CONTROL_BOUNDARY_INVALID');
    const {fingerprint,...core}=value||{};const expected=sha256(core);if(fingerprint!==expected)reasons.push('FINGERPRINT_MISMATCH');
    return{ok:reasons.length===0,reasons,expectedFingerprint:expected};
  }catch(err){return{ok:false,reasons:['PORTFOLIO_BRAIN_INVALID',err instanceof Error?err.message:String(err)]};}
}
