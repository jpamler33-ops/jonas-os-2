function finite(x){return Number.isFinite(Number(x));}
function mean(xs){const v=(xs||[]).map(Number).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
function corr(rows,key,outcomeKey){
  const pairs=[];
  for(const r of rows||[]){
    const x=Number(r?.[key]),y=Number(r?.[outcomeKey]);
    if(Number.isFinite(x)&&Number.isFinite(y))pairs.push([x,y]);
  }
  if(pairs.length<20)return null;
  const mx=mean(pairs.map(p=>p[0])),my=mean(pairs.map(p=>p[1]));
  let num=0,dx=0,dy=0;
  for(const [x,y] of pairs){const a=x-mx,b=y-my;num+=a*b;dx+=a*a;dy+=b*b;}
  return dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
}
function signAgreement(a,b){
  if(a===null||b===null)return null;
  if(Math.abs(a)<1e-9||Math.abs(b)<1e-9)return null;
  return Math.sign(a)===Math.sign(b);
}

export const ADAPTIVE_MEMORY_VERSION="1.0.0";

export function learnFeatureMemory(rows,featureKeys,outcomeKey="ret_fwd_60m",nowTs=null){
  const xs=[...(rows||[])].filter(r=>finite(r.ts)).sort((a,b)=>Number(a.ts)-Number(b.ts));
  if(xs.length<80)return{
    status:"LEARNING",version:ADAPTIVE_MEMORY_VERSION,n:xs.length,features:[]
  };

  const now=Number(nowTs||xs.at(-1).ts);
  const windowsDays=[1,3,7,14,30,60,90];
  const features=[];

  for(const key of featureKeys){
    const full=corr(xs,key,outcomeKey);
    if(full===null)continue;

    const windows=[];
    for(const days of windowsDays){
      const start=now-days*86400000;
      const subset=xs.filter(r=>Number(r.ts)>=start);
      const r=corr(subset,key,outcomeKey);
      if(r===null)continue;
      windows.push({
        days,n:subset.filter(x=>finite(x[key])&&finite(x[outcomeKey])).length,
        correlation:r,
        absCorrelation:Math.abs(r),
        sameDirectionAsFull:signAgreement(r,full)
      });
    }
    if(!windows.length)continue;

    const recent=windows[0];
    const maxAbs=Math.max(...windows.map(w=>w.absCorrelation));
    const threshold=Math.max(0.015,maxAbs*0.55);
    const stable=windows.filter(w=>
      w.n>=30 &&
      w.absCorrelation>=threshold &&
      w.sameDirectionAsFull!==false
    );
    const recommended=stable.length
      ? stable.sort((a,b)=>a.days-b.days)[0]
      : windows.sort((a,b)=>b.absCorrelation-a.absCorrelation)[0];

    const long=windows.find(w=>w.days===90)||windows.at(-1);
    const short=windows.find(w=>w.days===7)||windows[0];
    const decay=long&&short&&long.absCorrelation>0
      ? short.absCorrelation/long.absCorrelation:null;

    let memoryClass="MID_MEMORY";
    if(recommended.days<=3)memoryClass="FAST_MEMORY";
    else if(recommended.days<=14)memoryClass="SHORT_MEMORY";
    else if(recommended.days<=30)memoryClass="MID_MEMORY";
    else memoryClass="LONG_MEMORY";

    let status="ACTIVE";
    if((recommended.n||0)<50)status="EARLY";
    if(short&&long&&short.sameDirectionAsFull===false)status="REGIME_CONFLICT";

    features.push({
      feature:key,
      fullCorrelation:full,
      fullAbsCorrelation:Math.abs(full),
      recommendedDays:recommended.days,
      recommendedSample:recommended.n,
      recommendedCorrelation:recommended.correlation,
      memoryClass,
      decayRatioShortVsLong:decay,
      status,
      windows:windows.sort((a,b)=>a.days-b.days)
    });
  }

  return{
    status:features.length?"ACTIVE":"LEARNING",
    version:ADAPTIVE_MEMORY_VERSION,
    n:xs.length,
    outcomeKey,
    features:features.sort((a,b)=>b.fullAbsCorrelation-a.fullAbsCorrelation),
    policy:{
      usage:"Research routing only. Memory horizons do not directly modify champion rules.",
      interpretation:"Recommended horizon is the shortest sampled window retaining at least 55% of the feature's strongest observed association with consistent sign."
    }
  };
}

export function memoryRoutingPlan(report){
  const out={FAST_MEMORY:[],SHORT_MEMORY:[],MID_MEMORY:[],LONG_MEMORY:[],CONFLICT:[]};
  for(const f of report?.features||[]){
    if(f.status==="REGIME_CONFLICT"){out.CONFLICT.push(f.feature);continue;}
    if(!out[f.memoryClass])out[f.memoryClass]=[];
    out[f.memoryClass].push(f.feature);
  }
  return out;
}
