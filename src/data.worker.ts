/// <reference lib="webworker" />
import { validateBinary } from './format';
import type { Asset } from './types';
const active=new Map<string,AbortController>();
self.onmessage=async(event:MessageEvent<{type:'load'|'cancel';key:string;url:string;asset:Asset;kind:'points'|'metadata'|'profiles';count:number}>)=>{
  const message=event.data;
  if(message.type==='cancel'){active.get(message.key)?.abort();return}
  const abort=new AbortController();active.set(message.key,abort);
  try{
    const response=await fetch(message.url,{signal:abort.signal});
    if(!response.ok)throw new Error(`Data request failed (${response.status})`);
    const compressed=await response.arrayBuffer();
    if(compressed.byteLength!==message.asset.bytes)throw new Error('Incomplete data download');
    const digest=await crypto.subtle.digest('SHA-256',compressed);
    const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==message.asset.sha256)throw new Error('Data integrity check failed');
    const buffer=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if(abort.signal.aborted)throw new DOMException('Cancelled','AbortError');
    validateBinary(buffer,message.kind,message.count);
    if(buffer.byteLength!==message.asset.decodedBytes)throw new Error('Unexpected decoded size');
    self.postMessage({type:'loaded',key:message.key,buffer},[buffer]);
  }catch(error){self.postMessage({type:'error',key:message.key,aborted:abort.signal.aborted,message:error instanceof Error?error.message:'Data loading failed'})}
  finally{active.delete(message.key)}
};
