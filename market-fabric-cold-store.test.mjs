import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRailwayS3ColdStore } from './market-fabric-cold-store.mjs';

function hash(value){return createHash('sha256').update(value).digest('hex');}

async function bodyBuffer(body){
  if(body==null) return Buffer.alloc(0);
  if(Buffer.isBuffer(body)) return body;
  if(typeof body==='string') return Buffer.from(body);
  const chunks=[];
  for await(const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function fakeS3(){
  const objects=new Map();
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    const key=String(url);
    const method=String(options.method||'GET').toUpperCase();
    calls.push({method,key,headers:{...(options.headers||{})}});
    if(method==='PUT'){
      const body=await bodyBuffer(options.body);
      objects.set(key,{body,headers:{...(options.headers||{})}});
      return new Response(null,{status:200,headers:{etag:'"fake-etag"'}});
    }
    const stored=objects.get(key);
    if(!stored) return new Response('missing',{status:404});
    if(method==='HEAD'){
      const headers=new Headers({
        'content-length':String(stored.body.length),
        etag:'"fake-etag"'
      });
      for(const [k,v] of Object.entries(stored.headers)){
        if(String(k).toLowerCase().startsWith('x-amz-meta-')) headers.set(k,String(v));
      }
      return new Response(null,{status:200,headers});
    }
    if(method==='GET') return new Response(stored.body,{status:200,headers:{'content-length':String(stored.body.length)}});
    return new Response('bad method',{status:405});
  };
  return {objects,calls,fetchImpl};
}

function fixture(){
  const raw=Buffer.from(Array.from({length:250},(_,i)=>JSON.stringify({seq:i+1,eventHash:String(i+1).padStart(64,'0'),payload:'repeat-'+(i%7)})).join('\n')+'\n');
  const compressed=gzipSync(raw,{level:9});
  return {
    raw,compressed,
    item:{
      name:'tcx-market-events.jsonl.segment-1-250-1.jsonl.gz',
      sourceName:'tcx-market-events.jsonl.segment-1-250-1.jsonl',
      codec:'gzip',
      rawBytes:raw.length,
      compressedBytes:compressed.length,
      rawSha256:hash(raw),
      compressedSha256:hash(compressed),
      firstSeq:1,
      lastSeq:250
    }
  };
}

function store(fake){
  return createRailwayS3ColdStore({
    enabled:true,
    bucket:'tcx-cold',
    region:'sfo',
    endpoint:'https://storage.example.test',
    accessKeyId:'AKIDEXAMPLE',
    secretAccessKey:'secret-example',
    prefix:'market-fabric',
    forcePathStyle:true,
    fetchImpl:fake.fetchImpl
  });
}

test('cold store uploads and verifies compressed plus raw hashes before success',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-'));
  const f=fixture();
  const local=path.join(dir,f.item.name);
  await writeFile(local,f.compressed);
  const fake=fakeS3();
  const cold=store(fake);

  const descriptor=await cold.putVerifiedSegment({item:f.item,localPath:local});
  assert.equal(descriptor.provider,'RAILWAY_S3');
  assert.equal(descriptor.compressedSha256,f.item.compressedSha256);
  assert.equal(descriptor.rawSha256,f.item.rawSha256);
  assert.match(descriptor.key,/market-fabric\/1-250\//);
  assert.deepEqual(fake.calls.map(x=>x.method),['PUT','HEAD','GET']);
  assert.match(String(fake.calls[0].headers.authorization),/^AWS4-HMAC-SHA256 /);
  assert.equal(await readFile(local).then(hash),f.item.compressedSha256);
});

test('cold store restore is atomic and replay-verifies raw content',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-restore-'));
  const f=fixture();
  const local=path.join(dir,'source.gz');
  const restored=path.join(dir,'restored.gz');
  await writeFile(local,f.compressed);
  const fake=fakeS3();
  const cold=store(fake);
  const descriptor=await cold.putVerifiedSegment({item:f.item,localPath:local});

  const result=await cold.restoreVerifiedSegment({item:f.item,descriptor,targetPath:restored});
  assert.equal(result.restored,true);
  assert.equal(hash(await readFile(restored)),f.item.compressedSha256);
});

test('cold store fails closed when remote bytes are corrupted',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tcx-cold-corrupt-'));
  const f=fixture();
  const local=path.join(dir,f.item.name);
  await writeFile(local,f.compressed);
  const fake=fakeS3();
  const cold=store(fake);
  const descriptor=await cold.putVerifiedSegment({item:f.item,localPath:local});
  const remote=[...fake.objects.keys()].find(x=>x.includes(descriptor.key));
  const stored=fake.objects.get(remote);
  stored.body=Buffer.concat([stored.body,Buffer.from('tamper')]);

  await assert.rejects(
    ()=>cold.verifySegment({item:f.item,descriptor}),
    /TCX_COLD_HEAD_BYTES_MISMATCH|TCX_COLD_COMPRESSED_BYTES_MISMATCH/
  );
  assert.equal(hash(await readFile(local)),f.item.compressedSha256);
});

test('cold manifest mirror is uploaded and read back verified',async()=>{
  const fake=fakeS3();
  const cold=store(fake);
  const manifest={version:'TCX_MARKET_FABRIC_ARCHIVE_V3',segments:[],fingerprint:'abc'};
  const result=await cold.mirrorManifest({manifest});
  assert.match(result.key,/manifest\.json$/);
  assert.deepEqual(fake.calls.map(x=>x.method),['PUT','GET']);
});
