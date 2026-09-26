export function mean(xs) {
  const v=(xs||[]).map(Number).filter(Number.isFinite);
  return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
}

export function median(xs) {
  const v=(xs||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length) return null;
  const i=Math.floor(v.length/2);
  return v.length%2?v[i]:(v[i-1]+v[i])/2;
}

export function wilsonInterval(wins,total,z=1.96) {
  const n=Number(total), w=Number(wins);
  if(!(n>0)) return {low:null,high:null,p:null};
  const p=w/n, z2=z*z;
  const denom=1+z2/n;
  const center=(p+z2/(2*n))/denom;
  const margin=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/denom;
  return {p,low:Math.max(0,center-margin),high:Math.min(1,center+margin)};
}

export function costAdjustedR(setup, roundTripBps) {
  const entry=Number(setup.entry), stop=Number(setup.stop);
  const gross=Number(setup.realized_r);
  if(!Number.isFinite(entry)||!Number.isFinite(stop)||!Number.isFinite(gross)||entry<=0) return null;
  const riskPct=Math.abs(entry-stop)/entry;
  if(!(riskPct>0)) return null;
  const costPct=Number(roundTripBps)/10000;
  return gross-costPct/riskPct;
}

export function chronologicalBuckets(rows, buckets=4) {
  const xs=[...(rows||[])].sort((a,b)=>Number(a.opened_ts??a.ts)-Number(b.opened_ts??b.ts));
  if(!xs.length) return [];
  const size=Math.ceil(xs.length/buckets);
  const out=[];
  for(let i=0;i<xs.length;i+=size) out.push(xs.slice(i,i+size));
  return out;
}

export function numericFeatureContrast(rows, key, outcomeKey="ret_fwd_60m") {
  const valid=(rows||[]).filter(r=>Number.isFinite(Number(r[key]))&&Number.isFinite(Number(r[outcomeKey])));
  if(valid.length<20) return null;
  const med=median(valid.map(r=>Number(r[key])));
  const lo=valid.filter(r=>Number(r[key])<=med);
  const hi=valid.filter(r=>Number(r[key])>med);
  if(lo.length<8||hi.length<8) return null;
  const loMean=mean(lo.map(r=>Number(r[outcomeKey])));
  const hiMean=mean(hi.map(r=>Number(r[outcomeKey])));
  return {
    feature:key,median:med,
    lowN:lo.length,highN:hi.length,
    lowMean:loMean,highMean:hiMean,
    difference:(hiMean??0)-(loMean??0)
  };
}

export function categoricalFeatureContrast(rows, key, outcomeKey="ret_fwd_60m") {
  const groups=new Map();
  for(const r of rows||[]){
    const k=r[key];
    const y=Number(r[outcomeKey]);
    if(k===null||k===undefined||!Number.isFinite(y)) continue;
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k).push(y);
  }
  return [...groups.entries()]
    .filter(([,v])=>v.length>=8)
    .map(([value,v])=>({feature:key,value,n:v.length,mean:mean(v)}))
    .sort((a,b)=>Math.abs(b.mean||0)-Math.abs(a.mean||0));
}

export function buildHypotheses(genomes) {
  const numeric=[
    "volume_ratio","oi_change","funding_rate","long_short_ratio","liq_5m",
    "liq_imbalance","cross_ret_60m","flow_delta_ratio","spread_bps",
    "book_imbalance","agreement","entropy","novelty"
  ];
  const findings=[];
  for(const key of numeric){
    const x=numericFeatureContrast(genomes,key,"ret_fwd_60m");
    if(!x) continue;
    const magnitude=Math.abs(Number(x.difference||0));
    findings.push({
      kind:"NUMERIC_CONTRAST",
      feature:key,
      sample:x.lowN+x.highN,
      effect60m:x.difference,
      strength:magnitude,
      statement:`High vs low ${key}: forward-60m mean difference ${(x.difference*100).toFixed(3)}pp`,
      status:"RESEARCH_ONLY"
    });
  }
  return findings.sort((a,b)=>b.strength-a.strength);
}

export function transitionMatrix(rows) {
  const xs=[...(rows||[])].sort((a,b)=>Number(a.ts)-Number(b.ts));
  const m=new Map();
  for(let i=0;i<xs.length-1;i++){
    const a=xs[i]?.state_label,b=xs[i+1]?.state_label;
    if(!a||!b) continue;
    const key=`${a} -> ${b}`;
    const cur=m.get(key)||{from:a,to:b,n:0,ret60:[]};
    cur.n++;
    const y=Number(xs[i+1]?.ret_fwd_60m);
    if(Number.isFinite(y)) cur.ret60.push(y);
    m.set(key,cur);
  }
  return [...m.values()].map(x=>({
    from:x.from,to:x.to,n:x.n,avgForward60m:mean(x.ret60)
  })).sort((a,b)=>b.n-a.n);
}

export function sequenceDNA(events, maxLen=5) {
  const xs=[...(events||[])].sort((a,b)=>Number(a.ts)-Number(b.ts));
  const counts=new Map();
  for(let i=maxLen-1;i<xs.length;i++){
    const seq=xs.slice(i-maxLen+1,i+1).map(e=>`${e.event_type}:${e.subtype||"-"}`).join(">");
    counts.set(seq,(counts.get(seq)||0)+1);
  }
  return [...counts.entries()].map(([sequence,n])=>({sequence,n}))
    .sort((a,b)=>b.n-a.n);
}

export function decayWindows(rows, now=Date.now()) {
  const windows=[
    {name:"LAST_7D",start:now-7*86400000,end:now},
    {name:"PREV_7D",start:now-14*86400000,end:now-7*86400000},
    {name:"LAST_30D",start:now-30*86400000,end:now},
    {name:"PREV_30D",start:now-60*86400000,end:now-30*86400000}
  ];
  return windows.map(w=>{
    const xs=(rows||[]).filter(r=>{
      const t=Number(r.opened_ts??r.ts);
      return t>=w.start&&t<w.end;
    });
    return {name:w.name,n:xs.length,avgR:mean(xs.map(r=>Number(r.realized_r)).filter(Number.isFinite))};
  });
}
