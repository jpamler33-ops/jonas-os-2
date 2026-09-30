import { sha256 } from './institutional-kernel.mjs';
export const PIT_CORRELATION_ENGINE_VERSION='TCX_PIT_CORRELATION_ENGINE_V2';
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
function pearson(a,b){const n=Math.min(a.length,b.length);if(n<3)return null;const ma=a.reduce((s,x)=>s+x,0)/n,mb=b.reduce((s,x)=>s+x,0)/n;let cov=0,va=0,vb=0;for(let i=0;i<n;i++){const x=a[i]-ma,y=b[i]-mb;cov+=x*y;va+=x*x;vb+=y*y;}return va&&vb?cov/Math.sqrt(va*vb):null;}
function ranks(a){const s=a.map((v,i)=>({v,i})).sort((x,y)=>x.v-y.v),out=Array(a.length);for(let p=0;p<s.length;){let q=p+1;while(q<s.length&&s[q].v===s[p].v)q++;const r=(p+q-1)/2+1;for(let k=p;k<q;k++)out[s[k].i]=r;p=q;}return out;}
const spearman=(a,b)=>a.length>=3?pearson(ranks(a),ranks(b)):null;
function returnsFromCandles(rows,asOf){const c=(rows||[]).filter(x=>finite(x?.close)!=null&&finite(x?.closeTime)!=null&&Number(x.closeTime)<=asOf).sort((a,b)=>a.closeTime-b.closeTime),out=[];for(let i=1;i<c.length;i++){const p=Number(c[i-1].close),q=Number(c[i].close);if(p>0&&q>0)out.push({t:Number(c[i].closeTime),r:Math.log(q/p)});}return out;}
function stressRows(aligned,fraction=.3,min=12){if(!aligned.length)return[];const abs=aligned.map(x=>Math.max(Math.abs(x[0]),Math.abs(x[1]))).sort((a,b)=>a-b),idx=Math.max(0,Math.floor((1-fraction)*(abs.length-1))),cut=abs[idx];return aligned.filter(x=>Math.max(Math.abs(x[0]),Math.abs(x[1]))>=cut).slice(-Math.max(min,Math.ceil(aligned.length*fraction)));}
function shrink(rho,n,k=20){return rho==null?null:rho*(n/(n+k));}
export function buildPointInTimeCorrelation(seriesBySymbol,{asOf=Date.now(),window=96,minSamples=48,threshold=.60,stressThreshold=.70,stressFraction=.30,shrinkageStrength=20}={}){
 const ret={};for(const [s,rows] of Object.entries(seriesBySymbol||{}))ret[s]=returnsFromCandles(rows,asOf);
 const symbols=Object.keys(ret),pairs={};
 for(let i=0;i<symbols.length;i++)for(let j=i+1;j<symbols.length;j++){
  const a=ret[symbols[i]],b=ret[symbols[j]],bm=new Map(b.map(x=>[x.t,x.r])),aligned=a.filter(x=>bm.has(x.t)).map(x=>[x.r,bm.get(x.t)]).slice(-window),stress=stressRows(aligned,stressFraction);
  const p=pearson(aligned.map(x=>x[0]),aligned.map(x=>x[1])),s=spearman(aligned.map(x=>x[0]),aligned.map(x=>x[1])),sp=spearman(stress.map(x=>x[0]),stress.map(x=>x[1])),n=aligned.length,sn=stress.length,evidenceReady=n>=minSamples;
  const shrunkPearson=shrink(p,n,shrinkageStrength),shrunkSpearman=shrink(s,n,shrinkageStrength),shrunkStress=shrink(sp,sn,Math.max(8,shrinkageStrength/2));
  const effective=evidenceReady?Math.max(Math.abs(shrunkPearson||0),Math.abs(shrunkSpearman||0),Math.abs(shrunkStress||0)):null;
  pairs[[symbols[i],symbols[j]].sort().join('|')]={samples:n,stressSamples:sn,rho:p,spearman:s,stressRho:sp,shrunkPearson,shrunkSpearman,shrunkStress,effectiveAbsCorrelation:effective,evidenceReady,correlated:evidenceReady&&(Math.max(Math.abs(shrunkPearson||0),Math.abs(shrunkSpearman||0))>=threshold||Math.abs(shrunkStress||0)>=stressThreshold)};
 }
 const core={version:PIT_CORRELATION_ENGINE_VERSION,asOf,window,minSamples,threshold,stressThreshold,stressFraction,shrinkageStrength,pairs,execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,meaning:'POINT_IN_TIME_ROBUST_RETURN_CORRELATION_WITH_VOLATILITY_STRESS_SELECTION_AND_SHRINKAGE'};
 return freeze({...core,fingerprint:sha256(core)});
}
export function correlationDecision(model,a,b){const p=model?.pairs?.[[String(a),String(b)].sort().join('|')];return freeze({evidenceReady:p?.evidenceReady===true,correlated:p?.correlated===true,effectiveAbsCorrelation:p?.effectiveAbsCorrelation??null,samples:p?.samples||0,stressSamples:p?.stressSamples||0,version:PIT_CORRELATION_ENGINE_VERSION});}
