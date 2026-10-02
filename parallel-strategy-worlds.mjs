import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';

export const PARALLEL_STRATEGY_WORLDS_VERSION='BIGGJ_PARALLEL_STRATEGY_WORLDS_V1';
export const PARALLEL_STRATEGY_WORLDS_SCHEMA_VERSION=1;

const HORIZON_MODES=Object.freeze(['SHORTEST','MAX_EDGE','MAX_RETURN','LONGEST']);
const PROFILE_FIELDS=Object.freeze([
  'minExpectedReturn',
  'minDirectionalProbability',
  'minProbabilityEdge',
  'horizonSelection'
]);

const WORLD_DOCTRINES=Object.freeze({
  SCOUT:Object.freeze({
    name:'Frontier Scout',
    mission:'Find earlier usable entries without letting weak evidence leak into PRIMARY.',
    axes:['minExpectedReturn','minProbabilityEdge','horizonSelection','minDirectionalProbability']
  }),
  BALANCED:Object.freeze({
    name:'Balanced Explorer',
    mission:'Search for robust opportunity density without optimizing one metric alone.',
    axes:['minDirectionalProbability','minExpectedReturn','horizonSelection','minProbabilityEdge']
  }),
  DEFENSIVE:Object.freeze({
    name:'Robustness World',
    mission:'Prefer stability, drawdown control and stronger admission evidence.',
    axes:['minDirectionalProbability','minProbabilityEdge','minExpectedReturn','horizonSelection']
  }),
  EDGE_HUNTER:Object.freeze({
    name:'Edge World',
    mission:'Search for stronger probability-edge filters and regime-specific selectivity.',
    axes:['minProbabilityEdge','minDirectionalProbability','horizonSelection','minExpectedReturn']
  }),
  RETURN_HUNTER:Object.freeze({
    name:'Return World',
    mission:'Search for return-quality improvements without relaxing scientific guards.',
    axes:['minExpectedReturn','horizonSelection','minDirectionalProbability','minProbabilityEdge']
  }),
  LONG_VIEW:Object.freeze({
    name:'Long-Horizon World',
    mission:'Search for slower structures and horizon transfer that survive forward evidence.',
    axes:['horizonSelection','minExpectedReturn','minDirectionalProbability','minProbabilityEdge']
  }),
  MEME_SPECIALIST:Object.freeze({
    name:'Meme Microstructure World',
    mission:'Search for early meme opportunity while keeping integrity/liquidity evidence separate.',
    axes:['minProbabilityEdge','minExpectedReturn','minDirectionalProbability','horizonSelection']
  })
});

function finite(v,fallback=null){
  if(v===null||v===undefined||v==='') return fallback;
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,Number(v))); }
function clone(v){ return structuredClone(v); }
function profileOf(base={}){
  return {
    horizonSelection:HORIZON_MODES.includes(String(base.horizonSelection))?String(base.horizonSelection):'MAX_EDGE',
    minExpectedReturn:clamp(finite(base.minExpectedReturn,.003),.0008,.02),
    minDirectionalProbability:clamp(finite(base.minDirectionalProbability,.58),.52,.78),
    minProbabilityEdge:clamp(finite(base.minProbabilityEdge,.10),.04,.35),
    notionalMultiplier:clamp(finite(base.notionalMultiplier,.5),.10,1.25),
    assetClasses:Array.isArray(base.assetClasses)?[...new Set(base.assetClasses.map(x=>String(x).toUpperCase()))]:['CORE']
  };
}
function genomeId(strategyId,generation,profile,parentGenomeId=null){
  return 'wg_'+sha256({
    version:PARALLEL_STRATEGY_WORLDS_VERSION,
    strategyId:String(strategyId),
    generation:Number(generation),
    profile,
    parentGenomeId
  }).slice(0,24);
}
function worldForBase(base,{now}={}){
  const strategyId=String(base?.id||'').toUpperCase();
  if(!strategyId) throw new Error('strategy id required');
  const profile=profileOf(base);
  const generation=1;
  const id=genomeId(strategyId,generation,profile,null);
  return {
    worldId:'WORLD_'+strategyId,
    strategyId,
    label:String(base?.label||strategyId),
    doctrine:clone(WORLD_DOCTRINES[strategyId]||{
      name:'Independent Strategy World',
      mission:'Run an isolated one-factor strategy search under forward shadow evidence.',
      axes:[...PROFILE_FIELDS]
    }),
    generation,
    currentGenome:{
      genomeId:id,
      parentGenomeId:null,
      generation,
      profile,
      mutation:null,
      createdAt:Number(now),
      dataCutoffClosedAt:null,
      status:'MEASURING',
      evidence:{closed:0,wins:0,winRate:null,meanReturn:null,expectancyQuote:null,maxDrawdownPct:null,symbols:0}
    },
    history:[],
    evolutionCount:0,
    lastEvolutionAt:null
  };
}

