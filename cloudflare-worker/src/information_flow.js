function finite(x){return Number.isFinite(Number(x));}
function mean(xs){const v=(xs||[]).map(Number).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
function std(xs){const v=(xs||[]).map(Number).filter(Number.isFinite);if(v.length<2)return null;const m=mean(v);return Math.sqrt(v.reduce((s,x)=>s+(x-m)*(x-m),0)/(v.length-1));}
function corr(xs,ys){
  const p=[];for(let i=0;i<Math.min(xs.length,ys.length);i++){const x=Number(xs[i]),y=Number(ys[i]);if(Number.isFinite(x)&&Number.isFinite(y))p.push([x,y]);}
  if(p.length<20)return null;
  const mx=mean(p.map(z=>z[0])),my=mean(p.map(z=>z[1]));let num=0,dx=0,dy=0;
  for(const [x,y] of p){const a=x-mx,b=y-my;num+=a*b;dx+=a*a;dy+=b*b;}
  return dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
}
function quantile(xs,q){
  const v=(xs||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length)return null;return v[Math.max(0,Math.min(v.length-1,Math.floor((v.length-1)*q)))];
}
function discretize(values){
  const lo=quantile(values,.33),hi=quantile(values,.67);
  return values.map(v=>{
    const x=Number(v);if(!Number.isFinite(x))return null;
    return x<=lo?0:x>=hi?2:1;
  });
}
function mutualInfo(x,y){
  const pairs=[];for(let i=0;i<Math.min(x.length,y.length);i++)if(Number.isInteger(x[i])&&Number.isInteger(y[i]))pairs.push([x[i],y[i]]);
  if(pairs.length<30)return null;
  const cx=new Map(),cy=new Map(),cxy=new Map();
  for(const [a,b] of pairs){
    cx.set(a,(cx.get(a)||0)+1);cy.set(b,(cy.get(b)||0)+1);
    const k=a+"|"+b;cxy.set(k,(cxy.get(k)||0)+1);
  }
  let mi=0;const n=pairs.length;
  for(const [k,count] of cxy){
    const [a,b]=k.split("|").map(Number);
    const pxy=count/n,px=(cx.get(a)||0)/n,py=(cy.get(b)||0)/n;
    if(pxy>0&&px>0&&py>0)mi+=pxy*Math.log2(pxy/(px*py));
  }
  return mi;
}
function lagPairs(rows,source,target,lagSteps){
  const xs=[],ys=[];
  for(let i=0;i+lagSteps<rows.length;i++){
    const x=Number(rows[i]?.[source]),y=Number(rows[i+lagSteps]?.[target]);
    if(Number.isFinite(x)&&Number.isFinite(y)){xs.push(x);ys.push(y);}
  }
  return{xs,ys};
}

export function buildInformationFlowGraph(rows,features,target="ret_15m",lags=[1,2,3,6,12]){
  const xs=[...(rows||[])].filter(r=>finite(r.ts)).sort((a,b)=>Number(a.ts)-Number(b.ts));
  const edges=[];
  for(const feature of features){
    if(feature===target)continue;
    const sourceVals=xs.map(r=>Number(r?.[feature])).filter(Number.isFinite);
    if(sourceVals.length<50)continue;
    for(const lagSteps of lags){
      const p=lagPairs(xs,feature,target,lagSteps);
      if(p.xs.length<40)continue;
      const r=corr(p.xs,p.ys);
      const dx=discretize(p.xs),dy=discretize(p.ys);
      const mi=mutualInfo(dx,dy);
      const strength=(Math.abs(r||0)*0.55)+(Math.min(0.2,mi||0)/0.2*0.45);
      edges.push({
        source:feature,target,lagSteps,n:p.xs.length,
        correlation:r,mutualInformationBits:mi,
        direction:r===null?"UNKNOWN":r>0?"SAME":"OPPOSITE",
        strength,
        status:p.xs.length>=100&&strength>=0.12?"ACTIVE_EDGE":"WEAK"
      });
    }
  }

  const bestBySource=[];
  for(const feature of features){
    const es=edges.filter(e=>e.source===feature).sort((a,b)=>b.strength-a.strength);
    if(es.length)bestBySource.push(es[0]);
  }
  bestBySource.sort((a,b)=>b.strength-a.strength);

  const leaders=bestBySource.filter(x=>x.status==="ACTIVE_EDGE").slice(0,12);
  const concentration=leaders.length
    ? leaders.slice(0,3).reduce((s,x)=>s+x.strength,0)/Math.max(1e-9,leaders.reduce((s,x)=>s+x.strength,0))
    : null;

  return{
    status:xs.length>=120?"ACTIVE":"LEARNING",
    rows:xs.length,
    target,
    edges:edges.sort((a,b)=>b.strength-a.strength),
    leaders,
    leaderConcentration:concentration,
    dominantLeader:leaders[0]||null,
    note:"Edges measure time-lagged association and information, not causality."
  };
}

export function graphRegime(graph){
  const leaders=graph?.leaders||[];
  if(!leaders.length)return{status:"UNKNOWN",score:null};
  const total=leaders.reduce((s,x)=>s+Number(x.strength||0),0);
  const top=Number(leaders[0]?.strength||0);
  const concentration=total>0?top/total:0;
  return{
    status:concentration>=0.45?"SINGLE_LEADER":concentration>=0.25?"CONCENTRATED":"DISTRIBUTED",
    score:concentration,
    leader:leaders[0]?.source||null
  };
}
