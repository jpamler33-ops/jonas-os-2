function clamp(x,a=0,b=1){ return Math.max(a,Math.min(b,x)); }

class Ring {
  constructor(limit=500){ this.limit=Math.max(10,Number(limit)||500); this.items=[]; }
  push(v){ this.items.push(v); if(this.items.length>this.limit) this.items.splice(0,this.items.length-this.limit); }
  values(){ return [...this.items]; }
}

function pct(values,p){
  const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length) return null;
  const i=(xs.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
  return lo===hi?xs[lo]:xs[lo]+(xs[hi]-xs[lo])*(i-lo);
}
function mean(values){
  const xs=values.filter(Number.isFinite);
  return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
}

export function createObservability({sampleLimit=500}={}){
  return {
    version:'OBS_V1',
    startedAt:Date.now(),
    counters:new Map(),
    providers:new Map(),
    operations:new Map(),
    safety:{
      current:'UNKNOWN',
      transitions:[],
      counts:new Map()
    },
    research:{
      evidence:new Ring(sampleLimit),
      novelty:new Ring(sampleLimit),
      contradiction:new Ring(sampleLimit),
      witnessAgreement:new Ring(sampleLimit),
      primaryAgeMs:new Ring(sampleLimit)
    },
    errors:new Ring(sampleLimit),
    sampleLimit
  };
}

function inc(map,key,by=1){ map.set(key,(map.get(key)||0)+by); }

export function recordCounter(obs,key,by=1){
  inc(obs.counters,String(key),Number(by)||0);
}

export function recordProviderCall(obs,{provider,ok,latencyMs,status=null,error=null,at=Date.now()}){
  const key=String(provider||'UNKNOWN').toUpperCase();
  if(!obs.providers.has(key)){
    obs.providers.set(key,{calls:0,success:0,failure:0,latency:new Ring(obs.sampleLimit),lastStatus:null,lastError:null,lastAt:null});
  }
  const p=obs.providers.get(key);
  p.calls++;
  if(ok) p.success++; else p.failure++;
  if(Number.isFinite(Number(latencyMs))) p.latency.push(Number(latencyMs));
  p.lastStatus=status;
  p.lastError=error?String(error).slice(0,240):null;
  p.lastAt=Number(at);
}

export function recordOperation(obs,{name,ok=true,latencyMs=null,error=null,at=Date.now()}){
  const key=String(name||'UNKNOWN');
  if(!obs.operations.has(key)){
    obs.operations.set(key,{calls:0,success:0,failure:0,latency:new Ring(obs.sampleLimit),lastError:null,lastAt:null});
  }
  const op=obs.operations.get(key);
  op.calls++;
  if(ok) op.success++; else op.failure++;
  if(Number.isFinite(Number(latencyMs))) op.latency.push(Number(latencyMs));
  op.lastError=error?String(error).slice(0,240):null;
  op.lastAt=Number(at);
}

export function recordSafety(obs,state,{hardReasons=[],softReasons=[],at=Date.now()}={}){
  const next=String(state||'UNKNOWN');
  inc(obs.safety.counts,next,1);
  if(obs.safety.current!==next){
    obs.safety.transitions.push({
      at:Number(at),
      from:obs.safety.current,
      to:next,
      hardReasons:[...hardReasons].map(String),
      softReasons:[...softReasons].map(String)
    });
    if(obs.safety.transitions.length>100) obs.safety.transitions.splice(0,obs.safety.transitions.length-100);
    obs.safety.current=next;
  }
}

export function recordResearchTelemetry(obs,{evidenceStrength,novelty,contradiction,witnessAgreement,primaryAgeMs}={}){
  if(Number.isFinite(Number(evidenceStrength))) obs.research.evidence.push(Number(evidenceStrength));
  if(Number.isFinite(Number(novelty))) obs.research.novelty.push(Number(novelty));
  if(Number.isFinite(Number(contradiction))) obs.research.contradiction.push(Number(contradiction));
  if(Number.isFinite(Number(witnessAgreement))) obs.research.witnessAgreement.push(Number(witnessAgreement));
  if(Number.isFinite(Number(primaryAgeMs))) obs.research.primaryAgeMs.push(Number(primaryAgeMs));
}