export function createParallelStrategyWorlds(baseStrategies,{now=Date.now()}={}){
  const t=finite(now);
  if(t==null) throw new Error('now must be finite');
  const bases=(Array.isArray(baseStrategies)?baseStrategies:[]).filter(x=>x?.id);
  if(!bases.length) throw new Error('base strategies required');
  return {
    schemaVersion:PARALLEL_STRATEGY_WORLDS_SCHEMA_VERSION,
    version:PARALLEL_STRATEGY_WORLDS_VERSION,
    createdAt:t,
    updatedAt:t,
    worlds:bases.map(base=>worldForBase(base,{now:t})),
    council:{
      status:'PARALLEL_EXPLORATION',
      worldCount:bases.length,
      activeWorlds:bases.length,
      mutationDiversity:0,
      convergences:[],
      crossPollination:[],
      meaning:'INDEPENDENT_SHADOW_RESEARCH_WORLDS_NOT_PRIMARY_POLICY'
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticPromotion:false
  };
}

function closedForGenome(positions,strategyId,genomeId){
  return (Array.isArray(positions)?positions:[])
    .filter(p=>
      p&&p.status==='CLOSED'&&
      p.execution==='SHADOW_ONLY'&&p.canExecuteLive===false&&
      String(p.leagueStrategyId||'')===String(strategyId)&&
      String(p.leagueGenomeId||'')===String(genomeId)&&
      finite(p.realizedReturnPct)!=null&&finite(p.realizedNetPnlQuote)!=null
    )
    .sort((a,b)=>Number(a.closedAt||0)-Number(b.closedAt||0));
}
function metrics(rows){
  const xs=Array.isArray(rows)?rows:[];
  if(!xs.length) return {
    closed:0,wins:0,winRate:null,meanReturn:null,expectancyQuote:null,
    maxDrawdownPct:null,symbols:0,firstClosedAt:null,lastClosedAt:null
  };
  const wins=xs.filter(x=>Number(x.realizedNetPnlQuote)>0).length;
  const meanReturn=xs.reduce((s,x)=>s+Number(x.realizedReturnPct),0)/xs.length;
  const expectancyQuote=xs.reduce((s,x)=>s+Number(x.realizedNetPnlQuote),0)/xs.length;
  let equity=1,peak=1,maxDd=0;
  for(const x of xs){
    equity*=Math.max(.01,1+Number(x.realizedReturnPct));
    peak=Math.max(peak,equity);
    maxDd=Math.max(maxDd,peak>0?(peak-equity)/peak:0);
  }
  return {
    closed:xs.length,
    wins,
    winRate:wins/xs.length,
    meanReturn,
    expectancyQuote,
    maxDrawdownPct:maxDd,
    symbols:new Set(xs.map(x=>String(x.symbol||'UNKNOWN'))).size,
    firstClosedAt:Number(xs[0]?.closedAt||0)||null,
    lastClosedAt:Number(xs.at(-1)?.closedAt||0)||null
  };
}
function directionForEvidence(m){
  if(!m||m.closed<=0) return 'HOLD';
  if(Number(m.meanReturn)<0||Number(m.winRate)<.46||Number(m.maxDrawdownPct)>.18) return 'TIGHTEN';
  if(Number(m.meanReturn)>.0025&&Number(m.winRate)>.56&&Number(m.maxDrawdownPct)<.12) return 'BROADEN';
  return 'REORIENT';
}
function horizonMutation(current,direction,generation){
  const cur=String(current);
  if(direction==='TIGHTEN') return cur==='SHORTEST'?'MAX_EDGE':'SHORTEST';
  if(direction==='BROADEN'){
    if(cur==='SHORTEST') return 'MAX_EDGE';
    if(cur==='MAX_EDGE') return generation%2?'MAX_RETURN':'LONGEST';
    if(cur==='MAX_RETURN') return 'LONGEST';
    return 'MAX_RETURN';
  }
  const i=Math.max(0,HORIZON_MODES.indexOf(cur));
  return HORIZON_MODES[(i+1)%HORIZON_MODES.length];
}
function mutateField(profile,field,direction,generation){
  const next=clone(profile);
  let before=next[field],after=before;
  if(field==='minExpectedReturn'){
    const step=Math.max(.00035,Number(before)*.12);
    after=direction==='TIGHTEN'?Number(before)+step:
      direction==='BROADEN'?Number(before)-step:
      Number(before)+(generation%2?step:-step)*.5;
    after=clamp(after,.0008,.02);
  }else if(field==='minDirectionalProbability'){
    const step=.0125;
    after=direction==='TIGHTEN'?Number(before)+step:
      direction==='BROADEN'?Number(before)-step:
      Number(before)+(generation%2?step:-step);
    after=clamp(after,.52,.78);
  }else if(field==='minProbabilityEdge'){
    const step=.015;
    after=direction==='TIGHTEN'?Number(before)+step:
      direction==='BROADEN'?Number(before)-step:
      Number(before)+(generation%2?step:-step);
    after=clamp(after,.04,.35);
  }else if(field==='horizonSelection'){
    after=horizonMutation(before,direction,generation);
  }else{
    return null;
  }
  if(String(after)===String(before)) return null;
  next[field]=after;
  return {
    profile:next,
    mutation:{
      field,
      before,
      after,
      direction,
      oneFactor:true
    }
  };
}
function nextMutation(world,evidence){
  const axes=Array.isArray(world?.doctrine?.axes)&&world.doctrine.axes.length
    ?world.doctrine.axes:[...PROFILE_FIELDS];
  const direction=directionForEvidence(evidence);
  for(let offset=0;offset<axes.length;offset++){
    const field=axes[(Math.max(0,Number(world.generation||1)-1)+offset)%axes.length];
    const m=mutateField(world.currentGenome.profile,field,direction,Number(world.generation||1)+1);
    if(m) return m;
  }
  return null;
}
function extensionsFor(world,{temporalTemple,learnedChallenger,strategySummary}={}){
  const out=[{
    id:'ONE_FACTOR_FORWARD_SHADOW',
    status:'ACTIVE',
    detail:'Exactly one bounded strategy parameter changes per generation before new forward shadow evidence is collected.'
  }];
  const laws=temporalTemple?.transitionLaws?.candidates||[];
  const validLaw=laws.find(x=>x?.validated===true);
  if(validLaw) out.push({
    id:'TEMPORAL_TRANSITION_CONTEXT',
    status:'RESEARCH_CANDIDATE',
    detail:String(validLaw.fromState||'?')+'→'+String(validLaw.toState||'?')+' / '+String(validLaw.forwardHorizon||'?'),
    authority:'NONE'
  });
  const topRule=learnedChallenger?.topRule;
  if(topRule&&['QUALIFIED','TRIAL'].includes(String(topRule.status||''))) out.push({
    id:'LEARNED_RULE_CROSS_POLLINATION',
    status:'RESEARCH_CANDIDATE',
    detail:String(topRule.ruleId||'UNKNOWN')+' · '+String(topRule.status),
    authority:'NONE'
  });
  const leagueRow=(strategySummary?.strategies||[]).find(x=>x.strategyId===world.strategyId);
  if(leagueRow?.status==='DRIFT_WATCH') out.push({
    id:'REGIME_DRIFT_REPAIR',
    status:'PRIORITY',
    detail:'Base strategy is on DRIFT_WATCH; world keeps a separate forward-only repair lineage.',
    authority:'NONE'
  });
  if(world.strategyId==='MEME_SPECIALIST') out.push({
    id:'MEME_INTEGRITY_CONTEXT',
    status:'RESEARCH_CANDIDATE',
    detail:'Keep integrity/liquidity evidence as a separate context before testing opportunity rules.',
    authority:'NONE'
  });
  return out.slice(0,5);
}
function council(worlds){
  const completed=[];
  for(const w of worlds){
    const m=w.currentGenome?.mutation;
    if(m) completed.push({worldId:w.worldId,field:m.field,direction:m.direction,after:m.after});
  }
  const buckets=new Map();
  for(const x of completed){
    const key=x.field+'|'+x.direction;
    const xs=buckets.get(key)||[];
    xs.push(x);buckets.set(key,xs);
  }
  const convergences=[...buckets.entries()]
    .filter(([,xs])=>xs.length>=2)
    .map(([key,xs])=>({
      key,
      field:xs[0].field,
      direction:xs[0].direction,
      worlds:xs.map(x=>x.worldId),
      meaning:'INDEPENDENT_SEARCH_CONVERGENCE_NOT_VALIDATION'
    }));
  const fields=new Set(completed.map(x=>x.field));
  const qualifiedHistory=[];
  for(const w of worlds){
    for(const h of w.history||[]){
      const e=h?.evidence;
      if(Number(e?.closed)>=8&&Number(e?.meanReturn)>0&&Number(e?.winRate)>.52){
        qualifiedHistory.push({
          sourceWorld:w.worldId,
          sourceGenomeId:h.genomeId,
          mutation:h.mutation,
          evidence:e,
          status:'CROSS_POLLINATION_CANDIDATE',
          authority:'NONE'
        });
      }
    }
  }
  qualifiedHistory.sort((a,b)=>
    Number(b.evidence.meanReturn)-Number(a.evidence.meanReturn)||
    Number(b.evidence.winRate)-Number(a.evidence.winRate)
  );
  return {
    status:'PARALLEL_EXPLORATION',
    worldCount:worlds.length,
    activeWorlds:worlds.filter(w=>w.currentGenome?.status!=='ERROR').length,
    mutationDiversity:fields.size,
    convergences,
    crossPollination:qualifiedHistory.slice(0,6),
    meaning:'INDEPENDENT_SHADOW_RESEARCH_WORLDS_NOT_PRIMARY_POLICY'
  };
}

export function refreshParallelStrategyWorlds(state,{
  baseStrategies,
  leaguePositions,
  strategySummary=null,
  temporalTemple=null,
  learnedChallenger=null,
  asOf=Date.now(),
  minClosedPerGeneration=8,
  maxHistoryPerWorld=16
}={}){
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const bases=(Array.isArray(baseStrategies)?baseStrategies:[]).filter(x=>x?.id);
  if(!bases.length) throw new Error('base strategies required');
  let current=state?.version===PARALLEL_STRATEGY_WORLDS_VERSION?clone(state):createParallelStrategyWorlds(bases,{now:t});
  const byId=new Map((current.worlds||[]).map(w=>[String(w.strategyId),w]));
  let changed=state?.version!==PARALLEL_STRATEGY_WORLDS_VERSION;
  const worlds=[];

  for(const base of bases){
    const strategyId=String(base.id);
    let world=clone(byId.get(strategyId)||worldForBase(base,{now:t}));
    if(!byId.has(strategyId)) changed=true;
    const rows=closedForGenome(leaguePositions,strategyId,world.currentGenome.genomeId);
    const evidence=metrics(rows);
    world.currentGenome.evidence=evidence;
    world.currentGenome.status=evidence.closed>=Math.max(1,Number(minClosedPerGeneration)||8)
      ?'GENERATION_READY'
      :evidence.closed>0?'MEASURING':'AWAITING_FORWARD_TRADES';
    world.extensions=extensionsFor(world,{temporalTemple,learnedChallenger,strategySummary});

    if(evidence.closed>=Math.max(1,Number(minClosedPerGeneration)||8)){
      const mutation=nextMutation(world,evidence);
      if(mutation){
        const previous={
          genomeId:world.currentGenome.genomeId,
          parentGenomeId:world.currentGenome.parentGenomeId,
          generation:world.currentGenome.generation,
          profile:clone(world.currentGenome.profile),
          mutation:world.currentGenome.mutation,
          createdAt:world.currentGenome.createdAt,
          completedAt:t,
          evidence,
          status:'COMPLETED_FORWARD_SHADOW_GENERATION'
        };
        const nextGeneration=Number(world.generation||1)+1;
        const nextId=genomeId(strategyId,nextGeneration,mutation.profile,previous.genomeId);
        world.history=[...(world.history||[]),previous].slice(-Math.max(1,Number(maxHistoryPerWorld)||16));
        world.generation=nextGeneration;
        world.currentGenome={
          genomeId:nextId,
          parentGenomeId:previous.genomeId,
          generation:nextGeneration,
          profile:mutation.profile,
          mutation:{...mutation.mutation,sourceEvidenceGenomeId:previous.genomeId},
          createdAt:t,
          dataCutoffClosedAt:evidence.lastClosedAt,
          status:'AWAITING_FORWARD_TRADES',
          evidence:{closed:0,wins:0,winRate:null,meanReturn:null,expectancyQuote:null,maxDrawdownPct:null,symbols:0}
        };
        world.evolutionCount=Number(world.evolutionCount||0)+1;
        world.lastEvolutionAt=t;
        changed=true;
      }
    }
    worlds.push(world);
  }

  const next={
    ...current,
    schemaVersion:PARALLEL_STRATEGY_WORLDS_SCHEMA_VERSION,
    version:PARALLEL_STRATEGY_WORLDS_VERSION,
    updatedAt:t,
    worlds,
    council:council(worlds),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticPromotion:false
  };
  return {state:next,changed};
}

export function parallelStrategyWorldProfile(state,strategyId,baseStrategy=null){
  const id=String(strategyId||'');
  const world=(state?.worlds||[]).find(w=>String(w.strategyId)===id);
  const base=profileOf(baseStrategy||{});
  if(!world?.currentGenome?.profile){
    return {
      worldId:'WORLD_'+id,
      strategyId:id,
      generation:0,
      genomeId:null,
      profile:base,
      mutation:null
    };
  }
  return {
    worldId:String(world.worldId),
    strategyId:id,
    generation:Number(world.generation||world.currentGenome.generation||1),
    genomeId:String(world.currentGenome.genomeId),
    profile:profileOf({...base,...world.currentGenome.profile}),
    mutation:world.currentGenome.mutation?clone(world.currentGenome.mutation):null
  };
}

export function parallelStrategyWorldsSummary(state){
  const worlds=(state?.worlds||[]).map(w=>({
    worldId:w.worldId,
    strategyId:w.strategyId,
    label:w.label,
    doctrine:w.doctrine,
    generation:Number(w.generation||0),
    evolutionCount:Number(w.evolutionCount||0),
    currentGenome:{
      genomeId:w.currentGenome?.genomeId||null,
      parentGenomeId:w.currentGenome?.parentGenomeId||null,
      status:w.currentGenome?.status||'UNKNOWN',
      profile:w.currentGenome?.profile||null,
      mutation:w.currentGenome?.mutation||null,
      evidence:w.currentGenome?.evidence||null,
      createdAt:finite(w.currentGenome?.createdAt),
      dataCutoffClosedAt:finite(w.currentGenome?.dataCutoffClosedAt)
    },
    completedGenerations:(w.history||[]).length,
    recentGenerations:(w.history||[]).slice(-3).map(h=>({
      generation:h.generation,
      genomeId:h.genomeId,
      mutation:h.mutation,
      evidence:h.evidence,
      status:h.status
    })),
    extensions:(w.extensions||[]).slice(0,5)
  }));
  return {
    version:PARALLEL_STRATEGY_WORLDS_VERSION,
    updatedAt:finite(state?.updatedAt),
    worldCount:worlds.length,
    generations:worlds.reduce((s,w)=>s+w.generation,0),
    evolutions:worlds.reduce((s,w)=>s+w.evolutionCount,0),
    worlds,
    council:state?.council||council(worlds),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticPromotion:false,
    meaning:'PARALLEL_ONE_FACTOR_STRATEGY_EVOLUTION_IN_VIRTUAL_SHADOW_WORLDS'
  };
}

export async function loadParallelStrategyWorlds(filePath,{baseStrategies,now=Date.now()}={}){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const parsed=JSON.parse(await readFile(filePath,'utf8'));
    if(
      parsed?.schemaVersion!==PARALLEL_STRATEGY_WORLDS_SCHEMA_VERSION||
      parsed?.version!==PARALLEL_STRATEGY_WORLDS_VERSION
    ) throw new Error('PARALLEL_STRATEGY_WORLDS_SCHEMA_MISMATCH');
    return {state:parsed,healthy:true,recoveredFromCorrupt:false,error:null};
  }catch(err){
    if(err?.code!=='ENOENT'){
      try{await rename(filePath,filePath+'.corrupt-'+Date.now());}catch{}
    }
    return {
      state:createParallelStrategyWorlds(baseStrategies,{now}),
      healthy:err?.code==='ENOENT',
      recoveredFromCorrupt:err?.code!=='ENOENT',
      error:err?.code==='ENOENT'?null:(err instanceof Error?err.message:String(err))
    };
  }
}

export async function saveParallelStrategyWorlds(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const body={
    ...clone(state),
    schemaVersion:PARALLEL_STRATEGY_WORLDS_SCHEMA_VERSION,
    version:PARALLEL_STRATEGY_WORLDS_VERSION,
    updatedAt:Date.now(),
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecuteLive:false,
    automaticPrimaryMutation:false,
    automaticPromotion:false
  };
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(body,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return body;
}
