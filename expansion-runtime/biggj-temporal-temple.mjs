export const BIGGJ_TEMPORAL_TEMPLE_VERSION='BIGGJ_TEMPORAL_TEMPLE_V1';

const HORIZON_ORDER=Object.freeze(['5m','15m','30m','1h','4h','12h','24h']);
const TRANSITION_PAIRS=Object.freeze([
  ['5m','15m'],['15m','30m'],['30m','1h'],['1h','4h'],['4h','12h'],['12h','24h']
]);

function finite(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,Number(v)||0));}
function mean(xs=[]){
  const a=xs.filter(Number.isFinite);
  return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
}
function median(xs=[]){
  const a=xs.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  if(!a.length)return null;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function ret(a,b){
  const x=finite(a),y=finite(b);
  return x>0&&y>0?y/x-1:null;
}
function rank(values=[]){
  const rows=values.map((v,i)=>({v,i})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>a.v-b.v);
  const out=new Array(values.length).fill(null);
  let i=0;
  while(i<rows.length){
    let j=i+1;
    while(j<rows.length&&rows[j].v===rows[i].v)j++;
    const r=(i+j-1)/2+1;
    for(let k=i;k<j;k++)out[rows[k].i]=r;
    i=j;
  }
  return out;
}
function pearson(xs=[],ys=[]){
  const rows=[];
  for(let i=0;i<Math.min(xs.length,ys.length);i++){
    if(Number.isFinite(xs[i])&&Number.isFinite(ys[i]))rows.push([xs[i],ys[i]]);
  }
  if(rows.length<3)return null;
  const mx=mean(rows.map(x=>x[0])),my=mean(rows.map(x=>x[1]));
  let num=0,dx=0,dy=0;
  for(const [x,y] of rows){
    const a=x-mx,b=y-my;
    num+=a*b;dx+=a*a;dy+=b*b;
  }
  return dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
}
function spearman(xs=[],ys=[]){
  return pearson(rank(xs),rank(ys));
}
function onTime(c,label){
  const o=c?.observations?.[label];
  return o?.quality==='ON_TIME'?o:null;
}
function casesOf(input){
  return Array.isArray(input?.cases)?input.cases:[];
}
function liqBin(v){
  const x=finite(v);
  if(x==null)return 'LIQ_UNKNOWN';
  if(x<25_000)return 'LIQ_LT25K';
  if(x<75_000)return 'LIQ_25_75K';
  if(x<250_000)return 'LIQ_75_250K';
  if(x<1_000_000)return 'LIQ_250K_1M';
  return 'LIQ_1MP';
}
function ratio(a,b){
  const x=finite(a),y=finite(b);
  return x!=null&&y>0?x/y:null;
}
function bit(v){return v===true?1:v===false?0:null;}

const AXES=Object.freeze([
  Object.freeze({id:'PRICE',label:'Price up vs discovery'}),
  Object.freeze({id:'LIQUIDITY',label:'Liquidity expanding'}),
  Object.freeze({id:'FLOW',label:'Buy pressure dominant'}),
  Object.freeze({id:'TURNOVER',label:'Turnover accelerating'}),
  Object.freeze({id:'MOMENTUM',label:'Short momentum positive'}),
  Object.freeze({id:'DEPTH',label:'Liquidity depth improving'})
]);

export function temporalStateForCase(c,label){
  const o=onTime(c,label);
  if(!o)return null;
  const i=c?.initial||{};
  const iTurn=ratio(i.volumeM5,i.liquidityUsd);
  const oTurn=ratio(o.volumeM5,o.liquidityUsd);
  const iDepth=ratio(i.liquidityUsd,i.marketCap);
  const oDepth=ratio(o.liquidityUsd,o.marketCap);
  const buys=finite(o.buysM5),sells=finite(o.sellsM5);
  const axes=[
    bit(finite(o.returnFromInitial)!=null?finite(o.returnFromInitial)>=0:null),
    bit(finite(i.liquidityUsd)!=null&&finite(o.liquidityUsd)!=null?o.liquidityUsd>=i.liquidityUsd*1.05:null),
    bit(buys!=null&&sells!=null?buys>=sells:null),
    bit(iTurn!=null&&oTurn!=null?oTurn>=iTurn*1.10:null),
    bit(finite(o.priceChangeM5)!=null?o.priceChangeM5>=0:null),
    bit(iDepth!=null&&oDepth!=null?oDepth>=iDepth*1.05:null)
  ];
  if(axes.some(x=>x==null))return null;
  const code=axes.reduce((n,x,idx)=>n|(x<<idx),0);
  const signed=axes.map(x=>x?1:-1);
  const alignment=Math.abs(signed.reduce((s,x)=>s+x,0))/signed.length;
  const direction=signed.reduce((s,x)=>s+x,0)>0?'EXPANSION':signed.reduce((s,x)=>s+x,0)<0?'CONTRACTION':'MIXED';
  return Object.freeze({
    horizon:label,
    code,
    stateId:'S'+String(code).padStart(2,'0'),
    axes:Object.freeze(Object.fromEntries(AXES.map((a,idx)=>[a.id,Boolean(axes[idx])]))),
    alignment,
    direction
  });
}

function nextReturn(c,fromLabel,toLabel){
  const a=onTime(c,fromLabel),b=onTime(c,toLabel);
  if(!a||!b)return null;
  return ret(a.priceUsd,b.priceUsd);
}

function transitionRows(cases){
  const rows=[];
  for(const c of cases){
    for(const [from,to] of TRANSITION_PAIRS){
      const s1=temporalStateForCase(c,from),s2=temporalStateForCase(c,to);
      if(!s1||!s2)continue;
      rows.push({
        caseKey:String(c?.key||''),
        chain:String(c?.chainId||'unknown'),
        from,to,
        fromState:s1.stateId,
        toState:s2.stateId,
        fromCode:s1.code,
        toCode:s2.code,
        alignment:s1.alignment,
        direction:s1.direction,
        stepReturn:nextReturn(c,from,to),
        discoveredAt:finite(c?.discoveredAt)
      });
    }
  }
  return rows;
}

function transitionAtlas(cases,{minSamples=4}={}){
  const rows=transitionRows(cases);
  const grouped=new Map();
  for(const r of rows){
    const k=[r.from,r.to,r.fromState,r.toState].join('|');
    const a=grouped.get(k)||[];a.push(r);grouped.set(k,a);
  }
  const top=[...grouped.entries()].map(([key,xs])=>({
    key,
    from:xs[0].from,to:xs[0].to,fromState:xs[0].fromState,toState:xs[0].toState,
    samples:xs.length,
    averageStepReturn:mean(xs.map(x=>x.stepReturn)),
    medianStepReturn:median(xs.map(x=>x.stepReturn)),
    positiveRate:xs.length?xs.filter(x=>finite(x.stepReturn)>0).length/xs.length:null
  })).sort((a,b)=>b.samples-a.samples||Math.abs(b.averageStepReturn||0)-Math.abs(a.averageStepReturn||0));

  const bySource=new Map();
  for(const r of rows){
    const k=[r.from,r.to,r.fromState].join('|');
    const a=bySource.get(k)||[];a.push(r);bySource.set(k,a);
  }
  const ephemeris=[];
  for(const [key,xs] of bySource){
    if(xs.length<minSamples)continue;
    const counts=new Map();
    for(const x of xs)counts.set(x.toState,(counts.get(x.toState)||0)+1);
    const next=[...counts.entries()].map(([state,count])=>({state,count,share:count/xs.length}))
      .sort((a,b)=>b.count-a.count||a.state.localeCompare(b.state));
    ephemeris.push({
      key,
      from:xs[0].from,to:xs[0].to,fromState:xs[0].fromState,
      samples:xs.length,
      nextStates:next.slice(0,4),
      averageStepReturn:mean(xs.map(x=>x.stepReturn)),
      medianStepReturn:median(xs.map(x=>x.stepReturn)),
      decisionAuthority:false
    });
  }
  ephemeris.sort((a,b)=>b.samples-a.samples);
  return {
    observedTransitions:rows.length,
    uniqueTransitions:grouped.size,
    topTransitions:top.slice(0,12),
    ephemeris:ephemeris.slice(0,12),
    status:ephemeris.length?'EMPIRICAL_TRANSITIONS_AVAILABLE':'COLLECTING',
    decisionAuthority:false
  };
}

const NILOMETER_FEATURES=Object.freeze([
  Object.freeze({id:'ageMinutes',read:c=>finite(c?.initial?.ageMinutes)}),
  Object.freeze({id:'logLiquidity',read:c=>{const x=finite(c?.initial?.liquidityUsd);return x>0?Math.log1p(x):null;}}),
  Object.freeze({id:'logMarketCap',read:c=>{const x=finite(c?.initial?.marketCap);return x>0?Math.log1p(x):null;}}),
  Object.freeze({id:'turnoverM5',read:c=>ratio(c?.initial?.volumeM5,c?.initial?.liquidityUsd)}),
  Object.freeze({id:'buySellRatio',read:c=>{const b=finite(c?.initial?.buysM5),s=finite(c?.initial?.sellsM5);return b!=null&&s!=null?Math.log((b+1)/(s+1)):null;}}),
  Object.freeze({id:'momentumM5',read:c=>finite(c?.initial?.priceChangeM5)}),
  Object.freeze({id:'socialPosts',read:c=>{const x=finite(c?.initial?.socialPosts);return x==null?null:Math.log1p(Math.max(0,x));}}),
  Object.freeze({id:'socialEngagement',read:c=>{const x=finite(c?.initial?.socialEngagement);return x==null?null:Math.log1p(Math.max(0,x));}}),
  Object.freeze({id:'holderTop10Share',read:c=>finite(c?.initial?.holderTop10Share)}),
  Object.freeze({id:'researchPriorityScore',read:c=>finite(c?.initial?.researchPriorityScore)}),
  Object.freeze({id:'liquidityDepth',read:c=>ratio(c?.initial?.liquidityUsd,c?.initial?.marketCap)})
]);

function horizonReturn(c,label){
  const o=onTime(c,label);
  return o?finite(o.returnFromInitial):null;
}

function nilometerScreen(cases,{horizon='1h',minTrain=20,minValidate=8}={}){
  const mature=cases.filter(c=>Number.isFinite(horizonReturn(c,horizon)))
    .sort((a,b)=>Number(a.discoveredAt||0)-Number(b.discoveredAt||0));
  if(mature.length<minTrain+minValidate){
    return {horizon,status:'INSUFFICIENT_SAMPLE',matureCases:mature.length,minTrain,minValidate,candidates:[]};
  }
  const split=Math.max(minTrain,Math.floor(mature.length*.7));
  const train=mature.slice(0,split),validate=mature.slice(split);
  const candidates=[];
  for(const f of NILOMETER_FEATURES){
    const tx=[],ty=[],vx=[],vy=[];
    for(const c of train){const x=f.read(c),y=horizonReturn(c,horizon);if(x!=null&&y!=null){tx.push(x);ty.push(y);}}
    for(const c of validate){const x=f.read(c),y=horizonReturn(c,horizon);if(x!=null&&y!=null){vx.push(x);vy.push(y);}}
    if(tx.length<minTrain||vx.length<minValidate)continue;
    const trainRho=spearman(tx,ty),validationRho=spearman(vx,vy);
    if(trainRho==null||validationRho==null)continue;
    const consistent=Math.sign(trainRho)!==0&&Math.sign(trainRho)===Math.sign(validationRho);
    const score=consistent?clamp(Math.sqrt(Math.abs(trainRho*validationRho))):0;
    candidates.push({
      featureId:f.id,
      trainSamples:tx.length,
      validationSamples:vx.length,
      trainRho,
      validationRho,
      direction:validationRho>0?'HIGHER_ASSOCIATED_WITH_HIGHER_RETURN':'HIGHER_ASSOCIATED_WITH_LOWER_RETURN',
      directionConsistent:consistent,
      informationScore:score,
      status:consistent&&Math.abs(validationRho)>=.20?'NILOMETER_CANDIDATE':'UNVALIDATED',
      decisionAuthority:false
    });
  }
  candidates.sort((a,b)=>b.informationScore-a.informationScore);
  return {
    horizon,
    status:candidates.some(x=>x.status==='NILOMETER_CANDIDATE')?'CANDIDATE_PROXIES_PRESENT':'NO_VALIDATED_PROXY',
    matureCases:mature.length,trainCases:train.length,validationCases:validate.length,
    minTrain,minValidate,candidates:candidates.slice(0,10),
    semantics:'SCREENING_ASSOCIATION_NOT_CAUSATION'
  };
}

function resonanceStudy(cases,{from='15m',to='1h',minSamples=8}={}){
  const rows=[];
  for(const c of cases){
    const s=temporalStateForCase(c,from),r=nextReturn(c,from,to);
    if(!s||r==null)continue;
    rows.push({alignment:s.alignment,direction:s.direction,return:r});
  }
  const high=rows.filter(x=>x.alignment>=2/3);
  const expansion=high.filter(x=>x.direction==='EXPANSION');
  const contraction=high.filter(x=>x.direction==='CONTRACTION');
  const stats=xs=>({
    samples:xs.length,
    averageReturn:mean(xs.map(x=>x.return)),
    medianReturn:median(xs.map(x=>x.return)),
    positiveRate:xs.length?xs.filter(x=>x.return>0).length/xs.length:null,
    severeLossRate:xs.length?xs.filter(x=>x.return<=-.45).length/xs.length:null
  });
  return {
    from,to,eligible:rows.length,
    highAlignment:stats(high),
    expansion:stats(expansion),
    contraction:stats(contraction),
    status:high.length>=minSamples?'RESONANCE_SAMPLE_AVAILABLE':'INSUFFICIENT_SAMPLE',
    minSamples,
    semantics:'CROSS_AXIS_SYNCHRONY_NOT_MYSTICAL_FREQUENCY',
    decisionAuthority:false
  };
}

function firstMilestone(c,predicate){
  for(const label of HORIZON_ORDER){
    const o=onTime(c,label);
    if(o&&predicate(o,c))return {label,elapsedMs:finite(o.elapsedMs),observedAt:finite(o.observedAt)};
  }
  return null;
}
function eventClock(cases){
  const defs=[
    ['PRICE_PLUS_25',(o)=>finite(o.returnFromInitial)!=null&&o.returnFromInitial>=.25],
    ['PRICE_MINUS_25',(o)=>finite(o.returnFromInitial)!=null&&o.returnFromInitial<=-.25],
    ['LIQ_PLUS_25',(o,c)=>finite(o.liquidityUsd)!=null&&finite(c?.initial?.liquidityUsd)>0&&o.liquidityUsd>=c.initial.liquidityUsd*1.25],
    ['LIQ_MINUS_25',(o,c)=>finite(o.liquidityUsd)!=null&&finite(c?.initial?.liquidityUsd)>0&&o.liquidityUsd<=c.initial.liquidityUsd*.75],
    ['BUY_PRESSURE_2X',(o)=>{const b=finite(o.buysM5),s=finite(o.sellsM5);return b!=null&&s!=null&&b>=2*Math.max(1,s);}],
    ['SELL_PRESSURE_2X',(o)=>{const b=finite(o.buysM5),s=finite(o.sellsM5);return b!=null&&s!=null&&s>=2*Math.max(1,b);}],
    ['TURNOVER_2X',(o,c)=>{
      const a=ratio(c?.initial?.volumeM5,c?.initial?.liquidityUsd),b=ratio(o?.volumeM5,o?.liquidityUsd);
      return a!=null&&b!=null&&b>=a*2;
    }]
  ];
  const milestones=[];
  for(const [id,pred] of defs){
    const hits=cases.map(c=>firstMilestone(c,pred)).filter(Boolean);
    milestones.push({
      id,
      cases:hits.length,
      share:cases.length?hits.length/cases.length:null,
      medianElapsedMs:median(hits.map(x=>x.elapsedMs)),
      earliestElapsedMs:hits.length?Math.min(...hits.map(x=>x.elapsedMs).filter(Number.isFinite)):null
    });
  }
  milestones.sort((a,b)=>b.cases-a.cases);
  return {
    observedCases:cases.length,
    milestones,
    semantics:'EVENT_TIME_MEASURED_FROM_DISCOVERY_NOT_WALL_CLOCK'
  };
}

function scaleInvariantCandidates(cases,{from='15m',to='1h',minPerContext=4,minContexts=2}={}){
  const byState=new Map();
  for(const c of cases){
    const s=temporalStateForCase(c,from),r=nextReturn(c,from,to);
    if(!s||r==null)continue;
    const context=[String(c?.chainId||'unknown'),liqBin(c?.initial?.liquidityUsd)].join('|');
    const state=byState.get(s.stateId)||new Map();
    const rows=state.get(context)||[];
    rows.push(r);state.set(context,rows);byState.set(s.stateId,state);
  }
  const out=[];
  for(const [stateId,contexts] of byState){
    const eligible=[...contexts.entries()].map(([context,returns])=>({
      context,samples:returns.length,averageReturn:mean(returns),medianReturn:median(returns)
    })).filter(x=>x.samples>=minPerContext&&x.averageReturn!=null);
    if(eligible.length<minContexts)continue;
    const signs=new Set(eligible.map(x=>Math.sign(x.averageReturn)).filter(x=>x!==0));
    const invariant=signs.size===1;
    out.push({
      stateId,
      contexts:eligible.length,
      samples:eligible.reduce((s,x)=>s+x.samples,0),
      direction:invariant?(eligible[0].averageReturn>0?'POSITIVE':'NEGATIVE'):'MIXED',
      invariant,
      contextStats:eligible.slice(0,8),
      status:invariant?'SCALE_INVARIANT_CANDIDATE':'CONTEXT_DEPENDENT',
      decisionAuthority:false
    });
  }
  out.sort((a,b)=>{
    if(a.invariant!==b.invariant)return a.invariant?-1:1;
    return b.samples-a.samples;
  });
  return {
    from,to,status:out.some(x=>x.invariant)?'INVARIANT_CANDIDATES_PRESENT':'COLLECTING',
    candidates:out.slice(0,10),
    semantics:'SAME_STATE_ACROSS_CHAIN_LIQUIDITY_CONTEXTS'
  };
}

export function buildBiggjTemporalTemple(evidenceState,{
  asOf=Date.now(),
  minNilometerTrain=20,
  minNilometerValidate=8,
  minEphemerisSamples=4,
  minResonanceSamples=8,
  minInvariantPerContext=4,
  minInvariantContexts=2
}={}){
  const cases=casesOf(evidenceState);
  const lattice=transitionAtlas(cases,{minSamples:minEphemerisSamples});
  const nilometers1h=nilometerScreen(cases,{horizon:'1h',minTrain:minNilometerTrain,minValidate:minNilometerValidate});
  const nilometers4h=nilometerScreen(cases,{horizon:'4h',minTrain:minNilometerTrain,minValidate:minNilometerValidate});
  const resonance15m1h=resonanceStudy(cases,{from:'15m',to:'1h',minSamples:minResonanceSamples});
  const resonance30m4h=resonanceStudy(cases,{from:'30m',to:'4h',minSamples:minResonanceSamples});
  const invariants=scaleInvariantCandidates(cases,{
    from:'15m',to:'1h',minPerContext:minInvariantPerContext,minContexts:minInvariantContexts
  });
  const core={
    version:BIGGJ_TEMPORAL_TEMPLE_VERSION,
    asOf:Number(asOf),
    independentCases:cases.length,
    architecture:{
      ledger:'IMMUTABLE_PIT_EVIDENCE',
      nilometer:'HIGH_INFORMATION_SYSTEM_PROXIES',
      antikythera:'CROSS_AXIS_PHASE_ALIGNMENT',
      bookOfChanges:'64_STATE_TRANSITION_LATTICE',
      eventClock:'MEANINGFUL_EVENTS_OVER_WALL_CLOCK',
      invariants:'SCALE_CONTEXT_STABILITY',
      ephemeris:'EMPIRICAL_NEXT_STATE_DISTRIBUTION'
    },
    axes:AXES,
    eventClock:eventClock(cases),
    bookOfChanges:lattice,
    nilometers:{oneHour:nilometers1h,fourHour:nilometers4h},
    resonance:{fifteenMinToOneHour:resonance15m1h,thirtyMinToFourHour:resonance30m4h},
    invariants,
    ephemeris:{
      rows:lattice.ephemeris,
      status:lattice.ephemeris.length?'EMPIRICAL_ONLY':'COLLECTING',
      semantics:'NEXT_STATE_FREQUENCIES_NOT_DETERMINISTIC_FORECASTS'
    },
    policyMutationAllowed:false,
    automaticPromotionAllowed:false,
    execution:'SHADOW_ONLY',
    canExecuteLive:false,
    epistemic:'ANCIENT_INSPIRED_MODERN_EMPIRICAL_RESEARCH_NO_NUMEROLOGY'
  };
  return Object.freeze(core);
}

export function biggjTemporalTempleSummary(state){
  if(state?.version!==BIGGJ_TEMPORAL_TEMPLE_VERSION)throw new Error('BIGGJ_TEMPORAL_TEMPLE_INVALID');
  return Object.freeze({
    version:state.version,
    asOf:state.asOf,
    independentCases:state.independentCases,
    eventClock:state.eventClock,
    bookOfChanges:{
      observedTransitions:state.bookOfChanges?.observedTransitions||0,
      uniqueTransitions:state.bookOfChanges?.uniqueTransitions||0,
      status:state.bookOfChanges?.status||'COLLECTING',
      topTransitions:state.bookOfChanges?.topTransitions||[]
    },
    nilometers:state.nilometers,
    resonance:state.resonance,
    invariants:state.invariants,
    ephemeris:state.ephemeris,
    policyMutationAllowed:false,
    automaticPromotionAllowed:false,
    execution:'SHADOW_ONLY',
    canExecuteLive:false
  });
}
