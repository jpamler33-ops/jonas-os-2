import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, stat, unlink } from 'node:fs/promises';
import { createHash, createHmac } from 'node:crypto';
import { Readable, Transform, Writable } from 'node:stream';
import { createBrotliDecompress, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const EMPTY_SHA256=createHash('sha256').update('').digest('hex');
const DEFAULT_PREFIX='market-fabric';

function truthy(value){
  return /^(?:1|true|yes|on)$/i.test(String(value||'').trim());
}

function sha256Hex(value){
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key,value,encoding){
  return createHmac('sha256',key).update(value).digest(encoding);
}

function awsDate(now=new Date()){
  const iso=now.toISOString().replace(/[:-]|\.\d{3}/g,'');
  return {amzDate:iso,dateStamp:iso.slice(0,8)};
}

function cleanPrefix(value){
  return String(value||DEFAULT_PREFIX).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function encodedObjectKey(key){
  return String(key||'').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function parseEndpoint(endpoint){
  const url=new URL(String(endpoint));
  if(url.protocol!=='https:'&&url.protocol!=='http:') throw new Error('TCX_COLD_ENDPOINT_PROTOCOL_UNSUPPORTED');
  url.pathname=url.pathname.replace(/\/+$/,'');
  return url;
}

function objectUrl({endpoint,bucket,key,forcePathStyle=true}){
  const base=parseEndpoint(endpoint);
  const encodedKey=encodedObjectKey(key);
  if(forcePathStyle){
    base.pathname=(base.pathname.replace(/\/+$/,'')+'/'+encodeURIComponent(bucket)+'/'+encodedKey).replace(/\/+/g,'/');
  }else{
    base.hostname=encodeURIComponent(bucket)+'.'+base.hostname;
    base.pathname=(base.pathname.replace(/\/+$/,'')+'/'+encodedKey).replace(/\/+/g,'/');
  }
  return base;
}

function canonicalUri(url){
  return url.pathname.split('/').map((part,index)=>index===0?'':encodeURIComponent(decodeURIComponent(part)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/')||'/';
}

function normalizeHeaderValue(value){
  return String(value).trim().replace(/\s+/g,' ');
}

function signRequest({method,url,region,accessKeyId,secretAccessKey,sessionToken=null,headers={},payloadHash=EMPTY_SHA256,now=new Date()}){
  const {amzDate,dateStamp}=awsDate(now);
  const signedHeaders={
    host:url.host,
    'x-amz-content-sha256':payloadHash,
    'x-amz-date':amzDate,
    ...Object.fromEntries(Object.entries(headers).map(([k,v])=>[String(k).toLowerCase(),normalizeHeaderValue(v)]))
  };
  if(sessionToken) signedHeaders['x-amz-security-token']=sessionToken;

  const ordered=Object.entries(signedHeaders).sort(([a],[b])=>a.localeCompare(b));
  const canonicalHeaders=ordered.map(([k,v])=>k+':'+normalizeHeaderValue(v)+'\n').join('');
  const signedHeaderNames=ordered.map(([k])=>k).join(';');
  const canonicalRequest=[
    String(method).toUpperCase(),
    canonicalUri(url),
    '',
    canonicalHeaders,
    signedHeaderNames,
    payloadHash
  ].join('\n');
  const scope=dateStamp+'/'+region+'/s3/aws4_request';
  const stringToSign=[
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const kDate=hmac('AWS4'+secretAccessKey,dateStamp);
  const kRegion=hmac(kDate,region);
  const kService=hmac(kRegion,'s3');
  const kSigning=hmac(kService,'aws4_request');
  const signature=hmac(kSigning,stringToSign,'hex');
  return {
    headers:{
      ...headers,
      'x-amz-content-sha256':payloadHash,
      'x-amz-date':amzDate,
      ...(sessionToken?{'x-amz-security-token':sessionToken}:{}),
      authorization:'AWS4-HMAC-SHA256 Credential='+accessKeyId+'/'+scope+', SignedHeaders='+signedHeaderNames+', Signature='+signature
    },
    signedHeaderNames
  };
}

function auditTransform(){
  const hash=createHash('sha256');
  let bytes=0;
  const stream=new Transform({
    transform(chunk,_enc,cb){
      bytes+=chunk.length;
      hash.update(chunk);
      cb(null,chunk);
    }
  });
  return {stream,finish:()=>({bytes,sha256:hash.digest('hex')})};
}

function discardSink(){
  return new Writable({write(_chunk,_enc,cb){cb();}});
}

function decompressor(codec){
  if(codec==='brotli') return createBrotliDecompress();
  if(codec==='gzip') return createGunzip();
  throw new Error('TCX_COLD_CODEC_UNSUPPORTED:'+codec);
}

async function responseError(response,scope){
  let body='';
  try{body=(await response.text()).slice(0,512);}catch{}
  throw new Error(scope+':HTTP_'+response.status+(body?':'+body:''));
}

async function streamResponseAudit(response,item){
  if(!response.ok) await responseError(response,'TCX_COLD_GET_FAILED');
  if(!response.body) throw new Error('TCX_COLD_GET_EMPTY_BODY');
  const compressed=auditTransform();
  const raw=auditTransform();
  await pipeline(
    Readable.fromWeb(response.body),
    compressed.stream,
    decompressor(String(item.codec||'gzip')),
    raw.stream,
    discardSink()
  );
  const c=compressed.finish(),r=raw.finish();
  if(c.bytes!==Number(item.compressedBytes)) throw new Error('TCX_COLD_COMPRESSED_BYTES_MISMATCH');
  if(c.sha256!==String(item.compressedSha256)) throw new Error('TCX_COLD_COMPRESSED_HASH_MISMATCH');
  if(r.bytes!==Number(item.rawBytes)) throw new Error('TCX_COLD_RAW_BYTES_MISMATCH');
  if(r.sha256!==String(item.rawSha256)) throw new Error('TCX_COLD_RAW_HASH_MISMATCH');
  return {compressed:c,raw:r};
}

function metadataHeaders(item){
  return {
    'content-type':'application/octet-stream',
    'x-amz-meta-tcx-compressed-sha256':String(item.compressedSha256),
    'x-amz-meta-tcx-raw-sha256':String(item.rawSha256),
    'x-amz-meta-tcx-codec':String(item.codec||'gzip'),
    'x-amz-meta-tcx-source-name':encodeURIComponent(String(item.sourceName||'')).slice(0,900)
  };
}

function remoteDescriptor({bucket,key,item,head,verifiedAt,endpoint}){
  return {
    provider:'RAILWAY_S3',
    bucket,
    key,
    endpointHost:parseEndpoint(endpoint).host,
    compressedBytes:Number(item.compressedBytes),
    compressedSha256:String(item.compressedSha256),
    rawBytes:Number(item.rawBytes),
    rawSha256:String(item.rawSha256),
    codec:String(item.codec||'gzip'),
    verifiedAt:Number(verifiedAt),
    etag:String(head.headers.get('etag')||'').replace(/^"|"$/g,'')||null
  };
}

export function createRailwayS3ColdStore({
  enabled=false,
  bucket,
  region,
  endpoint,
  accessKeyId,
  secretAccessKey,
  sessionToken=null,
  prefix=DEFAULT_PREFIX,
  forcePathStyle=true,
  fetchImpl=globalThis.fetch
}={}){
  const active=enabled===true;
  const missing=active
    ? Object.entries({bucket,region,endpoint,accessKeyId,secretAccessKey}).filter(([,v])=>!String(v||'').trim()).map(([k])=>k)
    : [];
  if(active&&missing.length) throw new Error('TCX_COLD_CONFIG_MISSING:'+missing.join(','));
  if(active&&typeof fetchImpl!=='function') throw new Error('TCX_COLD_FETCH_UNAVAILABLE');
  const normalizedPrefix=cleanPrefix(prefix);

  function keyFor(item){
    const file=path.basename(String(item?.name||item?.sourceName||'segment.bin'));
    return [normalizedPrefix,String(item?.firstSeq??'na')+'-'+String(item?.lastSeq??'na'),encodeURIComponent(file)].filter(Boolean).join('/');
  }

  async function request(method,key,{body=null,payloadHash=EMPTY_SHA256,headers={}}={}){
    const url=objectUrl({endpoint,bucket,key,forcePathStyle});
    const signed=signRequest({
      method,url,region,accessKeyId,secretAccessKey,sessionToken,
      headers,payloadHash
    });
    return fetchImpl(url,{
      method,
      headers:signed.headers,
      ...(body?{body,duplex:'half'}:{})
    });
  }

  async function verifyHead(key,item){
    const head=await request('HEAD',key);
    if(!head.ok) await responseError(head,'TCX_COLD_HEAD_FAILED');
    const length=Number(head.headers.get('content-length'));
    if(length!==Number(item.compressedBytes)) throw new Error('TCX_COLD_HEAD_BYTES_MISMATCH');
    const metaCompressed=head.headers.get('x-amz-meta-tcx-compressed-sha256');
    const metaRaw=head.headers.get('x-amz-meta-tcx-raw-sha256');
    if(metaCompressed&&metaCompressed!==String(item.compressedSha256)) throw new Error('TCX_COLD_HEAD_COMPRESSED_HASH_MISMATCH');
    if(metaRaw&&metaRaw!==String(item.rawSha256)) throw new Error('TCX_COLD_HEAD_RAW_HASH_MISMATCH');
    return head;
  }

  async function verifyObject(key,item){
    const head=await verifyHead(key,item);
    const get=await request('GET',key);
    const audit=await streamResponseAudit(get,item);
    return {head,audit};
  }

  async function putVerifiedSegment({item,localPath}){
    if(!active) throw new Error('TCX_COLD_STORE_DISABLED');
    const local=await stat(localPath);
    if(local.size!==Number(item.compressedBytes)) throw new Error('TCX_COLD_LOCAL_BYTES_MISMATCH');
    const key=keyFor(item);
    const headers={
      ...metadataHeaders(item),
      'content-length':String(local.size)
    };
    const put=await request('PUT',key,{
      body:createReadStream(localPath),
      payloadHash:String(item.compressedSha256),
      headers
    });
    if(!put.ok) await responseError(put,'TCX_COLD_PUT_FAILED');
    const verified=await verifyObject(key,item);
    return remoteDescriptor({
      bucket,key,item,head:verified.head,
      verifiedAt:Date.now(),endpoint
    });
  }

  async function verifySegment({item,descriptor=item?.cold}){
    if(!active) throw new Error('TCX_COLD_STORE_DISABLED');
    const key=String(descriptor?.key||'');
    if(!key) throw new Error('TCX_COLD_DESCRIPTOR_KEY_MISSING');
    if(descriptor?.bucket&&String(descriptor.bucket)!==String(bucket)) throw new Error('TCX_COLD_DESCRIPTOR_BUCKET_MISMATCH');
    const verified=await verifyObject(key,item);
    return {
      ok:true,
      descriptor:remoteDescriptor({bucket,key,item,head:verified.head,verifiedAt:Date.now(),endpoint})
    };
  }

  async function restoreVerifiedSegment({item,descriptor=item?.cold,targetPath}){
    if(!active) throw new Error('TCX_COLD_STORE_DISABLED');
    const key=String(descriptor?.key||'');
    if(!key) throw new Error('TCX_COLD_DESCRIPTOR_KEY_MISSING');
    const tmp=targetPath+'.cold-restore.tmp';
    await unlink(tmp).catch(err=>{if(err?.code!=='ENOENT') throw err;});
    const response=await request('GET',key);
    if(!response.ok) await responseError(response,'TCX_COLD_RESTORE_GET_FAILED');
    if(!response.body) throw new Error('TCX_COLD_RESTORE_EMPTY_BODY');
    const compressed=auditTransform();
    const raw=auditTransform();
    try{
      await pipeline(
        Readable.fromWeb(response.body),
        compressed.stream,
        createWriteStream(tmp,{flags:'wx'})
      );
      const c=compressed.finish();
      if(c.bytes!==Number(item.compressedBytes)||c.sha256!==String(item.compressedSha256)){
        throw new Error('TCX_COLD_RESTORE_COMPRESSED_MISMATCH');
      }
      const checkCompressed=auditTransform();
      await pipeline(
        createReadStream(tmp),
        checkCompressed.stream,
        decompressor(String(item.codec||'gzip')),
        raw.stream,
        discardSink()
      );
      checkCompressed.finish();
      const r=raw.finish();
      if(r.bytes!==Number(item.rawBytes)||r.sha256!==String(item.rawSha256)){
        throw new Error('TCX_COLD_RESTORE_RAW_MISMATCH');
      }
      const fh=await open(tmp,'r');
      try{await fh.sync();}finally{await fh.close();}
      await rename(tmp,targetPath);
      return {restored:true,targetPath,bytes:c.bytes,sha256:c.sha256};
    }catch(err){
      await unlink(tmp).catch(()=>{});
      throw err;
    }
  }

  async function mirrorManifest({manifest}){
    if(!active) throw new Error('TCX_COLD_STORE_DISABLED');
    const key=[normalizedPrefix,'manifest.json'].filter(Boolean).join('/');
    const payload=Buffer.from(JSON.stringify(manifest)+'\n','utf8');
    const payloadHash=sha256Hex(payload);
    const put=await request('PUT',key,{
      body:payload,
      payloadHash,
      headers:{
        'content-type':'application/json',
        'content-length':String(payload.length),
        'x-amz-meta-tcx-manifest-sha256':payloadHash
      }
    });
    if(!put.ok) await responseError(put,'TCX_COLD_MANIFEST_PUT_FAILED');
    const get=await request('GET',key);
    if(!get.ok) await responseError(get,'TCX_COLD_MANIFEST_GET_FAILED');
    const remote=Buffer.from(await get.arrayBuffer());
    if(remote.length!==payload.length||sha256Hex(remote)!==payloadHash) throw new Error('TCX_COLD_MANIFEST_VERIFY_FAILED');
    return {key,bytes:payload.length,sha256:payloadHash,verifiedAt:Date.now()};
  }

  function summary(){
    return {
      enabled:active,
      provider:active?'RAILWAY_S3':null,
      bucket:active?String(bucket):null,
      region:active?String(region):null,
      endpointHost:active?parseEndpoint(endpoint).host:null,
      prefix:normalizedPrefix,
      forcePathStyle:Boolean(forcePathStyle)
    };
  }

  return {
    enabled:active,
    putVerifiedSegment,
    verifySegment,
    restoreVerifiedSegment,
    mirrorManifest,
    summary
  };
}

export function createRailwayS3ColdStoreFromEnv(env=process.env,{fetchImpl=globalThis.fetch}={}){
  const enabled=truthy(env.TCX_MARKET_FABRIC_COLD_ENABLED);
  const forcePathStyle=env.TCX_COLD_FORCE_PATH_STYLE==null
    ?true
    :truthy(env.TCX_COLD_FORCE_PATH_STYLE);
  return createRailwayS3ColdStore({
    enabled,
    bucket:env.TCX_COLD_BUCKET||env.BUCKET,
    region:env.TCX_COLD_REGION||env.REGION,
    endpoint:env.TCX_COLD_ENDPOINT||env.ENDPOINT,
    accessKeyId:env.TCX_COLD_ACCESS_KEY_ID||env.ACCESS_KEY_ID,
    secretAccessKey:env.TCX_COLD_SECRET_ACCESS_KEY||env.SECRET_ACCESS_KEY,
    sessionToken:env.TCX_COLD_SESSION_TOKEN||env.AWS_SESSION_TOKEN||null,
    prefix:env.TCX_COLD_PREFIX||DEFAULT_PREFIX,
    forcePathStyle,
    fetchImpl
  });
}

export const MARKET_FABRIC_COLD_STORE_VERSION='TCX_MARKET_FABRIC_COLD_STORE_V1';
