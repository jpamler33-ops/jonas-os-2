import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readdir,readFile,stat } from 'node:fs/promises';
import { gzipSync,brotliDecompressSync,gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { archiveMarketFabricSegments,MARKET_FABRIC_ARCHIVE_VERSION } from './market-fabric-archive.mjs';
import { sha256 } from './institutional-kernel.mjs';

test('streams new segment to gzip-9, manifests hashes, then removes only raw copy',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const seg=file+'.segment-2-1.jsonl';
  const raw=JSON.stringify({seq:2,eventHash:'abc'})+'\n';
  await writeFile(seg,raw);
  const r=await archiveMarketFabricSegments({filePath:file,migrateExisting:false});
  assert.equal(r.segments,1);
  assert.equal(r.preferredNewCodec,'gzip-9');
  const names=await readdir(dir);
  const gz=names.find(x=>x.endsWith('.jsonl.gz'));
  assert.ok(gz);
  assert.ok(!names.includes(path.basename(seg)));
  assert.equal(gunzipSync(await readFile(path.join(dir,gz))).toString('utf8'),raw);
  const m=JSON.parse(await readFile(file+'.segments-manifest.json','utf8'));
  assert.equal(m.version,MARKET_FABRIC_ARCHIVE_VERSION);
  assert.equal(m.segments[0].codec,'gzip');
  assert.equal(m.segments[0].lastSeq,2);
  assert.ok(m.segments[0].rawSha256);
  assert.ok(m.fingerprint);
  assert.equal(r.destructiveRetention,false);
});

test('fails closed on tampered manifest',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-bad-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const manifest=file+'.segments-manifest.json';
  await writeFile(manifest,JSON.stringify({version:MARKET_FABRIC_ARCHIVE_VERSION,segments:[{sourceName:'x'}],fingerprint:'bad'})+'\n');
  await assert.rejects(()=>archiveMarketFabricSegments({filePath:file}),/FINGERPRINT_MISMATCH/);
});

test('restart is idempotent after successful archive',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-idem-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const seg=file+'.segment-3-2.jsonl';
  await writeFile(seg,JSON.stringify({seq:3,eventHash:'def'})+'\n');
  const a=await archiveMarketFabricSegments({filePath:file,migrateExisting:false});
  const b=await archiveMarketFabricSegments({filePath:file,migrateExisting:false});
  assert.equal(a.segments,1);
  assert.equal(b.segments,1);
  assert.equal(b.codecBreakdown.gzip.segments,1);
});

test('legacy gzip migration candidate is accepted only when Brotli saves at least two percent',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-migrate-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const sourceName='tcx-market-events.jsonl.segment-1-2-123.jsonl';
  const gzipName=sourceName+'.gz';
  const rows=[];
  for(let i=0;i<200;i++) rows.push(JSON.stringify({seq:i,eventHash:String(i),kind:'MARKET_SNAPSHOT',symbol:'BTCUSDT',nested:{a:'repeat-pattern-'+(i%5),b:Array(20).fill('same-value')}}));
  const raw=rows.join('\n')+'\n';
  const gz=gzipSync(Buffer.from(raw,'utf8'),{level:9});
  await writeFile(path.join(dir,gzipName),gz);
  const item={
    name:gzipName,sourceName,rawBytes:Buffer.byteLength(raw),compressedBytes:gz.length,
    rawSha256:sha256(raw),compressedSha256:sha256(gz),firstSeq:0,lastSeq:199,tailHash:'199',createdAt:123
  };
  const core={version:'TCX_MARKET_FABRIC_ARCHIVE_V2',segments:[item]};
  await writeFile(file+'.segments-manifest.json',JSON.stringify({...core,fingerprint:sha256(core)})+'\n');

  const r=await archiveMarketFabricSegments({filePath:file,maxMigrationsPerRun:1});
  assert.equal(r.migrationAttempts,1);
  const m=JSON.parse(await readFile(file+'.segments-manifest.json','utf8'));
  const persisted=m.segments[0];
  if(r.migratedSegments===1){
    assert.equal(persisted.codec,'brotli');
    const migrated=await readFile(path.join(dir,persisted.name));
    assert.equal(brotliDecompressSync(migrated).toString('utf8'),raw);
    assert.ok(persisted.compressedBytes<gz.length*.98);
    await assert.rejects(()=>stat(path.join(dir,gzipName)),err=>err?.code==='ENOENT');
  }else{
    assert.equal(r.migrationRejected,1);
    assert.equal(persisted.codec,'gzip');
    assert.ok(persisted.brotliCandidateRejectedAt);
    assert.equal(gunzipSync(await readFile(path.join(dir,gzipName))).toString('utf8'),raw);
  }
});

