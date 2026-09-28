import { sha256 } from './institutional-kernel.mjs';
export const PIT_CORRELATION_ENGINE_VERSION='TCX_PIT_CORRELATION_ENGINE_V1';
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
function pearson(a,b){const n=Math.min(a.length,b.length);if(n<3)return null;const ma=a.slice(-n).reduce((s,x)=>s+x,0)/n,mb=b.slice(-n).reduce((s,x)=>s+x,0)/n;let cov=0,va=0,vb=0;for(let i=0;i<n;i++){const x=a[a.length-n+i]-ma,y=b[b.length-n+i]-mb;cov+=x*y;va+=x*x;vb+=y*y;}return va&&vb?cov/Math.sqrt(va*vb):null;}
function returnsFromCandles(rows,asOf){const c=(rows||[]).filter(x=>finite(x?.close)!=null&&finite(x?.closeTime)!=null&&Number(x.closeTime)<=asOf).sort((a,b)=>a.closeTime-b.closeTime);const out=[];for(let i=1;i<c.length;i++){const p=Number(c[i-1].close),q=Number(c[i].close);if(p>0&&q>0)out.push({t:Number(c[i].closeTime),r:Math.log(q/p)});}return out;}
export function buildPointInTimeCorrelation(seriesBySymbol,{asOf=Date.now(),window=96,stressWindow=24,minSamples=48,threshold=.65,stressThreshold=.75}={}){
 const ret={};for(const [s,rows] of Object.entries(seriesBySymbol||{}))ret[s]=returnsFromCandles(rows,asOf);
 const symbols=Object.keys(ret),pairs={};
 for(let i=0;i<symbols.length;i++)for(let j=i+1;j<symbols.length;j++){const a=ret[symbols[i]],b=ret[symbols[j]],bm=new Map(b.map(x=>[x.t,x.r])),aligned=a.filter(x=>bm.has(x.t)).map(x=>[x.r,bm.get(x.t)]),tail=aligned.slice(-window),stress=aligned.slice(-stressWindow),rho=pearson(tail.map(x=>x[0]),tail.map(x=>x[1])),stressRho=pearson(stress.map(x=>x[0]),stress.map(x=>x[1])),n=tail.length,evidenceReady=n>=minSamples;const effective=evidenceReady?Math.max(Math.abs(rho||0),Math.abs(stressRho||0)):null;pairs[[symbols[i],symbols[j]].sort().join('|')]={samples:n,rho,stressRho,effectiveAbsCorrelation:effective,evidenceReady,correlated:evidenceReady&&(Math.abs(rho||0)>=threshold||Math.abs(stressRho||0)>=stressThreshold)};}
 const core={version:PIT_CORRELATION_ENGINE_VERSION,asOf,window,stressWindow,minSamples,threshold,stressThreshold,pairs,execution:'SHADOW_ONLY',action:'ABSTAIN',canExecuteLive:false,meaning:'POINT_IN_TIME_RETURN_CORRELATION_WITH_STRESS_OVERRIDE'};
 return freeze({...core,fingerprint:sha256(core)});
}
export function correlationDecision(model,a,b){const p=model?.pairs?.[[String(a),String(b)].sort().join('|')];return freeze({evidenceReady:p?.evidenceReady===true,correlated:p?.correlated===true,effectiveAbsCorrelation:p?.effectiveAbsCorrelation??null,samples:p?.samples||0,version:PIT_CORRELATION_ENGINE_VERSION});}
