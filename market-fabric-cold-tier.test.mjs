import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { sha256 } from './institutional-kernel.mjs';
import { offloadMarketFabricArchive, restoreMarketFabricColdSegment } from './market-fabric-cold-tier.mjs';

function manifestValue(version,segments){
  const core={version,segments};
  return {...core,fingerprint:sha256(core)};
}

async function fixture(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-tier-'));
  const file=path.join(dir,'tcx-market-events.jsonl');
  const segments=[];
  for(let i=0;i<3;i++){
    const name='tcx-market-events.jsonl.segment-'+(i+1)+'-'+(i+1)+'-'+(i+1)+'.jsonl.gz';
    const bytes=Buffer.from(('segment-'+i+'-').repeat(256));
    await writeFile(path.join(dir,name),bytes);
    segments.push({
      name,
      sourceName:name.slice(0,-3),
      codec:'gzip',
      rawBytes:bytes.length,
      compressedBytes:bytes.length,
      rawSha256:sha256(bytes),
      compressedSha256:sha256(bytes),
      firstSeq:i+1,lastSeq:i+1,tailHash:String(i+1).padStart(64,'0'),createdAt:i+1
    });
  }
  const manifest=manifestValue('TCX_MARKET_FABRIC_ARCHIVE_V3',segments);
  await writeFile(file+'.segments-manifest.json',JSON.stringify(manifest)+'\n');
  return {dir,file,segments};
}

function fakeCold({failMirror=false}={}){
  const stored=new Map();
  return {
    enabled:true,
    async putVerifiedSegment({item,localPath}){
      const bytes=await readFile(localPath);
      stored.set(item.sourceName,bytes);
      return {
        provider:'CLOUDFLARE_R2',bucket:'tcx',key:'market-fabric/'+item.sourceName,
        compressedBytes:item.compressedBytes,compressedSha256:item.compressedSha256,
        rawBytes:item.rawBytes,rawSha256:item.rawSha256,codec:item.codec,verifiedAt:123
      };
    },
    async verifySegment({item,descriptor}){return {ok:true,descriptor};},
    async mirrorManifest(){if(failMirror) throw new Error('mirror failed'); return {verifiedAt:123};},
    async restoreVerifiedSegment({item,targetPath}){
      const bytes=stored.get(item.sourceName);
      if(!bytes) throw new Error('missing');
      await writeFile(targetPath,bytes);
      return {restored:true,targetPath,bytes:bytes.length,sha256:sha256(bytes)};
    },
    summary(){return {provider:'CLOUDFLARE_R2'};}
  };
}

test('offload deletes local bytes only after verified upload and manifest mirror',async()=>{
  const f=await fixture();
  const cold=fakeCold();
  const result=await offloadMarketFabricArchive({
    filePath:f.file,coldStore:cold,maxLocalBytes:5000,targetLocalBytes:1000,maxSegmentsPerRun:2
  });
  assert.equal(result.offloadedSegments,2);
  assert.ok(result.offloadedBytes>0);
  await assert.rejects(()=>stat(path.join(f.dir,f.segments[0].name)),err=>err?.code==='ENOENT');
  await assert.rejects(()=>stat(path.join(f.dir,f.segments[1].name)),err=>err?.code==='ENOENT');
  assert.ok((await stat(path.join(f.dir,f.segments[2].name))).size>0);
  const manifest=JSON.parse(await readFile(f.file+'.segments-manifest.json','utf8'));
  assert.equal(manifest.segments.filter(x=>x.cold?.recoveryVerified).length,2);
});

test('offload fails closed and retains local file when remote manifest mirror fails',async()=>{
  const f=await fixture();
  const cold=fakeCold({failMirror:true});
  await assert.rejects(
    ()=>offloadMarketFabricArchive({
      filePath:f.file,coldStore:cold,maxLocalBytes:1,targetLocalBytes:0,maxSegmentsPerRun:1
    }),
    /mirror failed/
  );
  assert.ok((await stat(path.join(f.dir,f.segments[0].name))).size>0);
});

test('cold segment can be restored through the manifest descriptor',async()=>{
  const f=await fixture();
  const cold=fakeCold();
  const off=await offloadMarketFabricArchive({
    filePath:f.file,coldStore:cold,maxLocalBytes:1,targetLocalBytes:0,maxSegmentsPerRun:1
  });
  assert.equal(off.offloadedSegments,1);
  const restored=await restoreMarketFabricColdSegment({
    filePath:f.file,coldStore:cold,sourceName:f.segments[0].sourceName
  });
  assert.equal(restored.restored,true);
  assert.ok((await stat(path.join(f.dir,f.segments[0].name))).size>0);
});
