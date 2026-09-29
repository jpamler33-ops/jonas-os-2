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
import { createCandidateDeterministicReplayProof } from './model-promotion-proof-factory.mjs';

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

  if(
    !competition||
    competition.status==='WAITING_FOR_SEED_HISTORY'||
    competition.status==='STALE_INCUMBENT_CONFIG'
  ){
    competition=createShadowCompetition({
      historyRows:history,
      incumbentConfig,
      parentReleaseId:String(releaseId||'UNAVAILABLE'),
      now,
      minSeedRows
    });
    initialized=true;
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

  const previousProgressAt=Number(competition?.evaluatedHistoryThroughAt??initialCompetition?.evaluatedHistoryThroughAt??0);
  const historyProgressAt=forecastHistoryProgressAt(history);
  if(
    competition?.status==='ACTIVE'&&
    forecastHistoryHasAdvanced(history,previousProgressAt)
  ){
    competition=evaluateShadowCompetition(competition,{
      historyRows:history,
      incumbentConfig,
      asOf:now,
      minimumTrainCases
    });
    evaluated=true;
  }

  competition={...competition,evaluatedHistoryRows:history.length,evaluatedHistoryThroughAt:historyProgressAt};

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

  const promotionReplayProofs={};
  if(governor){
    for(const participant of governor.participants||[]){
      if(!['PROMOTION_REVIEW_REQUIRED','PROMOTION_CANDIDATE'].includes(String(participant?.status))) continue;
      const live=(competition?.candidates||[]).find(x=>String(x?.artifact?.candidateId)===String(participant.candidateId));
      if(!live?.artifact) {
        promotionReplayProofs[String(participant.candidateId)]={ok:false,error:'CANDIDATE_NOT_FOUND'};
        continue;
      }
      try{
        const proof=createCandidateDeterministicReplayProof({
          historyRows:history,
          incumbentConfig,
          candidate:live.artifact,
          asOf:now,
          minimumTrainCases
        });
        promotionReplayProofs[String(participant.candidateId)]={ok:true,proof};
      }catch(err){
        promotionReplayProofs[String(participant.candidateId)]={
          ok:false,
          error:err instanceof Error?err.message:String(err)
        };
      }
    }
  }

  return {
    competitionState:competition,
    experimentGovernorState:governor,
    summary:shadowCompetitionSummary(competition),
    governorSummary:governor?experimentGovernorSummary(governor):null,
    flags:{initialized,refreshed,evaluated,governorCreated,governorEvaluated},
    historyRows:history.length,
    promotionReplayProofs
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
