export const OPERATIONAL_READINESS_VERSION='TCX_OPERATIONAL_READINESS_V1';

function bool(v){return v===true;}
function clean(xs){return [...new Set((xs||[]).map(String).filter(Boolean))];}

export function evaluateOperationalReadiness({
  auditLedger,
  marketFabric,
  releaseRegistry,
  runtimeReleaseRecord,
  forecastRuntime,
  persistence={},
  episodePersistence={},
  evidenceHistory={},
  providerHealth={},
  slo={},
  persistenceCompatibility=null,
  localFilePersistence=true,
  replicaCount=1
}={}){
  const hard=[];
  const warnings=[];

  if(!bool(auditLedger?.healthy)) hard.push('AUDIT_LEDGER_UNHEALTHY');
  if(!bool(marketFabric?.healthy)) hard.push('MARKET_FABRIC_UNHEALTHY');
  if(!bool(releaseRegistry?.healthy)) hard.push('RELEASE_REGISTRY_UNHEALTHY');
  if(bool(releaseRegistry?.recoveredFromTruncatedTail)) warnings.push('RELEASE_REGISTRY_TRUNCATED_TAIL_RECOVERED');
  if(!runtimeReleaseRecord) hard.push('CURRENT_RUNTIME_RELEASE_NOT_REGISTERED');
  if(!bool(forecastRuntime?.healthy)) hard.push('FORECAST_RUNTIME_UNHEALTHY');
  if(!bool(persistence?.healthy)) hard.push('STATE_PERSISTENCE_UNHEALTHY');
  if(!bool(episodePersistence?.healthy)) hard.push('EPISODE_PERSISTENCE_UNHEALTHY');
  if(!bool(evidenceHistory?.healthy)) hard.push('EVIDENCE_HISTORY_UNHEALTHY');

  if(bool(forecastRuntime?.recoveredFromCorrupt)) hard.push('FORECAST_RUNTIME_RECOVERED_FROM_CORRUPT');
  if(bool(forecastRuntime?.recoveredFromOversizedSnapshot)) warnings.push('FORECAST_RUNTIME_OVERSIZED_SNAPSHOT_RECOVERED');
  if(bool(episodePersistence?.recoveredFromCorrupt)) hard.push('EPISODE_MEMORY_RECOVERED_FROM_CORRUPT');
  if(bool(evidenceHistory?.recoveredFromCorrupt)) hard.push('EVIDENCE_HISTORY_RECOVERED_FROM_CORRUPT');
  if(bool(persistence?.recoveredFromCorrupt)) warnings.push('USER_STATE_RECOVERED_FROM_CORRUPT');

  const replicas=Math.max(1,Math.floor(Number(replicaCount)||1));
  if(localFilePersistence&&replicas>1) hard.push('LOCAL_FILE_STATE_REQUIRES_SINGLE_REPLICA');

  const circuits=Object.values(providerHealth?.circuits||{});
  const openCircuits=circuits.filter(x=>x?.open===true).length;
  if(openCircuits) warnings.push('PROVIDER_CIRCUIT_OPEN_'+openCircuits);

  const maxPending=Number(providerHealth?.maxPending??0);
  const pending=Number(providerHealth?.pending??0);
  if(maxPending===0&&pending>0) hard.push('PROVIDER_BACKPRESSURE_POLICY_BREACH');
  else if(maxPending>0&&pending>=maxPending) hard.push('PROVIDER_BACKPRESSURE_SATURATED');
  else if(maxPending>0&&pending/maxPending>=.8) warnings.push('PROVIDER_BACKPRESSURE_HIGH');

  for(const breach of slo?.breaches||[]) warnings.push('SLO_'+String(breach));

  if(persistenceCompatibility){
    if(persistenceCompatibility.compatible===false){
      hard.push('PERSISTENCE_CONTRACT_BLOCKED');
      for(const reason of persistenceCompatibility.hardReasons||[]){
        hard.push('PERSISTENCE_'+String(reason));
      }
    }
    for(const reason of persistenceCompatibility.warningReasons||[]){
      warnings.push('PERSISTENCE_'+String(reason));
    }
  }

  const hardReasons=clean(hard);
  const warningReasons=clean(warnings);
  const ready=hardReasons.length===0;
  const state=ready?(warningReasons.length?'DEGRADED':'READY'):'NOT_READY';

  return Object.freeze({
    version:OPERATIONAL_READINESS_VERSION,
    state,
    ready,
    httpStatus:ready?200:503,
    hardReasons,
    warningReasons,
    deployment:{
      persistenceMode:localFilePersistence?'LOCAL_FILE_SINGLE_REPLICA':'EXTERNAL_SHARED',
      replicas,
      horizontalScalingAllowed:!localFilePersistence
    },
    slo:{
      ok:slo?.ok!==false,
      breaches:clean(slo?.breaches||[])
    },
    provider:{
      openCircuits,
      pending,
      maxPending
    },
    persistenceCompatibility:persistenceCompatibility?{
      version:persistenceCompatibility.version||null,
      state:persistenceCompatibility.state||'UNKNOWN',
      compatible:persistenceCompatibility.compatible===true,
      fingerprint:persistenceCompatibility.fingerprint||null
    }:null,
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  });
}
