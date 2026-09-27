export const FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION='TCX_FORECAST_RUNTIME_SCIENCE_ADAPTER_V1';

export const FORECAST_RUNTIME_SCIENCE_PROFILE=Object.freeze({
  EMPIRICAL_SUPPORT:{required:true},
  RESEARCH_INTEGRITY:{required:false},
  CONCEPT_STABILITY:{required:true},
  NONLINEAR_CONCEPT_STABILITY:{required:false},
  TEMPORAL_RECENCY:{required:true},
  SEQUENTIAL_EVIDENCE:{required:false},
  SPECIFICATION_MULTIVERSE:{required:false},
  TRANSPORTABILITY:{required:false},
  EVIDENCE_LINEAGE_INDEPENDENCE:{required:true}
});

function finite(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function cleanHistory(engine,asOf,symbol){
  return engine.historySnapshot(asOf)
    .filter(r=>r.symbol===symbol&&finite(r.resolvedAt)!=null&&Number(r.resolvedAt)<=asOf)
    .sort((a,b)=>Number(a.timestamp)-Number(b.timestamp)||Number(a.resolvedAt)-Number(b.resolvedAt));
}
function splitByHorizon(rows){
  const map=new Map();
  for(const r of rows){
    const k=Number(r.horizonMs);
    const xs=map.get(k)??[];
    xs.push(r);
    map.set(k,xs);
  }
  return map;
}
function splitRole(xs,{referenceFraction=.65,minTarget=20}={}){
  if(!xs.length) return new Map();
  const refN=Math.max(1,Math.min(xs.length-1,Math.floor(xs.length*referenceFraction)));
  const targetN=Math.max(1,Math.min(xs.length-refN,Math.max(minTarget,xs.length-refN)));
  const targetStart=Math.max(refN,xs.length-targetN);
  const out=new Map();
  xs.forEach((r,i)=>out.set(r.id??String(i),i<targetStart?'REFERENCE':'TARGET'));
  return out;
}

export function buildForecastScienceInputs({
  engine,
  asOf,
  symbol,
  witnessReport=null,
  referenceFraction=.65
}={}){
  if(!engine?.historySnapshot) throw new Error('forecast engine required');
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const sym=String(symbol??'').toUpperCase();
  const rows=cleanHistory(engine,t,sym);
  const byHorizon=splitByHorizon(rows);

  const empirical=[];
  const conditional=[];
  const temporal=[];

  for(const [horizonMs,xs] of byHorizon){
    const roles=splitRole(xs,{referenceFraction});
    const mechanismId='FORECAST_H'+horizonMs;
    for(const r of xs){
      const id=String(r.id??(r.symbol+':'+r.timestamp+':'+horizonMs));
      const role=roles.get(r.id??id)??'TARGET';
      const availableAt=Number(r.resolvedAt);
      const common={
        id,
        sampleId:id,
        mechanismId,
        environmentId:role==='REFERENCE'?'HISTORICAL_REFERENCE':'RECENT_TARGET',
        role,
        deploymentTarget:role==='TARGET',
        timestamp:Number(r.timestamp),
        availableAt,
        source:'TCX_FORECAST_HISTORY',
        version:FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION,
        provenance:'Forecast history row admitted only after resolvedAt'
      };

      conditional.push({
        ...common,
        outcome:Number(r.forwardReturn),
        features:structuredClone(r.features)
      });
      temporal.push({
        id,
        sampleId:id,
        mechanismId,
        outcome:Number(r.forwardReturn),
        features:structuredClone(r.features),
        timestamp:Number(r.timestamp),
        availableAt,
        source:'TCX_FORECAST_HISTORY',
        version:FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION,
        provenance:'Chronological matured forecast-history observation'
      });

      for(const [feature,value] of Object.entries(r.features||{})){
        if(!Number.isFinite(Number(value))) continue;
        empirical.push({
          ...common,
          id:id+':'+feature,
          feature,
          value:Number(value)
        });
      }
    }
  }

  const lineage=[];
  const witnessRows=[
    witnessReport?.primary,
    ...(Array.isArray(witnessReport?.witnesses)?witnessReport.witnesses:[])
  ].filter(Boolean);
  for(const w of witnessRows){
    const availableAt=finite(w.availableAt);
    if(availableAt==null||availableAt>t) continue;
    const source=String(w.source??'UNKNOWN');
    const venue=String(w.venue??source);
    lineage.push({
      id:'witness:'+source+':'+availableAt,
      claimId:'CURRENT_MARKET_STATE',
      mechanismId:'FORECAST_WITNESS_MESH',
      witnessId:source,
      lineage:['venue:'+venue,'source:'+source],
      requiredIndependent:3,
      deploymentTarget:true,
      timestamp:finite(w.publishedAt)??availableAt,
      availableAt,
      source,
      version:FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION,
      provenance:String(w.provenance??'direct venue witness')
    });
  }

  return Object.freeze({
    version:FORECAST_RUNTIME_SCIENCE_ADAPTER_VERSION,
    asOf:t,
    symbol:sym,
    historyRows:rows.length,
    horizonCount:byHorizon.size,
    inputs:{
      EMPIRICAL_SUPPORT:empirical,
      CONCEPT_STABILITY:conditional,
      NONLINEAR_CONCEPT_STABILITY:conditional,
      TEMPORAL_RECENCY:temporal,
      EVIDENCE_LINEAGE_INDEPENDENCE:lineage
    },
    options:{
      EMPIRICAL_SUPPORT:{minReferenceSamples:30,minTargetSamples:20},
      CONCEPT_STABILITY:{minReferenceSamples:30,minTargetSamples:20},
      NONLINEAR_CONCEPT_STABILITY:{minReferenceSamples:45,minTargetSamples:25},
      TEMPORAL_RECENCY:{minSamples:60},
      EVIDENCE_LINEAGE_INDEPENDENCE:{minEvidenceItems:3,minIndependentComponents:3}
    },
    profile:FORECAST_RUNTIME_SCIENCE_PROFILE,
    epistemic:'MATURED_FORECAST_HISTORY_PLUS_CURRENT_DIRECT_VENUE_LINEAGE',
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}
