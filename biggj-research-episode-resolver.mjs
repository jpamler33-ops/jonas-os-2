import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_RESEARCH_EPISODE_RESOLVER_VERSION='TCX_BIGGJ_RESEARCH_EPISODE_RESOLVER_V1';

export const DEFAULT_RESEARCH_EPISODE_POLICY=Object.freeze({
  minimumSeparationMs:12*60*60*1000,
  sameFalsifierExtendedWindowMs:48*60*60*1000,
  unconditionalSeparationMs:24*60*60*1000,
  requireDifferentUtcDateInsideUnconditionalWindow:true
});

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};
const finite=(v,f=null)=>{
  if(v===null||v===undefined||v==='') return f;
  const n=Number(v);
  return Number.isFinite(n)?n:f;
};
const uniq=xs=>[...new Set((xs||[]).map(String).filter(Boolean))].sort();
const utcDate=ms=>new Date(Number(ms)).toISOString().slice(0,10);

function normalizeCase(row){
  return {
    caseId:String(row?.caseId||''),
    forecastId:String(row?.forecastId||''),
    assumptionId:String(row?.assumptionId||''),
    symbol:String(row?.symbol||'UNKNOWN').toUpperCase(),
    decisionAsOf:finite(row?.decisionAsOf),
    issueKnowledgeAt:finite(row?.issueKnowledgeAt),
    firstPersistentStaleAt:finite(row?.firstPersistentStaleAt),
    firstSeenByLivingResearchAt:finite(row?.firstSeenByLivingResearchAt),
    falsifierCodes:uniq(row?.falsifierCodes)
  };
}

function overlap(a,b){
  const set=new Set(a||[]);
  return (b||[]).some(x=>set.has(x));
}

function episodeIdFor({assumptionId,anchorCaseId,startAt}){
  return 'research-episode:'+sha256({assumptionId,anchorCaseId,startAt}).slice(0,24);
}

