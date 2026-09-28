import path from 'node:path';
import { access, readdir, stat, unlink } from 'node:fs/promises';

const DEFAULT_CANONICAL_FILES = Object.freeze([
  'tcx-forecast-runtime.json',
  'tcx-evidence-history.json',
  'tcx-episodes.json',
  'tcx-shadow-oms.json',
  'tcx-shadow-portfolio.json',
  'tcx-release-registry.jsonl'
]);

const ARTIFACT_MARKERS = Object.freeze(['.tmp-', '.corrupt-', '.truncated-tail-']);

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

function artifactOwner(name, canonicalFiles) {
  for (const canonical of canonicalFiles) {
    if (!name.startsWith(canonical)) continue;
    if (ARTIFACT_MARKERS.some(marker => name.startsWith(canonical + marker))) return canonical;
  }
  return null;
}

export async function cleanupOrphanedPersistenceArtifacts({
  dataDir='/data',
  canonicalFiles=DEFAULT_CANONICAL_FILES,
  minAgeMs=5*60_000,
  now=Date.now(),
  logger=console
}={}) {
  const result={scanned:0,removed:[],skipped:[],freedBytes:0,errors:[]};
  let entries;
  try { entries=await readdir(dataDir,{withFileTypes:true}); }
  catch(err) {
    if (err?.code==='ENOENT') return result;
    result.errors.push({file:dataDir,error:err instanceof Error?err.message:String(err)});
    return result;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const canonical=artifactOwner(entry.name,canonicalFiles);
    if (!canonical) continue;
    result.scanned++;
    const artifactPath=path.join(dataDir,entry.name);
    const canonicalPath=path.join(dataDir,canonical);
    try {
      if (!(await exists(canonicalPath))) {
        result.skipped.push({file:entry.name,reason:'CANONICAL_MISSING'});
        continue;
      }
      const meta=await stat(artifactPath);
      const ageMs=Math.max(0,Number(now)-Number(meta.mtimeMs));
      if (ageMs<minAgeMs) {
        result.skipped.push({file:entry.name,reason:'TOO_RECENT',ageMs});
        continue;
      }
      await unlink(artifactPath);
      result.removed.push({file:entry.name,bytes:Number(meta.size)||0});
      result.freedBytes+=Number(meta.size)||0;
    } catch(err) {
      result.errors.push({file:entry.name,error:err instanceof Error?err.message:String(err)});
    }
  }

  if (result.removed.length || result.errors.length) {
    logger.info?.('persistence artifact cleanup',JSON.stringify({
      removed:result.removed.length,
      freedBytes:result.freedBytes,
      skipped:result.skipped.length,
      errors:result.errors
    }));
  }
  return result;
}

export const STORAGE_MAINTENANCE_VERSION='TCX_STORAGE_MAINTENANCE_V1';