test('legacy Brotli segment is re-packed at quality 11 only when it saves real bytes',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-repack-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const sourceName='tcx-market-events.jsonl.segment-10-200-999.jsonl';
  const brName=sourceName+'.br';
  const rows=[];
  for(let i=0;i<400;i++) rows.push(JSON.stringify({seq:i,eventHash:String(i),kind:'MARKET_SNAPSHOT',symbol:'ETHUSDT',payload:Array(25).fill('repeating-market-state-'+(i%7))}));
  const raw=rows.join('\n')+'\n';
  const {brotliCompressSync,constants}=await import('node:zlib');
  const br=brotliCompressSync(Buffer.from(raw,'utf8'),{params:{
    [constants.BROTLI_PARAM_QUALITY]:4,
    [constants.BROTLI_PARAM_MODE]:constants.BROTLI_MODE_TEXT
  }});
  await writeFile(path.join(dir,brName),br);
  const item={
    name:brName,sourceName,codec:'brotli',rawBytes:Buffer.byteLength(raw),compressedBytes:br.length,
    rawSha256:sha256(raw),compressedSha256:sha256(br),firstSeq:10,lastSeq:200,tailHash:'200',createdAt:999,
    migrationQuality:4
  };
  const core={version:MARKET_FABRIC_ARCHIVE_VERSION,segments:[item]};
  await writeFile(file+'.segments-manifest.json',JSON.stringify({...core,fingerprint:sha256(core)})+'\n');
  const result=await archiveMarketFabricSegments({filePath:file,maxMigrationsPerRun:1});
  assert.equal(result.migrationAttempts,1);
  const m=JSON.parse(await readFile(file+'.segments-manifest.json','utf8'));
  const persisted=m.segments[0];
  if(result.recompressedSegments===1){
    assert.equal(persisted.migrationQuality,11);
    assert.ok(persisted.compressedBytes<br.length*.98);
    assert.ok(persisted.name.endsWith('.q11.br'));
    const packed=await readFile(path.join(dir,persisted.name));
    assert.equal(brotliDecompressSync(packed).toString('utf8'),raw);
    await assert.rejects(()=>stat(path.join(dir,brName)),err=>err?.code==='ENOENT');
  }else{
    assert.equal(result.recompressionRejected,1);
    assert.equal(persisted.name,brName);
    assert.ok(persisted.brotli11CandidateRejectedAt);
  }
});

test('rejected Brotli candidate is not retried on every maintenance pass',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-no-retry-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const sourceName='tcx-market-events.jsonl.segment-1-1-1.jsonl';
  const gzipName=sourceName+'.gz';
  const raw=JSON.stringify({seq:1,eventHash:'x',payload:'abc'})+'\n';
  const gz=gzipSync(Buffer.from(raw,'utf8'),{level:9});
  await writeFile(path.join(dir,gzipName),gz);
  const item={
    name:gzipName,sourceName,codec:'gzip',rawBytes:Buffer.byteLength(raw),compressedBytes:gz.length,
    rawSha256:sha256(raw),compressedSha256:sha256(gz),firstSeq:1,lastSeq:1,tailHash:'x',createdAt:1,
    brotliCandidateRejectedAt:Date.now(),brotliCandidateBytes:gz.length+10,brotliCandidateQuality:11
  };
  const core={version:MARKET_FABRIC_ARCHIVE_VERSION,segments:[item]};
  await writeFile(file+'.segments-manifest.json',JSON.stringify({...core,fingerprint:sha256(core)})+'\n');
  const r=await archiveMarketFabricSegments({filePath:file,maxMigrationsPerRun:1});
  assert.equal(r.migrationAttempts,0);
  assert.equal(r.codecBreakdown.gzip.segments,1);
});


test('archive budget fails closed before committing a new compressed segment',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-budget-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const seg=file+'.segment-1-200-1.jsonl';
  const rows=[];
  for(let i=1;i<=200;i++) rows.push(JSON.stringify({seq:i,eventHash:String(i).padStart(64,'0'),payload:'market-state-'+i}));
  const raw=rows.join('\n')+'\n';
  await writeFile(seg,raw);

  const result=await archiveMarketFabricSegments({
    filePath:file,
    maxArchivedBytes:1,
    migrateExisting:false
  });

  assert.equal(result.budgetBlocked,true);
  assert.equal(result.budgetBlockedSegments,1);
  assert.ok(result.budgetBlockedCandidateBytes>1);
  assert.equal(result.archivedBytes,0);
  assert.equal(result.segments,0);

  const names=await readdir(dir);
  assert.ok(names.includes(path.basename(seg)));
  assert.ok(!names.some(x=>x.endsWith('.jsonl.gz')));
  assert.equal(await readFile(seg,'utf8'),raw);
});

test('archive budget admits a segment when compressed bytes fit',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-budget-fit-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const seg=file+'.segment-1-300-1.jsonl';
  const rows=[];
  for(let i=1;i<=300;i++) rows.push(JSON.stringify({seq:i,eventHash:String(i).padStart(64,'0'),payload:'repeat-repeat-repeat'}));
  const raw=rows.join('\n')+'\n';
  await writeFile(seg,raw);

  const result=await archiveMarketFabricSegments({
    filePath:file,
    maxArchivedBytes:10*1024*1024,
    migrateExisting:false
  });

  assert.equal(result.budgetBlocked,false);
  assert.equal(result.budgetBlockedSegments,0);
  assert.equal(result.segments,1);
  assert.ok(result.archivedBytes>0);
  await assert.rejects(()=>stat(seg),err=>err?.code==='ENOENT');
});