export function resolveBiggjResearchEpisodes(cases,{
  hypothesisCreatedAt,
  asOf=Date.now(),
  policy={}
}={}){
  const created=finite(hypothesisCreatedAt);
  const t=finite(asOf);
  if(created==null||t==null) throw new Error('hypothesisCreatedAt and asOf must be finite');
  if(created>t) throw new Error('hypothesis creation cannot be in the future');

  const cfg={
    ...DEFAULT_RESEARCH_EPISODE_POLICY,
    ...(policy||{})
  };
  cfg.minimumSeparationMs=Math.max(60_000,Number(cfg.minimumSeparationMs)||DEFAULT_RESEARCH_EPISODE_POLICY.minimumSeparationMs);
  cfg.sameFalsifierExtendedWindowMs=Math.max(
    cfg.minimumSeparationMs,
    Number(cfg.sameFalsifierExtendedWindowMs)||DEFAULT_RESEARCH_EPISODE_POLICY.sameFalsifierExtendedWindowMs
  );
  cfg.unconditionalSeparationMs=Math.max(
    cfg.minimumSeparationMs,
    Number(cfg.unconditionalSeparationMs)||DEFAULT_RESEARCH_EPISODE_POLICY.unconditionalSeparationMs
  );

  const rows=(cases||[]).map(normalizeCase);
  const assignments=[];
  const episodes=[];

  for(const row of rows){
    if(!row.caseId||!row.forecastId||!row.assumptionId){
      assignments.push({
        caseId:row.caseId||null,
        forecastId:row.forecastId||null,
        assumptionId:row.assumptionId||null,
        status:'UNRESOLVED_IDENTITY',
        independentEpisodeId:null,
        reasons:['IDENTITY_MISSING']
      });
      continue;
    }
    for(const [name,value] of [
      ['decisionAsOf',row.decisionAsOf],
      ['issueKnowledgeAt',row.issueKnowledgeAt],
      ['firstPersistentStaleAt',row.firstPersistentStaleAt],
      ['firstSeenByLivingResearchAt',row.firstSeenByLivingResearchAt]
    ]){
      if(value!=null&&value>t) throw new Error('future '+name+' blocked for '+row.caseId);
    }
  }

  const groups=new Map();
  for(const row of rows){
    if(!row.caseId||!row.forecastId||!row.assumptionId) continue;
    if(!groups.has(row.assumptionId)) groups.set(row.assumptionId,[]);
    groups.get(row.assumptionId).push(row);
  }

  for(const [assumptionId,group] of [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
    const sorted=[...group].sort((a,b)=>
      Number(a.firstPersistentStaleAt??Infinity)-Number(b.firstPersistentStaleAt??Infinity)||
      Number(a.firstSeenByLivingResearchAt??Infinity)-Number(b.firstSeenByLivingResearchAt??Infinity)||
      a.caseId.localeCompare(b.caseId)
    );
    const localEpisodes=[];

    for(const row of sorted){
      const reasons=[];
      if(row.firstSeenByLivingResearchAt==null){
        assignments.push({
          caseId:row.caseId,forecastId:row.forecastId,assumptionId,
          status:'UNRESOLVED_KNOWLEDGE_TIME',
          independentEpisodeId:null,
          reasons:['FIRST_SEEN_TIME_MISSING']
        });
        continue;
      }
      if(row.firstSeenByLivingResearchAt<=created){
        assignments.push({
          caseId:row.caseId,forecastId:row.forecastId,assumptionId,
          status:'IN_SAMPLE_DISCOVERY',
          independentEpisodeId:null,
          reasons:['KNOWN_AT_OR_BEFORE_HYPOTHESIS_CREATION']
        });
        continue;
      }
      if(row.firstPersistentStaleAt==null){
        assignments.push({
          caseId:row.caseId,forecastId:row.forecastId,assumptionId,
          status:'UNRESOLVED_PERSISTENCE_TIME',
          independentEpisodeId:null,
          reasons:['PERSISTENT_STALE_TIME_MISSING']
        });
        continue;
      }
      if(row.issueKnowledgeAt!=null&&row.firstPersistentStaleAt<row.issueKnowledgeAt){
        assignments.push({
          caseId:row.caseId,forecastId:row.forecastId,assumptionId,
          status:'UNRESOLVED_TIME_ORDER',
          independentEpisodeId:null,
          reasons:['PERSISTENCE_PREDATES_ISSUE_KNOWLEDGE']
        });
        continue;
      }
      if(row.falsifierCodes.length===0){
        assignments.push({
          caseId:row.caseId,forecastId:row.forecastId,assumptionId,
          status:'UNRESOLVED_NO_FALSIFIER',
          independentEpisodeId:null,
          reasons:['EXPLICIT_FALSIFIER_REQUIRED']
        });
        continue;
      }

      let selected=null;
      for(let i=localEpisodes.length-1;i>=0;i--){
        const ep=localEpisodes[i];
        const gap=row.firstPersistentStaleAt-ep.lastAt;
        if(gap<0) continue;
        if(gap>cfg.sameFalsifierExtendedWindowMs) break;

        const closeInTime=gap<cfg.minimumSeparationMs;
        const sameFalsifier=overlap(row.falsifierCodes,ep.falsifierCodes)&&gap<cfg.sameFalsifierExtendedWindowMs;
        const sameUtcDay=utcDate(row.firstPersistentStaleAt)===utcDate(ep.startAt);
        const dateGuard=
          cfg.requireDifferentUtcDateInsideUnconditionalWindow&&
          gap<cfg.unconditionalSeparationMs&&
          sameUtcDay;

        if(closeInTime||sameFalsifier||dateGuard){
          selected=ep;
          if(closeInTime) reasons.push('COMMON_CAUSE_TIME_WINDOW');
          if(sameFalsifier) reasons.push('COMMON_CAUSE_FALSIFIER_OVERLAP');
          if(dateGuard) reasons.push('COMMON_CAUSE_SAME_UTC_DATE');
          break;
        }
      }

      if(!selected){
        selected={
          independentEpisodeId:episodeIdFor({
            assumptionId,
            anchorCaseId:row.caseId,
            startAt:row.firstPersistentStaleAt
          }),
          assumptionId,
          startAt:row.firstPersistentStaleAt,
          lastAt:row.firstPersistentStaleAt,
          anchorCaseId:row.caseId,
          caseIds:[],
          forecastIds:[],
          symbols:[],
          falsifierCodes:[],
          commonCauseReasons:[],
          semantics:{
            episodeIsConservativeCommonCausePartition:true,
            episodeIdDoesNotProveStatisticalIndependence:true,
            crossSymbolAloneNeverCreatesIndependence:true,
            pointInTimeOnly:true
          }
        };
        localEpisodes.push(selected);
      }

      selected.lastAt=Math.max(selected.lastAt,row.firstPersistentStaleAt);
      selected.caseIds=uniq([...selected.caseIds,row.caseId]);
      selected.forecastIds=uniq([...selected.forecastIds,row.forecastId]);
      selected.symbols=uniq([...selected.symbols,row.symbol]);
      selected.falsifierCodes=uniq([...selected.falsifierCodes,...row.falsifierCodes]);
      selected.commonCauseReasons=uniq([...selected.commonCauseReasons,...reasons]);

      assignments.push({
        caseId:row.caseId,
        forecastId:row.forecastId,
        assumptionId,
        status:'RESOLVED_TO_CONSERVATIVE_EPISODE',
        independentEpisodeId:selected.independentEpisodeId,
        reasons:reasons.length?uniq(reasons):['NEW_SEPARATED_EPISODE'],
        episodeAnchorCaseId:selected.anchorCaseId,
        episodeStartAt:selected.startAt,
        pointInTime:true,
        independenceResolved:true,
        statisticalIndependenceProven:false
      });
    }

    for(const ep of localEpisodes){
      episodes.push({
        ...ep,
        caseCount:ep.caseIds.length,
        forecastCount:ep.forecastIds.length,
        symbolCount:ep.symbols.length
      });
    }
  }

  const orderedAssignments=assignments.sort((a,b)=>
    String(a.assumptionId||'').localeCompare(String(b.assumptionId||''))||
    String(a.caseId||'').localeCompare(String(b.caseId||''))
  );
  const orderedEpisodes=episodes.sort((a,b)=>
    a.assumptionId.localeCompare(b.assumptionId)||
    Number(a.startAt)-Number(b.startAt)||
    a.independentEpisodeId.localeCompare(b.independentEpisodeId)
  );
  const resolved=orderedAssignments.filter(x=>x.independenceResolved===true);

  const core={
    version:BIGGJ_RESEARCH_EPISODE_RESOLVER_VERSION,
    hypothesisCreatedAt:created,
    asOf:t,
    policy:{
      minimumSeparationMs:cfg.minimumSeparationMs,
      sameFalsifierExtendedWindowMs:cfg.sameFalsifierExtendedWindowMs,
      unconditionalSeparationMs:cfg.unconditionalSeparationMs,
      requireDifferentUtcDateInsideUnconditionalWindow:cfg.requireDifferentUtcDateInsideUnconditionalWindow===true
    },
    assignments:orderedAssignments,
    episodes:orderedEpisodes,
    counts:{
      cases:orderedAssignments.length,
      resolvedCases:resolved.length,
      unresolvedCases:orderedAssignments.length-resolved.length,
      independentEpisodes:orderedEpisodes.length,
      inSampleDiscoveryCases:orderedAssignments.filter(x=>x.status==='IN_SAMPLE_DISCOVERY').length
    },
    invariants:{
      discoveryCohortCannotCountAsIndependentForwardEvidence:true,
      crossSymbolAloneNeverCreatesIndependence:true,
      sharedEpisodeIdPreventsCorrelatedCaseInflation:true,
      explicitFalsifierRequired:true,
      statisticalIndependenceNotClaimed:true,
      pointInTimeRequired:true
    },
    execution:'SHADOW_ONLY',
    action:'ABSTAIN',
    canInfluencePrimary:false,
    canExecuteLive:false
  };
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function researchEpisodeAssignment(plan,caseId){
  return plan?.assignments?.find(x=>String(x.caseId)===String(caseId))||null;
}
