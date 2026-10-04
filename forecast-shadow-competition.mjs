import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { sha256 } from './institutional-kernel.mjs';
import {
  buildForecastCandidateArtifact,
  evaluateForecastCandidateWalkForward
} from './forecast-candidate-lab.mjs';
import { DEFAULT_PROMOTION_POLICY } from './model-promotion-ladder.mjs';
import { generateControlledForecastHypotheses, FORECAST_HYPOTHESIS_GENERATOR_VERSION } from './forecast-hypothesis-generator.mjs';

export const FORECAST_SHADOW_COMPETITION_VERSION='TCX_FORECAST_SHADOW_COMPETITION_V1';

function clone(v){ return structuredClone(v); }
function finite(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

function validHistory(rows,asOf){
  const t=finite(asOf);
  return (Array.isArray(rows)?rows:[])
    .filter(r=>
      finite(r?.timestamp)!=null&&
      finite(r?.resolvedAt)!=null&&
      finite(r?.availableAt)!=null&&
      finite(r?.forwardReturn)!=null&&
      Number(r.resolvedAt)<=t
    )
    .sort((a,b)=>Number(a.timestamp)-Number(b.timestamp)||Number(a.horizonMs)-Number(b.horizonMs));
}

function semanticShape(config){
  return {
    featureIds:[...(config?.featureIds||[])],
    horizons:[...(config?.horizons||[])].map(h=>({
      id:String(h.id),
      horizonMs:Number(h.horizonMs),
      flatThreshold:Number(h.flatThreshold)
    }))
  };
}

function mutateHorizons(config,fn){
  const out=clone(config);
  out.horizons=out.horizons.map(h=>({...h,...fn(h)}));
  return out;
}

export function buildShadowCandidateBlueprints(incumbentConfig){
  const base=clone(incumbentConfig);
  const day=24*60*60_000;
  const currentHalfLife=Math.max(day,Number(base.recencyHalfLifeMs||30*day));
  const currentLambda=Math.max(.05,Number(base.ridgeLambda||1));

  const recent={
    ...clone(base),
    recencyHalfLifeMs:Math.max(7*day,Math.min(currentHalfLife,14*day))
  };

  const tight=mutateHorizons(base,h=>({
    analogBandwidth:clamp(Number(h.analogBandwidth||1.5)*0.80,.35,4),
    minSimilarity:clamp(Number(h.minSimilarity||.08)*1.25,.02,.60),
    topK:Math.max(40,Math.round(Number(h.topK||180)*0.80))
  }));
  tight.pathTopK=Math.max(40,Math.round(Number(base.pathTopK||120)*0.85));
  tight.pathMinSimilarity=clamp(Number(base.pathMinSimilarity||.08)*1.20,.02,.60);

  const broad=mutateHorizons(base,h=>({
    analogBandwidth:clamp(Number(h.analogBandwidth||1.5)*1.20,.35,4),
    minSimilarity:clamp(Number(h.minSimilarity||.08)*0.75,.01,.60),
    topK:Math.min(500,Math.max(60,Math.round(Number(h.topK||180)*1.25)))
  }));
  broad.pathTopK=Math.min(500,Math.max(60,Math.round(Number(base.pathTopK||120)*1.25)));
  broad.pathMinSimilarity=clamp(Number(base.pathMinSimilarity||.08)*0.80,.01,.60);

  const regularized={
    ...clone(base),
    ridgeLambda:clamp(currentLambda*2,.05,20),
    residualInflationFallback:clamp(Number(base.residualInflationFallback||1.25)*1.08,1,3)
  };

  return Object.freeze([
    Object.freeze({
      id:'RECENCY_FOCUS',
      label:'Recency Focus',
      description:'Gewichtet neuere historische Fälle stärker.',
      config:recent
    }),
    Object.freeze({
      id:'TIGHT_ANALOGS',
      label:'Tight Analogs',
      description:'Verlangt ähnlichere Vergleichsfälle und nutzt weniger Nachbarn.',
      config:tight
    }),
    Object.freeze({
      id:'BROAD_ANALOGS',
      label:'Broad Analogs',
      description:'Nutzt einen breiteren Pool historischer Vergleichsfälle.',
      config:broad
    }),
    Object.freeze({
      id:'RIDGE_STABILITY',
      label:'Ridge Stability',
      description:'Regularisiert lineare Komponenten stärker gegen Überanpassung.',
      config:regularized
    })
  ]);
}

function candidateFromBlueprint(bp,{rows,incumbentConfig,dataCutoffAt,createdAt,parentReleaseId,source}){
  const artifact=buildForecastCandidateArtifact({
    historyRows:rows,
    incumbentConfig,
    candidateConfig:bp.config,
    dataCutoffAt,
    createdAt,
    parentReleaseId,
    source
  });
  return Object.freeze({
    blueprintId:bp.id,
    label:bp.label,
    description:bp.description,
    reason:bp.reason??null,
    priority:Number(bp.priority??0),
    source:String(bp.source||source),
    generatorVersion:bp.generatorVersion??null,
    artifact,
    status:'WAITING_FOR_OOS',
    lastEvaluation:null
  });
}

export function createShadowCompetition({
  historyRows,
  incumbentConfig,
  parentReleaseId='UNKNOWN',
  now=Date.now(),
  minSeedRows=40
}={}){
  const t=finite(now);
  if(t==null) throw new Error('now must be finite');
  const rows=validHistory(historyRows,t);
  if(rows.length<Math.max(1,Number(minSeedRows)||1)){
    return Object.freeze({
      version:FORECAST_SHADOW_COMPETITION_VERSION,
      status:'WAITING_FOR_SEED_HISTORY',
      createdAt:t,
      dataCutoffAt:null,
      incumbentConfigHash:sha256(incumbentConfig),
      incumbentSemanticHash:sha256(semanticShape(incumbentConfig)),
      seedRows:rows.length,
      requiredSeedRows:Math.max(1,Number(minSeedRows)||1),
      parentReleaseId:String(parentReleaseId||'UNKNOWN'),
      hypothesisGenerator:Object.freeze({
        version:FORECAST_HYPOTHESIS_GENERATOR_VERSION,
        diagnostics:null,
        generatedCandidates:0
      }),
      candidates:Object.freeze([]),
      lastEvaluatedAt:null,
      executionMode:'SHADOW_ONLY',
      productionMutationPerformed:false
    });
  }

  const dataCutoffAt=Math.max(...rows.map(r=>Number(r.resolvedAt)));
  const fixed=buildShadowCandidateBlueprints(incumbentConfig);
  const generated=generateControlledForecastHypotheses({
    historyRows:rows,
    incumbentConfig,
    asOf:dataCutoffAt,
    maxHypotheses:4
  });
  const candidates=[
    ...fixed.map(bp=>candidateFromBlueprint(bp,{
      rows,incumbentConfig,dataCutoffAt,createdAt:t,parentReleaseId,
      source:'TCX_AUTOMATIC_SHADOW_COMPETITION'
    })),
    ...generated.hypotheses.map(bp=>candidateFromBlueprint(bp,{
      rows,incumbentConfig,dataCutoffAt,createdAt:t,parentReleaseId,
      source:'TCX_CONTROLLED_HYPOTHESIS_GENERATOR'
    }))
  ];

  return Object.freeze({
    version:FORECAST_SHADOW_COMPETITION_VERSION,
    status:'ACTIVE',
    createdAt:t,
    dataCutoffAt,
    incumbentConfigHash:sha256(incumbentConfig),
    incumbentSemanticHash:sha256(semanticShape(incumbentConfig)),
    seedRows:rows.length,
    requiredSeedRows:Math.max(1,Number(minSeedRows)||1),
    parentReleaseId:String(parentReleaseId||'UNKNOWN'),
    hypothesisGenerator:Object.freeze({
      version:FORECAST_HYPOTHESIS_GENERATOR_VERSION,
      diagnostics:generated.diagnostics,
      generatedCandidates:generated.hypotheses.length
    }),
    candidates:Object.freeze(candidates),
    lastEvaluatedAt:null,
    executionMode:'SHADOW_ONLY',
    productionMutationPerformed:false
  });
}

export function refreshShadowCompetitionHypotheses(state,{
  historyRows,
  incumbentConfig,
  asOf=Date.now(),
  maxGeneratedHypotheses=4
}={}){
  if(state?.version!==FORECAST_SHADOW_COMPETITION_VERSION) throw new Error('shadow competition version invalid');
  if(state.status!=='ACTIVE'||!Number.isFinite(Number(state.dataCutoffAt))) return Object.freeze(clone(state));
  if(state.incumbentConfigHash!==sha256(incumbentConfig)){
    return Object.freeze({...clone(state),status:'STALE_INCUMBENT_CONFIG'});
  }

  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  const training=validHistory(historyRows,state.dataCutoffAt);
  const generated=generateControlledForecastHypotheses({
    historyRows:training,
    incumbentConfig,
    asOf:state.dataCutoffAt,
    maxHypotheses:maxGeneratedHypotheses
  });
  const existingIds=new Set((state.candidates||[]).map(x=>String(x.blueprintId)));
  const additions=[];
  for(const bp of generated.hypotheses){
    if(existingIds.has(bp.id)) continue;
    additions.push(candidateFromBlueprint(bp,{
      rows:training,
      incumbentConfig,
      dataCutoffAt:Number(state.dataCutoffAt),
      createdAt:t,
      parentReleaseId:String(state.parentReleaseId||'UNKNOWN'),
      source:'TCX_CONTROLLED_HYPOTHESIS_GENERATOR'
    }));
  }

  return Object.freeze({
    ...clone(state),
    hypothesisGenerator:Object.freeze({
      version:FORECAST_HYPOTHESIS_GENERATOR_VERSION,
      diagnostics:generated.diagnostics,
      generatedCandidates:generated.hypotheses.length,
      addedCandidates:additions.length,
      refreshedAt:t
    }),
    candidates:Object.freeze([...(state.candidates||[]).map(clone),...additions]),
    productionMutationPerformed:false
  });
}

function testRowsAfterCutoff(rows,cutoff,asOf){
  return validHistory(rows,asOf).filter(r=>Number(r.timestamp)>Number(cutoff));
}

function finiteMetrics(m){
  return m&&
    Number.isFinite(Number(m.brier))&&
    Number.isFinite(Number(m.logLoss))&&
    Number.isFinite(Number(m.intervalCoverage))&&
    Number.isFinite(Number(m.highConfidenceWrongRate));
}

function candidateStatus(wf,policy){
  const e=wf?.evaluation;
  if(!e||!finiteMetrics(e.candidate)||!finiteMetrics(e.incumbent)) return 'WAITING_FOR_OOS';
  if(e.cases<Math.max(1,Number(policy.minCases)||1)) return 'MEASURING';
  if(e.independentEpisodes<Math.max(1,Number(policy.minIndependentEpisodes)||1)) return 'MEASURING';
  return 'PROMOTION_GATE_READY';
}

export function evaluateShadowCompetition(state,{
  historyRows,
  incumbentConfig,
  asOf=Date.now(),
  minimumTrainCases=40,
  promotionPolicy=DEFAULT_PROMOTION_POLICY,
  frozenCandidateIds=[]
}={}){
  const frozenIds=new Set((Array.isArray(frozenCandidateIds)?frozenCandidateIds:[]).map(x=>String(x)));
  if(state?.version!==FORECAST_SHADOW_COMPETITION_VERSION) throw new Error('shadow competition version invalid');
  const t=finite(asOf);
  if(t==null) throw new Error('asOf must be finite');
  if(state.status!=='ACTIVE'||!state.candidates?.length){
    return Object.freeze({...clone(state),lastEvaluatedAt:t});
  }
  if(state.incumbentConfigHash!==sha256(incumbentConfig)){
    return Object.freeze({
      ...clone(state),
      status:'STALE_INCUMBENT_CONFIG',
      lastEvaluatedAt:t,
      productionMutationPerformed:false
    });
  }

  const oos=testRowsAfterCutoff(historyRows,state.dataCutoffAt,t);
  if(!oos.length){
    return Object.freeze({
      ...clone(state),
      lastEvaluatedAt:t,
      candidates:Object.freeze(state.candidates.map(c=>
        frozenIds.has(String(c?.artifact?.candidateId))
          ?Object.freeze(clone(c))
          :Object.freeze({...clone(c),status:'WAITING_FOR_OOS'})
      )),
      competition:Object.freeze({
        oosRows:0,
        evaluatedCandidates:0,
        bestBrierCandidate:null,
        bestLogLossCandidate:null
      })
    });
  }

  const evaluated=[];
  for(const c of state.candidates){
    if(frozenIds.has(String(c?.artifact?.candidateId))){
      evaluated.push(Object.freeze(clone(c)));
      continue;
    }
    try{
      const wf=evaluateForecastCandidateWalkForward({
        historyRows,
        incumbentConfig,
        candidate:c.artifact,
        asOf:t,
        minimumTrainCases
      });
      evaluated.push(Object.freeze({
        ...clone(c),
        status:candidateStatus(wf,promotionPolicy),
        lastEvaluation:wf
      }));
    }catch(err){
      evaluated.push(Object.freeze({
        ...clone(c),
        status:'EVALUATION_ERROR',
        lastError:err instanceof Error?err.message:String(err)
      }));
    }
  }

  const usable=evaluated.filter(c=>finiteMetrics(c.lastEvaluation?.evaluation?.candidate));
  const byBrier=[...usable].sort((a,b)=>
    Number(a.lastEvaluation.evaluation.candidate.brier)-Number(b.lastEvaluation.evaluation.candidate.brier)
  );
  const byLog=[...usable].sort((a,b)=>
    Number(a.lastEvaluation.evaluation.candidate.logLoss)-Number(b.lastEvaluation.evaluation.candidate.logLoss)
  );

  return Object.freeze({
    ...clone(state),
    status:'ACTIVE',
    lastEvaluatedAt:t,
    candidates:Object.freeze(evaluated),
    competition:Object.freeze({
      oosRows:oos.length,
      evaluatedCandidates:usable.length,
      bestBrierCandidate:byBrier[0]?.blueprintId??null,
      bestLogLossCandidate:byLog[0]?.blueprintId??null
    }),
    productionMutationPerformed:false
  });
}

export function shadowCompetitionSummary(state,{promotionPolicy=DEFAULT_PROMOTION_POLICY}={}){
  const candidates=(state?.candidates||[]).map(c=>{
    const e=c.lastEvaluation?.evaluation;
    return {
      blueprintId:c.blueprintId,
      label:c.label,
      status:c.status,
      cases:Number(e?.cases??0),
      independentEpisodes:Number(e?.independentEpisodes??0),
      candidateMetrics:e?.candidate??null,
      incumbentMetrics:e?.incumbent??null,
      deltas:e?.deltas??null,
      error:c.lastError??null
    };
  });
  return {
    version:FORECAST_SHADOW_COMPETITION_VERSION,
    status:String(state?.status||'UNINITIALIZED'),
    createdAt:finite(state?.createdAt),
    dataCutoffAt:finite(state?.dataCutoffAt),
    seedRows:Number(state?.seedRows??0),
    lastEvaluatedAt:finite(state?.lastEvaluatedAt),
    hypothesisGenerator:state?.hypothesisGenerator??null,
    candidates,
    competition:state?.competition??null,
    promotionPolicy:{
      minCases:Number(promotionPolicy.minCases),
      minIndependentEpisodes:Number(promotionPolicy.minIndependentEpisodes)
    },
    executionMode:'SHADOW_ONLY',
    productionMutationPerformed:false
  };
}

export async function loadShadowCompetition(filePath){
  await mkdir(path.dirname(filePath),{recursive:true});
  try{
    const raw=await readFile(filePath,'utf8');
    const state=JSON.parse(raw);
    if(state?.version!==FORECAST_SHADOW_COMPETITION_VERSION) throw new Error('unsupported shadow competition version');
    return state;
  }catch(err){
    if(err?.code==='ENOENT') return null;
    const backup=filePath+'.corrupt-'+Date.now();
    try{ await rename(filePath,backup); }catch{}
    return null;
  }
}

export async function saveShadowCompetition(filePath,state){
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await rename(tmp,filePath);
  return state;
}
