export const BIGGJ_WORLD_MODEL_MEMORY_POLICY_VERSION='BIGGJ_WORLD_MODEL_MEMORY_POLICY_V1';

const finite=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f;};
const boundedInt=(v,min,max,f)=>Math.max(min,Math.min(max,Math.floor(finite(v,f))));

export function deriveWorldModelRefreshPlan(memory={},{
  maxSymbols=12,
  fullKlineRows=130,
  compactMaxSymbols=6,
  compactKlineRows=96,
  fullFetchConcurrency=4,
  compactFetchConcurrency=2,
  fullJournalRowsPerSymbol=1000,
  compactJournalRowsPerSymbol=250,
  heapGraceMb=96,
  retryMs=30_000
}={}){
  const thresholds=memory?.thresholds||{};
  const heap=finite(memory?.heapUsedMb);
  const rss=finite(memory?.rssMb);
  const external=finite(memory?.externalMb);
  const heapLimit=Math.max(1,finite(thresholds?.heapUsedMb,380));
  const rssLimit=Math.max(1,finite(thresholds?.rssMb,780));
  const externalLimit=Math.max(1,finite(thresholds?.externalMb,64));
  const max=boundedInt(maxSymbols,1,100,12);

  if(memory?.pressured!==true){
    return Object.freeze({
      version:BIGGJ_WORLD_MODEL_MEMORY_POLICY_VERSION,
      mode:'FULL',
      reason:'MEMORY_NORMAL',
      symbolLimit:max,
      klineRows:boundedInt(fullKlineRows,48,512,130),
      fetchConcurrency:boundedInt(fullFetchConcurrency,1,12,4),
      journalRowsPerSymbol:boundedInt(fullJournalRowsPerSymbol,30,2000,1000),
      retryMs:null,
      memory:Object.freeze({heapUsedMb:heap,rssMb:rss,externalMb:external,thresholds:{heapUsedMb:heapLimit,rssMb:rssLimit,externalMb:externalLimit}})
    });
  }

  const hardPressure=
    rss>=rssLimit||
    external>=externalLimit||
    heap>=heapLimit+Math.max(16,finite(heapGraceMb,96));

  if(hardPressure){
    return Object.freeze({
      version:BIGGJ_WORLD_MODEL_MEMORY_POLICY_VERSION,
      mode:'DEFERRED',
      reason:rss>=rssLimit?'RSS_HARD_PRESSURE':external>=externalLimit?'EXTERNAL_HARD_PRESSURE':'HEAP_HARD_PRESSURE',
      symbolLimit:0,
      klineRows:0,
      fetchConcurrency:0,
      journalRowsPerSymbol:0,
      retryMs:boundedInt(retryMs,5_000,300_000,30_000),
      memory:Object.freeze({heapUsedMb:heap,rssMb:rss,externalMb:external,thresholds:{heapUsedMb:heapLimit,rssMb:rssLimit,externalMb:externalLimit}})
    });
  }

  return Object.freeze({
    version:BIGGJ_WORLD_MODEL_MEMORY_POLICY_VERSION,
    mode:'COMPACT',
    reason:'MILD_HEAP_PRESSURE',
    symbolLimit:Math.min(max,boundedInt(compactMaxSymbols,5,12,6)),
    klineRows:boundedInt(compactKlineRows,64,160,96),
    fetchConcurrency:boundedInt(compactFetchConcurrency,1,4,2),
    journalRowsPerSymbol:boundedInt(compactJournalRowsPerSymbol,30,1000,250),
    retryMs:null,
    memory:Object.freeze({heapUsedMb:heap,rssMb:rss,externalMb:external,thresholds:{heapUsedMb:heapLimit,rssMb:rssLimit,externalMb:externalLimit}})
  });
}