export function recordError(obs,{scope,message,at=Date.now()}){
  obs.errors.push({at:Number(at),scope:String(scope||'UNKNOWN'),message:String(message||'').slice(0,300)});
  recordCounter(obs,'errors.total',1);
  recordCounter(obs,`errors.${String(scope||'UNKNOWN')}`,1);
}

function latencyStats(ring){
  const xs=ring?.values?.()||[];
  return {
    n:xs.length,
    meanMs:mean(xs),
    p50Ms:pct(xs,0.50),
    p95Ms:pct(xs,0.95),
    p99Ms:pct(xs,0.99),
    maxMs:xs.length?Math.max(...xs):null
  };
}

export function observabilitySnapshot(obs,{now=Date.now()}={}){
  const providers={};
  for(const [k,v] of obs.providers){
    providers[k]={
      calls:v.calls,
      success:v.success,
      failure:v.failure,
      successRate:v.calls?v.success/v.calls:null,
      latency:latencyStats(v.latency),
      lastStatus:v.lastStatus,
      lastError:v.lastError,
      lastAt:v.lastAt
    };
  }
  const operations={};
  for(const [k,v] of obs.operations){
    operations[k]={
      calls:v.calls,
      success:v.success,
      failure:v.failure,
      successRate:v.calls?v.success/v.calls:null,
      latency:latencyStats(v.latency),
      lastError:v.lastError,
      lastAt:v.lastAt
    };
  }
  const research={};
  for(const [name,ring] of Object.entries(obs.research)){
    const xs=ring.values();
    research[name]={
      n:xs.length,
      mean:mean(xs),
      p50:pct(xs,0.5),
      p95:pct(xs,0.95),
      max:xs.length?Math.max(...xs):null
    };
  }
  return {
    version:obs.version,
    now:Number(now),
    uptimeMs:Math.max(0,Number(now)-obs.startedAt),
    counters:Object.fromEntries([...obs.counters.entries()].sort(([a],[b])=>a.localeCompare(b))),
    providers,
    operations,
    safety:{
      current:obs.safety.current,
      counts:Object.fromEntries(obs.safety.counts),
      transitions:[...obs.safety.transitions]
    },
    research,
    recentErrors:obs.errors.values().slice(-20)
  };
}

export function deriveSloHealth(snapshot,{
  providerSuccessFloor=0.95,
  providerP95Ms=3000,
  operationSuccessFloor=0.95,
  operationP95Ms=5000,
  minimumSamples=5
}={}){
  const breaches=[];
  const min=Math.max(1,Math.floor(Number(minimumSamples)||5));
  for(const [name,p] of Object.entries(snapshot?.providers||{})){
    if(p.calls>=min && p.successRate!=null && p.successRate<providerSuccessFloor) breaches.push(`PROVIDER_SUCCESS_${name}`);
    if(p.latency?.n>=min && p.latency.p95Ms>providerP95Ms) breaches.push(`PROVIDER_LATENCY_${name}`);
  }
  for(const [name,op] of Object.entries(snapshot?.operations||{})){
    if(op.calls>=min && op.successRate!=null && op.successRate<operationSuccessFloor) breaches.push(`OPERATION_SUCCESS_${name}`);
    if(op.latency?.n>=min && op.latency.p95Ms>operationP95Ms) breaches.push(`OPERATION_LATENCY_${name}`);
  }
  return {
    ok:breaches.length===0,
    breaches:[...new Set(breaches)],
    state:snapshot?.safety?.current||'UNKNOWN',
    thresholds:{
      providerSuccessFloor,
      providerP95Ms,
      operationSuccessFloor,
      operationP95Ms,
      minimumSamples:min
    }
  };
}

export const OBSERVABILITY_VERSION='OBS_V1';
