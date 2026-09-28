import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readdir,readFile,stat } from 'node:fs/promises';
import { gzipSync,brotliDecompressSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { archiveMarketFabricSegments,MARKET_FABRIC_ARCHIVE_VERSION } from './market-fabric-archive.mjs';
import { sha256 } from './institutional-kernel.mjs';

test('streams segment to Brotli, manifests hashes, then removes only raw copy',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const seg=file+'.segment-2-1.jsonl';
  const raw=JSON.stringify({seq:2,eventHash:'abc'})+'\n';
  await writeFile(seg,raw);
  const r=await archiveMarketFabricSegments({filePath:file});
  assert.equal(r.segments,1);
  assert.equal(r.coldCodec,'brotli');
  const names=await readdir(dir);
  const br=names.find(x=>x.endsWith('.jsonl.br'));
  assert.ok(br);
  assert.ok(!names.includes(path.basename(seg)));
  assert.equal(brotliDecompressSync(await readFile(path.join(dir,br))).toString('utf8'),raw);
  const m=JSON.parse(await readFile(file+'.segments-manifest.json','utf8'));
  assert.equal(m.version,MARKET_FABRIC_ARCHIVE_VERSION);
  assert.equal(m.segments[0].codec,'brotli');
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
  const a=await archiveMarketFabricSegments({filePath:file});
  const b=await archiveMarketFabricSegments({filePath:file});
  assert.equal(a.segments,1);
  assert.equal(b.segments,1);
  assert.equal(b.codecBreakdown.brotli.segments,1);
});

test('migrates one legacy gzip segment to Brotli without changing raw bytes or chain metadata',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-migrate-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const sourceName='tcx-market-events.jsonl.segment-1-2-123.jsonl';
  const gzipName=sourceName+'.gz';
  const raw=[
    JSON.stringify({seq:1,eventHash:'a',payload:'x'.repeat(5000)}),
    JSON.stringify({seq:2,eventHash:'b',payload:'x'.repeat(5000)})
  ].join('\n')+'\n';
  const gz=gzipSync(Buffer.from(raw,'utf8'),{level:9});
  await writeFile(path.join(dir,gzipName),gz);
  const item={
    name:gzipName,
    sourceName,
    rawBytes:Buffer.byteLength(raw),
    compressedBytes:gz.length,
    rawSha256:sha256(raw),
    compressedSha256:sha256(gz),
    firstSeq:1,
    lastSeq:2,
    tailHash:'b',
    createdAt:123
  };
  const core={version:'TCX_MARKET_FABRIC_ARCHIVE_V2',segments:[item]};
  await writeFile(file+'.segments-manifest.json',JSON.stringify({...core,fingerprint:sha256(core)})+'\n');

  const r=await archiveMarketFabricSegments({filePath:file,maxMigrationsPerRun:1});
  assert.equal(r.migratedSegments,1);
  assert.equal(r.codecBreakdown.brotli.segments,1);
  assert.equal(r.codecBreakdown.gzip.segments,0);
  const m=JSON.parse(await readFile(file+'.segments-manifest.json','utf8'));
  assert.equal(m.version,MARKET_FABRIC_ARCHIVE_VERSION);
  assert.equal(m.segments[0].codec,'brotli');
  assert.equal(m.segments[0].rawSha256,item.rawSha256);
  assert.equal(m.segments[0].lastSeq,2);
  const migrated=await readFile(path.join(dir,m.segments[0].name));
  assert.equal(brotliDecompressSync(migrated).toString('utf8'),raw);
  await assert.rejects(()=>stat(path.join(dir,gzipName)),err=>err?.code==='ENOENT');
});

test('migrates at most one legacy segment per run to bound maintenance CPU',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-archive-migrate-bound-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const segments=[];
  for(let i=0;i<2;i++){
    const sourceName='tcx-market-events.jsonl.segment-'+i+'-'+i+'-'+i+'.jsonl';
    const gzipName=sourceName+'.gz';
    const raw=JSON.stringify({seq:i,eventHash:String(i),payload:'y'.repeat(2000)})+'\n';
    const gz=gzipSync(Buffer.from(raw,'utf8'),{level:9});
    await writeFile(path.join(dir,gzipName),gz);
    segments.push({
      name:gzipName,sourceName,rawBytes:Buffer.byteLength(raw),compressedBytes:gz.length,
      rawSha256:sha256(raw),compressedSha256:sha256(gz),firstSeq:i,lastSeq:i,tailHash:String(i),createdAt:i
    });
  }
  const core={version:'TCX_MARKET_FABRIC_ARCHIVE_V2',segments};
  await writeFile(file+'.segments-manifest.json',JSON.stringify({...core,fingerprint:sha256(core)})+'\n');
  const first=await archiveMarketFabricSegments({filePath:file,maxMigrationsPerRun:1});
  assert.equal(first.codecBreakdown.brotli.segments,1);
  assert.equal(first.codecBreakdown.gzip.segments,1);
  const second=await archiveMarketFabricSegments({filePath:file,maxMigrationsPerRun:1});
  assert.equal(second.codecBreakdown.brotli.segments,2);
  assert.equal(second.codecBreakdown.gzip.segments,0);
});
