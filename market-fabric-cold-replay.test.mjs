import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { openMarketDataFabric, appendMarketEvents, createMarketEventInput } from './market-data-fabric.mjs';
import { reconstructInstitutionalState, verifyNoFutureLeakage } from './deterministic-replay.mjs';
import { sha256 } from './institutional-kernel.mjs';
import { sampleArchivedReplayPoints, loadArchivedReplayTail, classifyVerifiedReplayAvailability } from './market-fabric-cold-replay.mjs';

function manifestValue(version,segments){
  const core={version,segments};
  return {...core,fingerprint:sha256(core)};
}

function input({kind='PRIMARY_MARKET',streamKey='PRIMARY:BTCUSDT',sourceEventId,eventTime,availableAt,payload}){
  return createMarketEventInput({
    kind,
    streamKey,
    source:'TEST',
    sourceEventId,
    eventTime,
    availableAt,
    ingestedAt:availableAt,
    payload
  });
}

async function fixture(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-replay-test-'));
  const rawPath=path.join(dir,'raw.jsonl');
  const fabric=await openMarketDataFabric(rawPath,{maxInMemoryEvents:1000});
  const rows=[];
  for(let i=0;i<18;i++){
    const t=1_000_000+i*60_000;
    rows.push(input({
      kind:'PRIMARY_MARKET',
      streamKey:'PRIMARY:BTCUSDT',
      sourceEventId:'p'+i,
      eventTime:t,
      availableAt:t+100,
      payload:{symbol:'BTCUSDT',price:100+i,source:'TEST'}
    }));
    rows.push(input({
      kind:'CANDLE_CLOSE',
      streamKey:'CANDLE:BTCUSDT:5m',
      sourceEventId:'bar'+i,
      eventTime:t,
      availableAt:t+200,
      payload:{symbol:'BTCUSDT',c:100+i,closed:true}
    }));
  }
  rows.push(input({
    kind:'WITNESS_CONSENSUS',
    streamKey:'WITNESS:BTCUSDT',
    sourceEventId:'w1',
    eventTime:2_000_000,
    availableAt:2_000_100,
    payload:{symbol:'BTCUSDT',agreementScore:0.9,externalWitnessCount:2}
  }));
  await appendMarketEvents(fabric,rows);

  const raw=await readFile(rawPath);
  const compressed=gzipSync(raw,{level:9});
  const name='tcx-market-events.jsonl.segment-1-'+fabric.seq+'-1.jsonl.gz';
  const compressedPath=path.join(dir,name);
  await writeFile(compressedPath,compressed);
  const item={
    name,
    sourceName:name.slice(0,-3),
    codec:'gzip',
    rawBytes:raw.length,
    compressedBytes:compressed.length,
    rawSha256:sha256(raw),
    compressedSha256:sha256(compressed),
    firstSeq:1,
    lastSeq:fabric.seq,
    tailHash:fabric.tailHash,
    createdAt:3_000_000
  };
  const base=path.join(dir,'tcx-market-events.jsonl');
  await writeFile(base+'.segments-manifest.json',JSON.stringify(manifestValue('TCX_MARKET_FABRIC_ARCHIVE_V3',[item]))+'\n');
  return {dir,base,item,compressedPath,compressed};
}

test('samples verified archived PRIMARY_MARKET replay points',async()=>{
  const f=await fixture();
  try{
    const result=await sampleArchivedReplayPoints({
      filePath:f.base,
      coldStore:{enabled:false},
      symbol:'BTCUSDT',
      before:10_000_000,
      limit:8
    });
    assert.equal(result.points.length,8);
    assert.equal(result.localSegments,1);
    assert.equal(result.coldSegments,0);
    assert.ok(result.points[0]>result.points.at(-1));
  }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('loads bounded verified archive tail for deterministic replay',async()=>{
  const f=await fixture();
  try{
    const asOf=2_100_000;
    const result=await loadArchivedReplayTail({
      filePath:f.base,
      coldStore:{enabled:false},
      symbol:'BTCUSDT',
      asOf,
      limit:1000
    });
    const state=reconstructInstitutionalState(result.events,{symbol:'BTCUSDT',asOf});
    assert.equal(state.primary.price,117);
    assert.equal(state.witness.agreementScore,0.9);
    assert.equal(verifyNoFutureLeakage(state).ok,true);
    assert.equal(result.completeTail,true);
  }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('cold-only segment is restored, verified and consumed without persistent restore',async()=>{
  const f=await fixture();
  try{
    const remote=f.compressed;
    await unlink(f.compressedPath);
    const manifest=JSON.parse(await readFile(f.base+'.segments-manifest.json','utf8'));
    manifest.segments[0].cold={
      provider:'CLOUDFLARE_R2',
      bucket:'biggj',
      key:'market-fabric/test',
      compressedBytes:f.item.compressedBytes,
      compressedSha256:f.item.compressedSha256,
      rawBytes:f.item.rawBytes,
      rawSha256:f.item.rawSha256,
      codec:'gzip',
      recoveryVerified:true
    };
    const next=manifestValue(manifest.version,manifest.segments);
    await writeFile(f.base+'.segments-manifest.json',JSON.stringify(next)+'\n');
    let restores=0;
    const coldStore={
      enabled:true,
      async restoreVerifiedSegment({targetPath}){
        restores++;
        await writeFile(targetPath,remote);
        return {restored:true,targetPath,bytes:remote.length,sha256:sha256(remote)};
      },
      summary(){return {provider:'CLOUDFLARE_R2',bucket:'biggj'};}
    };
    const result=await sampleArchivedReplayPoints({
      filePath:f.base,coldStore,symbol:'BTCUSDT',before:10_000_000,limit:4
    });
    assert.equal(restores,1);
    assert.equal(result.coldSegments,1);
    assert.equal(result.points.length,4);
  }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('corrupted archived segment fails closed before returning replay data',async()=>{
  const f=await fixture();
  try{
    const corrupted=Buffer.from(f.compressed);
    corrupted[Math.floor(corrupted.length/2)]^=0xff;
    await writeFile(f.compressedPath,corrupted);
    await assert.rejects(
      ()=>sampleArchivedReplayPoints({
        filePath:f.base,coldStore:{enabled:false},symbol:'BTCUSDT',before:10_000_000
      }),
      /TCX_COLD_REPLAY_/
    );
  }finally{await rm(f.dir,{recursive:true,force:true});}
});


test('replay availability fails closed when archived history cannot be verified',()=>{
  assert.deepEqual(
    classifyVerifiedReplayAvailability({primary:null},{archiveAttempted:true,archiveError:'TCX_COLD_REPLAY_COMPRESSED_HASH_MISMATCH'}),
    {available:false,status:'FAIL_CLOSED',reason:'ARCHIVE_VERIFICATION_FAILED'}
  );
});

test('replay availability does not certify an archive state without PRIMARY_MARKET',()=>{
  assert.deepEqual(
    classifyVerifiedReplayAvailability({primary:null},{archiveAttempted:true}),
    {available:false,status:'UNAVAILABLE',reason:'NO_PRIMARY_AT_ASOF'}
  );
});

test('replay availability certifies a state only when PRIMARY_MARKET exists',()=>{
  assert.deepEqual(
    classifyVerifiedReplayAvailability({primary:{price:123}},{archiveAttempted:true}),
    {available:true,status:'VERIFIED',reason:null}
  );
});
