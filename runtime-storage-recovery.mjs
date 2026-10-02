import path from 'node:path';
import { inspectStoragePressure, cleanupOrphanedPersistenceArtifacts } from './storage-maintenance.mjs';
import { compactResearchDataPlane, cleanupResearchCompactionArtifacts } from './research-data-plane-maintenance.mjs';
import { archiveForecastColdBatch, planForecastHotCompaction, applyForecastHotCompaction, forecastColdArchiveSummary } from './forecast-cold-archive.mjs';

export const RUNTIME_STORAGE_RECOVERY_VERSION='TCX_RUNTIME_STORAGE_RECOVERY_V1';

export async function recoverRuntimeStorage({
  dataDir='/data',
  forecastRuntime=null,
  forecastColdDir=path.join(dataDir,'forecast-cold'),
  warnFreeBytes=96*1024*1024,
  criticalFreeBytes=48*1024*1024,
  logger=console,
  force=false
}={}){
  const before=await inspectStoragePressure({dataDir,warnFreeBytes,criticalFreeBytes});
  const result={version:RUNTIME_STORAGE_RECOVERY_VERSION,before,forecast:null,research:null,cleanup:null,after:null};
  const pressured=force||['WARN','CRITICAL'].includes(String(before?.state||'').toUpperCase());
  if(!pressured){result.after=before;return result;}

  result.cleanup=await cleanupOrphanedPersistenceArtifacts({dataDir,logger});
  await cleanupResearchCompactionArtifacts({dataDir}).catch(()=>{});

  if(forecastRuntime){
    const plan=planForecastHotCompaction(forecastRuntime,{now:Date.now()});
    if(plan.coldIssuances.length||plan.coldTrackerRecords.length){
      const archived=await archiveForecastColdBatch({
        dir:forecastColdDir,
        issuances:plan.coldIssuances,
        trackerRecords:plan.coldTrackerRecords
      });
      if(archived.verified){
        result.forecast={archived,compaction:applyForecastHotCompaction(forecastRuntime,plan)};
      }else{
        result.forecast={archived,compaction:null};
      }
    }else{
      result.forecast={archived:false,reason:'NO_ELIGIBLE_COLD_ROWS',summary:await forecastColdArchiveSummary(forecastColdDir)};
    }
  }

  result.research=await compactResearchDataPlane({
    dataDir,
    pressure:before,
    triggerBytes:force?1:64*1024*1024,
    targetBytes:32*1024*1024,
    minFreeBytes:warnFreeBytes,
    logger
  });
  result.after=await inspectStoragePressure({dataDir,warnFreeBytes,criticalFreeBytes});
  logger.info?.('[TCX_RUNTIME_STORAGE_RECOVERY]',JSON.stringify({
    before:result.before?.state,
    after:result.after?.state,
    forecastRemoved:result.forecast?.compaction||null,
    research:result.research,
    cleanupFreedBytes:result.cleanup?.freedBytes||0
  }));
  return result;
}
