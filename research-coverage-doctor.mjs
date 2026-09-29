export const RESEARCH_COVERAGE_DOCTOR_VERSION='TCX_RESEARCH_COVERAGE_DOCTOR_V1';

function finite(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function unique(xs){return [...new Set((xs||[]).map(String).filter(Boolean))];}
function severityRank(v){return ({BLOCKED:3,DEGRADED:2,INSUFFICIENT:1,HEALTHY:0})[String(v||'')]??1;}
function sourceIndex(summary){
  return new Map((Array.isArray(summary?.sources)?summary.sources:[])
    .map(x=>[String(x?.sourceKey||''),x])
    .filter(([key])=>key));
}

export function buildResearchCoverageDiagnostic(graph,governanceSummary,{symbol=null,observedAt=Date.now()}={}){
  const impact=graph?.impact||{};
  const gate=String(graph?.gate||'UNAVAILABLE').toUpperCase();
  const blockedFeatureIds=unique(impact?.blockedFeatureIds);
  const degradedFeatureIds=unique(impact?.degradedFeatureIds);
  const impactedSourceKeys=unique(impact?.impactedSourceKeys);
  const bySource=sourceIndex(governanceSummary);
  const sources=impactedSourceKeys.map(sourceKey=>{
    const row=bySource.get(sourceKey)||{};
    return Object.freeze({
      sourceKey,
      status:String(row?.status||'UNKNOWN').toUpperCase(),
      lastDecision:row?.lastDecision==null?null:String(row.lastDecision),
      consecutiveViolations:Number(row?.consecutiveViolations||0),
      silenceMs:finite(row?.silenceMs),
      reasonCodes:Object.freeze(unique((row?.lastReasons||[]).map(x=>typeof x==='string'?x:x?.code)))
    });
  });
  const factorProblems=(Array.isArray(graph?.nodes)?graph.nodes:[])
    .filter(x=>x?.type==='FACTOR'&&x?.state!=='HEALTHY')
    .map(x=>Object.freeze({
      domain:String(x?.domain||'UNKNOWN'),
      state:String(x?.state||'UNKNOWN'),
      featureCount:Number(x?.featureCount||0),
      blockedFeatures:Number(x?.blockedFeatures||0),
      degradedFeatures:Number(x?.degradedFeatures||0)
    }))
    .sort((a,b)=>b.blockedFeatures-a.blockedFeatures||b.degradedFeatures-a.degradedFeatures||a.domain.localeCompare(b.domain));

  const status=
    gate==='ABSTAIN'||Number(impact?.blockedFeatures||0)>0?'BLOCKED':
    gate==='CAUTION'||Number(impact?.degradedFeatures||0)>0?'DEGRADED':
    Number(impact?.totalFeatures||0)===0?'INSUFFICIENT':
    'HEALTHY';

  return Object.freeze({
    version:RESEARCH_COVERAGE_DOCTOR_VERSION,
    symbol:symbol==null?String(graph?.streamKey||'UNKNOWN'):String(symbol).toUpperCase(),
    observedAt:Number(observedAt),
    status,
    gate,
    coverage:finite(impact?.coverage)??0,
    totalFeatures:Number(impact?.totalFeatures||0),
    usableFeatures:Number(impact?.usableFeatures||0),
    blockedFeatures:Number(impact?.blockedFeatures||0),
    degradedFeatures:Number(impact?.degradedFeatures||0),
    blockedFeatureIds:Object.freeze(blockedFeatureIds),
    degradedFeatureIds:Object.freeze(degradedFeatureIds),
    impactedSourceKeys:Object.freeze(impactedSourceKeys),
    sources:Object.freeze(sources),
    factorProblems:Object.freeze(factorProblems),
    graphReasons:Object.freeze(unique(graph?.reasons)),
    dependencyFingerprint:graph?.fingerprint||null,
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}

export function buildResearchCoverageFleetSummary(diagnostics,{now=Date.now(),maxSymbols=17,maxItems=8}={}){
  const latest=new Map();
  for(const row of Array.isArray(diagnostics)?diagnostics:[]){
    const symbol=String(row?.symbol||'');
    if(!symbol) continue;
    const prior=latest.get(symbol);
    if(!prior||Number(row?.observedAt||0)>Number(prior?.observedAt||0)) latest.set(symbol,row);
  }
  const rows=[...latest.values()]
    .sort((a,b)=>severityRank(b.status)-severityRank(a.status)||Number(a.coverage||0)-Number(b.coverage||0)||String(a.symbol).localeCompare(String(b.symbol)))
    .slice(0,Math.max(1,Number(maxSymbols)||17));
  const sourceCounts=new Map(),featureCounts=new Map();
  for(const row of rows){
    for(const key of row?.impactedSourceKeys||[]) sourceCounts.set(key,(sourceCounts.get(key)||0)+1);
    for(const id of row?.blockedFeatureIds||[]) featureCounts.set(id,(featureCounts.get(id)||0)+1);
  }
  const top=(map)=>[...map.entries()]
    .map(([id,count])=>({id,count}))
    .sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id))
    .slice(0,Math.max(1,Number(maxItems)||8));

  const avgCoverage=rows.length?rows.reduce((s,x)=>s+(finite(x?.coverage)??0),0)/rows.length:0;
  return Object.freeze({
    version:RESEARCH_COVERAGE_DOCTOR_VERSION,
    generatedAt:Number(now),
    symbols:rows.length,
    healthy:rows.filter(x=>x.status==='HEALTHY').length,
    degraded:rows.filter(x=>x.status==='DEGRADED').length,
    blocked:rows.filter(x=>x.status==='BLOCKED').length,
    insufficient:rows.filter(x=>x.status==='INSUFFICIENT').length,
    averageCoverage:avgCoverage,
    blockedFeatures:rows.reduce((s,x)=>s+Number(x?.blockedFeatures||0),0),
    degradedFeatures:rows.reduce((s,x)=>s+Number(x?.degradedFeatures||0),0),
    topBlockedSources:Object.freeze(top(sourceCounts)),
    topBlockedFeatures:Object.freeze(top(featureCounts)),
    worstSymbols:Object.freeze(rows.slice(0,Math.max(1,Number(maxItems)||8)).map(x=>Object.freeze({
      symbol:x.symbol,
      status:x.status,
      gate:x.gate,
      coverage:x.coverage,
      blockedFeatures:x.blockedFeatures,
      degradedFeatures:x.degradedFeatures,
      impactedSourceKeys:x.impactedSourceKeys
    }))),
    execution:'SHADOW_ONLY',
    canExecute:false
  });
}
