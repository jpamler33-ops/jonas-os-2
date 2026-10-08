import { sha256 } from './institutional-kernel.mjs';

export const WORLD_EVIDENCE_DIAGNOSTICS_VERSION='BIGGJ_WORLD_EVIDENCE_DIAGNOSTICS_V1';

const BLOCKER_KEYS=Object.freeze([
  'NO_CANDIDATE','FORECAST_GATE','PROBABILITY_GATE','EDGE_GATE','RETURN_GATE',
  'LEAGUE_RUNTIME_UNHEALTHY','LEAGUE_DECISION_ALREADY_TRADED','LEAGUE_STRATEGY_OPEN_CAP',
  'LEAGUE_STRATEGY_SYMBOL_CAP','ORDER_ERROR','AWAITING_CLOSE','CLOSED_FORWARD_SAMPLE'
]);

function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
function clone(v){return structuredClone(v);}
function keyOf({worldId,genomeId,generation}){
  return [String(worldId||'UNKNOWN'),String(genomeId||'UNKNOWN'),String(generation||0)].join('|');
}
function emptyRow(meta,now){
  return {
    worldId:String(meta.worldId||'UNKNOWN'),genomeId:String(meta.genomeId||'UNKNOWN'),generation:n(meta.generation),
    createdAt:now,updatedAt:now,candidateAttempts:0,ordersPlaced:0,closedForwardSamples:0,
    blockers:Object.fromEntries(BLOCKER_KEYS.map(k=>[k,0])),lastEvent:null
  };
}

export function createWorldEvidenceDiagnostics({now=Date.now()}={}){
  return {version:WORLD_EVIDENCE_DIAGNOSTICS_VERSION,createdAt:now,updatedAt:now,rows:{},execution:'SHADOW_ONLY',canExecuteLive:false};
}

export function recordWorldEvidenceEvent(state,meta,{event,reason=null,now=Date.now(),detail=null}={}){
  const next=state?.version===WORLD_EVIDENCE_DIAGNOSTICS_VERSION?clone(state):createWorldEvidenceDiagnostics({now});
  const key=keyOf(meta);const row=next.rows[key]||emptyRow(meta,now);
  const e=String(event||reason||'UNKNOWN').toUpperCase();
  if(e==='CANDIDATE') row.candidateAttempts++;
  if(e==='ORDER_PLACED') row.ordersPlaced++;
  if(e==='CLOSED_FORWARD_SAMPLE') row.closedForwardSamples++;
  const blocker=BLOCKER_KEYS.includes(String(reason||'').toUpperCase())?String(reason).toUpperCase():BLOCKER_KEYS.includes(e)?e:null;
  if(blocker) row.blockers[blocker]=n(row.blockers[blocker])+1;
  row.updatedAt=now;row.lastEvent={event:e,reason:reason?String(reason):null,at:now,detail:detail||null};
  next.rows[key]=row;next.updatedAt=now;return next;
}

export function summarizeWorldEvidenceDiagnostics(state,{worlds=[],now=Date.now(),staleMs=2*60*60*1000}={}){
  const rows=state?.rows||{};const out=[];
  for(const world of worlds||[]){
    const meta={worldId:world.worldId,genomeId:world.currentGenome?.genomeId,generation:world.generation};
    const row=rows[keyOf(meta)]||emptyRow(meta,now);
    const ranked=Object.entries(row.blockers||{}).filter(([,v])=>n(v)>0).sort((a,b)=>n(b[1])-n(a[1]));
    const ageMs=Math.max(0,now-n(row.updatedAt||row.createdAt||now));
    out.push({...row,ageMs,stalled:row.closedForwardSamples===0&&ageMs>=staleMs,topBlocker:ranked[0]?.[0]||'NO_OBSERVED_BLOCKER'});
  }
  return {
    version:WORLD_EVIDENCE_DIAGNOSTICS_VERSION,generatedAt:now,worlds:out,
    stalledWorlds:out.filter(x=>x.stalled).length,
    fingerprint:sha256(out.map(x=>({worldId:x.worldId,genomeId:x.genomeId,generation:x.generation,topBlocker:x.topBlocker,closed:x.closedForwardSamples}))),
    execution:'SHADOW_ONLY',action:'ABSTAIN',canExecute:false,canExecuteLive:false
  };
}
