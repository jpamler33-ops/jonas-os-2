import { sha256 } from './institutional-kernel.mjs';
import { STATE_STORE_SCHEMA_VERSION, STATE_STORE_LEGACY_SCHEMA_VERSIONS } from './state-store.mjs';
import { EPISODE_MEMORY_SCHEMA_VERSION } from './episode-memory.mjs';
import { EVIDENCE_HISTORY_SCHEMA_VERSION } from './evidence-history.mjs';
import { SHADOW_OMS_SCHEMA_VERSION } from './shadow-oms.mjs';
import { VENUE_QUALITY_MEMORY_SCHEMA_VERSION } from './venue-quality-memory.mjs';
import { INSTITUTIONAL_FORECAST_RUNTIME_VERSION } from './institutional-forecast-runtime.mjs';
import { RESEARCH_DATA_PLANE_VERSION } from './research-data-plane.mjs';
import { RESEARCH_DATA_GOVERNANCE_VERSION } from './research-data-governance.mjs';
import { MODEL_CANDIDATE_REGISTRY_VERSION } from './model-candidate-registry.mjs';

export const PERSISTENCE_CONTRACTS_VERSION='TCX_PERSISTENCE_CONTRACTS_V1';

const CONTRACTS=Object.freeze([
  Object.freeze({
    id:'USER_STATE',
    format:'JSON_ATOMIC_RENAME',
    env:'TCX_STATE_FILE',
    defaultPath:'/data/tcx-state.json',
    schema:STATE_STORE_SCHEMA_VERSION,
    legacySchemas:[...STATE_STORE_LEGACY_SCHEMA_VERSIONS],
    criticality:'DEGRADE',
    corruptionPolicy:'BACKUP_AND_START_CLEAN_WITH_WARNING'
  }),
  Object.freeze({
    id:'EPISODE_MEMORY',
    format:'JSON_ATOMIC_RENAME',
    env:'TCX_EPISODE_FILE',
    defaultPath:'/data/tcx-episodes.json',
    schema:EPISODE_MEMORY_SCHEMA_VERSION,
    legacySchemas:[],
    criticality:'BLOCK',
    corruptionPolicy:'BACKUP_AND_FAIL_READINESS'
  }),
  Object.freeze({
    id:'EVIDENCE_HISTORY',
    format:'JSON_ATOMIC_RENAME',
    env:'TCX_EVIDENCE_HISTORY_FILE',
    defaultPath:'/data/tcx-evidence-history.json',
    schema:EVIDENCE_HISTORY_SCHEMA_VERSION,
    legacySchemas:[],
    criticality:'BLOCK',
    corruptionPolicy:'BACKUP_AND_FAIL_READINESS'
  }),
  Object.freeze({
    id:'FORECAST_RUNTIME',
    format:'JSON_ATOMIC_RENAME',
    env:'TCX_FORECAST_RUNTIME_FILE',
    defaultPath:'/data/tcx-forecast-runtime.json',
    schema:INSTITUTIONAL_FORECAST_RUNTIME_VERSION,
    legacySchemas:[],
    criticality:'BLOCK',
    corruptionPolicy:'BACKUP_AND_FAIL_READINESS'
  }),
  Object.freeze({
    id:'SHADOW_OMS',
    format:'JSON_ATOMIC_RENAME',
    env:'TCX_SHADOW_OMS_FILE',
    defaultPath:'/data/tcx-shadow-oms.json',
    schema:SHADOW_OMS_SCHEMA_VERSION,
    legacySchemas:[],
    criticality:'DEGRADE',
    corruptionPolicy:'BACKUP_AND_DISABLE_SHADOW_EXECUTION_RESEARCH'
  }),
  Object.freeze({
    id:'VENUE_QUALITY_MEMORY',
    format:'JSON_ATOMIC_RENAME',
    env:'TCX_VENUE_QUALITY_MEMORY_FILE',
    defaultPath:'/data/tcx-venue-quality-memory.json',
    schema:VENUE_QUALITY_MEMORY_SCHEMA_VERSION,
    legacySchemas:[],
    criticality:'DEGRADE',
    corruptionPolicy:'BACKUP_AND_DISABLE_VENUE_QUALITY_RESEARCH'
  }),
  Object.freeze({
    id:'AUDIT_LEDGER',
    format:'HASH_CHAIN_JSONL_FSYNC',
    env:'TCX_AUDIT_LEDGER_FILE',
    defaultPath:'/data/tcx-audit-ledger.jsonl',
    schema:'AUDIT_CHAIN_V1',
    legacySchemas:[],
    criticality:'BLOCK',
    corruptionPolicy:'FAIL_CLOSED'
  }),
  Object.freeze({
    id:'MARKET_DATA_FABRIC',
    format:'HASH_CHAIN_JSONL_FSYNC',
    env:'TCX_MARKET_FABRIC_FILE',
    defaultPath:'/data/tcx-market-events.jsonl',
    schema:'MARKET_FABRIC_V1',
    legacySchemas:[],
    criticality:'BLOCK',
    corruptionPolicy:'FAIL_CLOSED'
  }),
  Object.freeze({
    id:'RELEASE_REGISTRY',
    format:'HASH_CHAIN_JSONL_FSYNC',
    env:'TCX_RELEASE_REGISTRY_FILE',
    defaultPath:'/data/tcx-release-registry.jsonl',
    schema:'RR_V1',
    legacySchemas:[],
    criticality:'BLOCK',
    corruptionPolicy:'FAIL_CLOSED'
  }),
  Object.freeze({
    id:'MODEL_CANDIDATE_REGISTRY',
    format:'HASH_CHAIN_JSONL_FSYNC',
    env:'TCX_MODEL_CANDIDATE_REGISTRY_FILE',
    defaultPath:'/data/tcx-model-candidate-registry.jsonl',
    schema:MODEL_CANDIDATE_REGISTRY_VERSION,
    legacySchemas:[],
    criticality:'DEGRADE',
    corruptionPolicy:'FAIL_CLOSED_MODEL_PROMOTION_DEGRADE_SERVING'
  }),
  Object.freeze({
    id:'RESEARCH_DATA_PLANE',
    format:'HASH_CHAIN_JSONL_FSYNC_BOUNDED_RAM',
    env:'TCX_RESEARCH_DATA_PLANE_FILE',
    defaultPath:'/data/tcx-research-data-plane.jsonl',
    schema:RESEARCH_DATA_PLANE_VERSION,
    legacySchemas:[],
    criticality:'DEGRADE',
    corruptionPolicy:'FAIL_CLOSED_RESEARCH_FEATURES'
  }),
  Object.freeze({
    id:'RESEARCH_DATA_GOVERNANCE',
    format:'JSON_ATOMIC_RENAME',
    env:'TCX_RESEARCH_GOVERNANCE_FILE',
    defaultPath:'/data/tcx-research-governance.json',
    schema:RESEARCH_DATA_GOVERNANCE_VERSION,
    legacySchemas:[],
    criticality:'DEGRADE',
    corruptionPolicy:'BACKUP_AND_START_CLEAN_WITH_WARNING'
  })
]);

