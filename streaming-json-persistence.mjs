import path from 'node:path';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { canonicalJson } from './institutional-kernel.mjs';

export const STREAMING_JSON_PERSISTENCE_VERSION='TCX_STREAMING_JSON_PERSISTENCE_V1';

let tempSeq=0;

function validKey(value){
  return value!==undefined&&typeof value!=='function'&&typeof value!=='symbol';
}

export async function atomicWriteCanonicalObjectWithArray(filePath,document,{
  arrayKey,
  chunkBytes=256*1024,
  mode=0o600
}={}){
  if(!filePath) throw new Error('STREAM_JSON_FILE_REQUIRED');
  if(!document||typeof document!=='object'||Array.isArray(document)) throw new Error('STREAM_JSON_DOCUMENT_REQUIRED');
  if(!arrayKey||!Array.isArray(document[arrayKey])) throw new Error('STREAM_JSON_ARRAY_KEY_INVALID');

  const limit=Math.max(1024,Math.min(4*1024*1024,Math.floor(Number(chunkBytes)||256*1024)));
  await mkdir(path.dirname(filePath),{recursive:true});
  const tmp=`${filePath}.tmp-${process.pid}-${Date.now()}-${++tempSeq}`;
  let handle=null;
  let buffer='';
  let bytes=0;
  let writes=0;
  let maxBufferedBytes=0;

  const flush=async()=>{
    if(!buffer) return;
    const current=buffer;
    buffer='';
    const size=Buffer.byteLength(current,'utf8');
    await handle.write(current,null,'utf8');
    bytes+=size;
    writes++;
  };

  const push=async(piece)=>{
    const value=String(piece);
    const size=Buffer.byteLength(value,'utf8');
    const buffered=Buffer.byteLength(buffer,'utf8');
    if(buffer&&buffered+size>limit) await flush();
    if(size>limit){
      await flush();
      await handle.write(value,null,'utf8');
      bytes+=size;
      writes++;
      return;
    }
    buffer+=value;
    maxBufferedBytes=Math.max(maxBufferedBytes,Buffer.byteLength(buffer,'utf8'));
  };

  try{
    handle=await open(tmp,'wx',mode);
    const keys=Object.keys(document).filter(k=>validKey(document[k])).sort();
    await push('{');
    let fieldIndex=0;
    for(const key of keys){
      if(fieldIndex++) await push(',');
      await push(JSON.stringify(key)+':');
      if(key===arrayKey){
        await push('[');
        const items=document[key];
        for(let i=0;i<items.length;i++){
          if(i) await push(',');
          await push(canonicalJson(items[i]));
        }
        await push(']');
      }else{
        await push(canonicalJson(document[key]));
      }
    }
    await push('}');
    await flush();
    await handle.sync();
    await handle.close();
    handle=null;
    await rename(tmp,filePath);
    return {
      version:STREAMING_JSON_PERSISTENCE_VERSION,
      bytes,
      writes,
      itemCount:document[arrayKey].length,
      maxBufferedBytes,
      chunkBytes:limit,
      atomic:true
    };
  }catch(err){
    if(handle) await handle.close().catch(()=>{});
    await unlink(tmp).catch(()=>{});
    throw err;
  }
}
