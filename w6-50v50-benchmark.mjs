import {evaluateUser99k60sEntry} from './shadow-specialist-wallets.mjs';

export const W6_50V50_BENCHMARK_VERSION='W6_50V50_BENCHMARK_V1';
export const W6_CHECKPOINT_SECONDS=Object.freeze([60,120,180,240,300,480,600]);
export const W6_SIZE_SOL=Object.freeze([1,2,4,8,16]);

function finite(v,fallback=null){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function median(xs){const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function tokenKey(row){return String(row?.tokenAddress||row?.address||row?.symbol||'');}
function ageSeconds(row,now){const t=finite(row?.pairCreatedAt);return t!=null&&t<=now?(now-t)/1000:null;}
function bucket(row,now){const age=ageSeconds(row,now);const liq=finite(row?.liquidityUsd,0)||0;return `${Math.floor((age??9999)/15)}:${Math.floor(liq/10000)}`;}

export function classifyW6Candidates(rows,{now=Date.now(),maxAgeSeconds=120,minMarketCapUsd=99_000}={}){
  return (Array.isArray(rows)?rows:[]).map(row=>({
    row,
    key:tokenKey(row),
    ageSeconds:ageSeconds(row,now),
    signal:evaluateUser99k60sEntry(row,{now,maxAgeSeconds,minMarketCapUsd})
  }));
}

export function buildW650v50Cohort(rows,{now=Date.now(),targetPerArm=50,maxAgeSeconds=120,minMarketCapUsd=99_000}={}){
  const classified=classifyW6Candidates(rows,{now,maxAgeSeconds,minMarketCapUsd});
  const strategy=classified.filter(x=>x.signal?.match===true).slice(0,targetPerArm);
  const used=new Set();
  const controls=[];
  for(const s of strategy){
    const b=bucket(s.row,now);
    const c=classified.find(x=>x.signal?.match!==true&&!used.has(x.key)&&bucket(x.row,now)===b);
    if(c){used.add(c.key);controls.push(c);}
  }
  return Object.freeze({
    version:W6_50V50_BENCHMARK_VERSION,
    targetPerArm,
    complete:strategy.length===targetPerArm&&controls.length===targetPerArm,
    strategy,
    controls,
    missingStrategy:Math.max(0,targetPerArm-strategy.length),
    missingControls:Math.max(0,targetPerArm-controls.length),
    execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false
  });
}

function checkpointPrice(row,seconds){
  const p=finite(row?.checkpointPrices?.[seconds]??row?.checkpointPrices?.[String(seconds)]);
  return p>0?p:null;
}
function executionReturn({entryPrice,exitPrice,sizeSol,liquidityUsd,feeBps=10,slippageBps=0}){
  if(!(entryPrice>0&&exitPrice>0))return {status:'MISSING_PRICE',returnPct:null};
  if(!(liquidityUsd>0))return {status:'UNFILLABLE',returnPct:null};
  const impactBps=Math.min(9500,Math.max(0,(sizeSol*150/Math.max(1,liquidityUsd))*10000));
  if(impactBps>=9000)return {status:'UNFILLABLE',returnPct:null,impactBps};
  const gross=exitPrice/entryPrice-1;
  const cost=(2*feeBps+2*slippageBps+impactBps)/10000;
  return {status:'FILLED',returnPct:gross-cost,impactBps,costPct:cost};
}

export function scoreW650v50Cohort(cohort,{solUsd=150,feeBps=10,slippageBps=0}={}){
  const scoreArm=arm=>{
    const rows=[];
    for(const item of arm){
      const entry=finite(item.row?.priceUsd);
      const liq=finite(item.row?.liquidityUsd,0)||0;
      for(const sizeSol of W6_SIZE_SOL)for(const seconds of W6_CHECKPOINT_SECONDS){
        const r=executionReturn({entryPrice:entry,exitPrice:checkpointPrice(item.row,seconds),sizeSol,liquidityUsd:liq,feeBps,slippageBps});
        rows.push({key:item.key,sizeSol,seconds,...r});
      }
    }
    const bySize={};
    for(const sizeSol of W6_SIZE_SOL){
      const a=rows.filter(x=>x.sizeSol===sizeSol&&x.status==='FILLED'&&Number.isFinite(x.returnPct));
      bySize[sizeSol]={filled:a.length,unfillable:rows.filter(x=>x.sizeSol===sizeSol&&x.status==='UNFILLABLE').length,winRate:a.length?a.filter(x=>x.returnPct>0).length/a.length:null,medianReturnPct:median(a.map(x=>x.returnPct)),meanReturnPct:a.length?a.reduce((s,x)=>s+x.returnPct,0)/a.length:null};
    }
    return {rows,bySize};
  };
  return Object.freeze({version:W6_50V50_BENCHMARK_VERSION,complete:cohort?.complete===true,strategy:scoreArm(cohort?.strategy||[]),controls:scoreArm(cohort?.controls||[]),execution:'SHADOW_ONLY',canExecute:false,canExecuteLive:false,assumptions:{solUsd,feeBps,slippageBps}});
}