function cleanState(v){
  return {
    healthy:v?.healthy===true,
    recoveredFromCorrupt:v?.recoveredFromCorrupt===true,
    migrationNeeded:v?.migrationNeeded===true,
    loadedSchema:v?.loadedSchema??null
  };
}

export function persistenceContractManifest(){
  return Object.freeze({
    version:PERSISTENCE_CONTRACTS_VERSION,
    mode:'LOCAL_FILE_SINGLE_REPLICA',
    stores:CONTRACTS.map(x=>structuredClone(x)),
    invariants:Object.freeze({
      atomicJsonWrites:true,
      hashChainFsyncForLedgers:true,
      horizontalScalingAllowed:false,
      criticalCorruptionFailsReadiness:true
    }),
    fingerprint:sha256(CONTRACTS)
  });
}

export function evaluatePersistenceCompatibility({
  stores={},
  localFilePersistence=true,
  replicaCount=1
}={}){
  const hard=[];
  const warnings=[];
  const details=[];

  for(const contract of CONTRACTS){
    const state=cleanState(stores[contract.id]);
    const provided=Object.prototype.hasOwnProperty.call(stores,contract.id);
    if(!provided){
      details.push({id:contract.id,status:'UNOBSERVED',criticality:contract.criticality});
      continue;
    }

    let status='READY';
    if(!state.healthy){
      status=contract.criticality==='BLOCK'?'BLOCKED':'DEGRADED';
      (contract.criticality==='BLOCK'?hard:warnings).push(contract.id+'_UNHEALTHY');
    }
    if(state.recoveredFromCorrupt){
      status=contract.criticality==='BLOCK'?'BLOCKED':'DEGRADED';
      (contract.criticality==='BLOCK'?hard:warnings).push(contract.id+'_RECOVERED_FROM_CORRUPT');
    }
    if(state.migrationNeeded){
      const supported=contract.legacySchemas.some(x=>String(x)===String(state.loadedSchema));
      if(supported){
        if(status==='READY') status='DEGRADED';
        warnings.push(contract.id+'_MIGRATION_PENDING');
      }else{
        status='BLOCKED';
        hard.push(contract.id+'_UNSUPPORTED_SCHEMA');
      }
    }

    details.push({
      id:contract.id,
      status,
      criticality:contract.criticality,
      schema:contract.schema,
      loadedSchema:state.loadedSchema
    });
  }

  const replicas=Math.max(1,Math.floor(Number(replicaCount)||1));
  if(localFilePersistence&&replicas>1) hard.push('LOCAL_FILE_PERSISTENCE_MULTI_REPLICA_FORBIDDEN');

  const hardReasons=[...new Set(hard)];
  const warningReasons=[...new Set(warnings)];
  const state=hardReasons.length?'BLOCKED':warningReasons.length?'DEGRADED':'READY';

  const core={
    version:PERSISTENCE_CONTRACTS_VERSION,
    state,
    compatible:hardReasons.length===0,
    hardReasons,
    warningReasons,
    details,
    deployment:{
      persistenceMode:localFilePersistence?'LOCAL_FILE_SINGLE_REPLICA':'EXTERNAL_SHARED',
      replicas,
      horizontalScalingAllowed:!localFilePersistence
    },
    executionMode:'SHADOW_ONLY',
    action:'ABSTAIN',
    canExecute:false
  };

  return Object.freeze({...core,fingerprint:sha256(core)});
}

export function persistenceContracts(){
  return CONTRACTS.map(x=>structuredClone(x));
}
