import { parentPort, workerData } from 'node:worker_threads';
import {
  createShadowCompetition,
  refreshShadowCompetitionHypotheses,
  evaluateShadowCompetition,
  shadowCompetitionSummary
} from './forecast-shadow-competition.mjs';
import {
  createExperimentGovernor,
  evaluateExperimentGovernor,
  experimentGovernorSummary
} from './forecast-experiment-governor.mjs';
import { sha256 } from './institutional-kernel.mjs';
import { forecastHistoryProgressAt, forecastHistoryHasAdvanced } from './forecast-shadow-evaluation-client.mjs';

function run(input){
  const {
    competitionState:initialCompetition,
    experimentGovernorState:initialGovernor,
    historyRows,
    incumbentConfig,
    releaseId='UNAVAILABLE',
    minSeedRows=40,
    minimumTrainCases=40,
    maxGeneratedHypotheses=4,
    now=Date.now()
  }=input||{};

  const history=Array.isArray(historyRows)?historyRows:[];
  let competition=initialCompetition||null;
  let governor=initialGovernor||null;
  let initialized=false,refreshed=false,evaluated=false,governorCreated=false,governorEvaluated=false;
  let generationAdvanced=false,previousGenerationId=null,nextGenerationId=null;
  let reviewEvidenceFrozen=false;

  // COMPLETE_NO_PROMOTION is a terminal scientific result, not a reason to
  // leave the research loop permanently stalled. Start the next SHADOW_ONLY
  // challenger generation from the newest resolved history. Promotion-review
  // terminal states are intentionally excluded so governance evidence cannot
  // be overwritten before review.
  if(
    governor?.status==='COMPLETE_NO_PROMOTION'&&
    governor?.nextGenerationEligible===true
  ){
    const nextCompetition=createShadowCompetition({
      historyRows:history,
      incumbentConfig,
      parentReleaseId:String(releaseId||'UNAVAILABLE'),
      now,
      minSeedRows
    });
    if(nextCompetition?.status==='ACTIVE'){
      previousGenerationId=governor?.generationId??null;
      const nextGenerationNumber=Math.max(1,Number(governor?.generationNumber||0)+1);
      competition={
        ...nextCompetition,
        evaluatedHistoryRows:history.length,
        evaluatedHistoryThroughAt:forecastHistoryProgressAt(history)
      };
      governor=createExperimentGovernor({
        competition,
        championConfigHash:String(competition.incumbentConfigHash||sha256(incumbentConfig)),
        championReleaseId:String(releaseId||'UNAVAILABLE'),
        generationNumber:nextGenerationNumber,
        now
      });
      nextGenerationId=governor?.generationId??null;
      initialized=true;
      governorCreated=true;
      generationAdvanced=true;
    }
  }

  const frozenReviewCandidateIds=()=>new Set(
    (governor?.participants||[])
      .filter(p=>['PROMOTION_REVIEW_REQUIRED','PROMOTION_CANDIDATE'].includes(String(p?.status)))
      .map(p=>String(p?.candidateId||''))
      .filter(Boolean)
  );

  if(!generationAdvanced&&(
    !competition||
    competition.status==='WAITING_FOR_SEED_HISTORY'||
    competition.status==='STALE_INCUMBENT_CONFIG'
  )){
    competition=createShadowCompetition({
      historyRows:history,
      incumbentConfig,
      parentReleaseId:String(releaseId||'UNAVAILABLE'),
      now,
      minSeedRows
    });
    initialized=true;
  }else if(!generationAdvanced){
    const frozenIds=frozenReviewCandidateIds();
    const fullReviewFreeze=
      governor?.status==='COMPLETE_PROMOTION_REVIEW_REQUIRED'&&
      frozenIds.size>0;
    if(fullReviewFreeze){
      reviewEvidenceFrozen=true;
    }else{
      const before=competition.candidates?.length||0;
      const next=refreshShadowCompetitionHypotheses(competition,{
        historyRows:history,
        incumbentConfig,
        asOf:now,
        maxGeneratedHypotheses
      });
      const after=next.candidates?.length||0;
      refreshed=after!==before||next.hypothesisGenerator?.version!==competition.hypothesisGenerator?.version;
      competition=next;
    }
  }

  const previousProgressAt=Number(competition?.evaluatedHistoryThroughAt??initialCompetition?.evaluatedHistoryThroughAt??0);
  const historyProgressAt=forecastHistoryProgressAt(history);
  const frozenIds=frozenReviewCandidateIds();
  const allCandidatesFrozen=
    (competition?.candidates?.length||0)>0&&
    competition.candidates.every(c=>frozenIds.has(String(c?.artifact?.candidateId)));
  reviewEvidenceFrozen=reviewEvidenceFrozen||frozenIds.size>0;
  if(
    !generationAdvanced&&
    competition?.status==='ACTIVE'&&
    !allCandidatesFrozen&&
    forecastHistoryHasAdvanced(history,previousProgressAt)
  ){
    competition=evaluateShadowCompetition(competition,{
      historyRows:history,
      incumbentConfig,
      asOf:now,
      minimumTrainCases,
      frozenCandidateIds:[...frozenIds]
    });
    evaluated=true;
  }

  if(!allCandidatesFrozen){
    competition={...competition,evaluatedHistoryRows:history.length,evaluatedHistoryThroughAt:historyProgressAt};
  }

  if(!governor&&competition?.status==='ACTIVE'){
    governor=createExperimentGovernor({
      competition,
      championConfigHash:String(competition.incumbentConfigHash||sha256(incumbentConfig)),
      championReleaseId:String(releaseId||'UNAVAILABLE'),
      generationNumber:1,
      now
    });
    governorCreated=true;
  }else if(evaluated&&governor?.status==='ACTIVE'){
    governor=evaluateExperimentGovernor(governor,{competition,now});
    governorEvaluated=true;
  }

  return {
    competitionState:competition,
    experimentGovernorState:governor,
    summary:shadowCompetitionSummary(competition),
    governorSummary:governor?experimentGovernorSummary(governor):null,
    flags:{
      initialized,
      refreshed,
      evaluated,
      governorCreated,
      governorEvaluated,
      generationAdvanced,
      previousGenerationId,
      nextGenerationId,
      reviewEvidenceFrozen,
      frozenReviewCandidates:frozenReviewCandidateIds().size
    },
    historyRows:history.length
  };
}

try{
  const result=run(workerData);
  parentPort.postMessage({ok:true,result});
  parentPort.close();
}catch(err){
  parentPort.postMessage({
    ok:false,
    error:err instanceof Error?err.message:String(err),
    stack:err instanceof Error?err.stack:null
  });
  parentPort.close();
}
