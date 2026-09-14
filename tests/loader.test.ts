import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ChunkLoader} from '../src/loader';
import type {Asset} from '../src/types';
class WorkerStub{
 static instances:WorkerStub[]=[];onmessage:((event:{data:unknown})=>void)|null=null;onerror:(()=>void)|null=null;messages:any[]=[];terminated=false;
 constructor(){WorkerStub.instances.push(this)}postMessage(value:unknown){this.messages.push(value)}terminate(){this.terminated=true}
 reply(key:string,buffer=new ArrayBuffer(16)){this.onmessage?.({data:{key,type:'loaded',buffer}});return buffer}
 abort(key:string){this.onmessage?.({data:{key,type:'error',aborted:true,message:'Cancelled'}})}
}
const asset={url:'x',bytes:8,decodedBytes:16,sha256:'a'} as Asset;
let loader:ChunkLoader,worker:WorkerStub;
const load=(key:string,signal?:AbortSignal,priority=false)=>loader.load(key,'https://example.invalid/x',asset,'points',1,priority,signal);
beforeEach(()=>{WorkerStub.instances=[];vi.stubGlobal('Worker',WorkerStub);loader=new ChunkLoader();worker=WorkerStub.instances[0]});
afterEach(()=>{loader.dispose();vi.unstubAllGlobals()});
describe('shared request ownership',()=>{
 it('releases one lease without cancelling another or duplicating work',async()=>{
  const a=new AbortController(),b=new AbortController(),pa=load('a',a.signal).catch(e=>e.name),pb=load('a',b.signal);
  a.abort();expect(await pa).toBe('AbortError');expect(worker.messages.map(m=>m.type)).toEqual(['load']);
  const buffer=worker.reply('a');expect(await pb).toBe(buffer);expect(loader.pending).toBe(0);
 });
 it('keeps a speculative fetch when explicit navigation joins it',async()=>{
  const a=new AbortController(),pa=load('a',a.signal).catch(e=>e.name),required=load('a',undefined,true);
  a.abort();loader.retain(new Set());expect(await pa).toBe('AbortError');expect(worker.messages).toHaveLength(1);
  expect(await Promise.resolve(worker.reply('a'))).toBe(await required);
 });
 it('frontier release preserves a lease, then cancels when the last owner leaves',async()=>{
  const a=new AbortController(),required=load('a').catch(e=>e.name),lease=load('a',a.signal).catch(e=>e.name);
  loader.retain(new Set());expect(worker.messages).toHaveLength(1);a.abort();expect(worker.messages.at(-1)).toEqual({type:'cancel',key:'a'});
  worker.abort('a');expect(await required).toBe('AbortError');expect(await lease).toBe('AbortError');
 });
 it('does not deliver a cancelled worker reply to a new required request',async()=>{
  const a=new AbortController(),lease=load('a',a.signal).catch(e=>e.name);a.abort();const required=load('a');
  const stale=worker.reply('a');await vi.waitFor(()=>expect(worker.messages.filter(m=>m.type==='load')).toHaveLength(2));
  const fresh=worker.reply('a');expect(await lease).toBe('AbortError');expect(await required).toBe(fresh);expect(fresh).not.toBe(stale);
 });
 it('bounds reservations and removes queued leases while prioritizing visible work',async()=>{
  const work=Array.from({length:6},(_,i)=>load(String(i)).catch(()=>null));
  const a=new AbortController(),lease=load('spec',a.signal).catch(e=>e.name),next=load('visible').catch(()=>null);
  expect(loader.pending).toBe(8);expect(loader.reservedBytes).toBe(8*(8*2+16*3));
  worker.reply('0');expect(worker.messages.at(-1).key).toBe('visible');a.abort();expect(await lease).toBe('AbortError');expect(loader.pending).toBe(6);
  loader.dispose();await Promise.all([...work,next]);expect(loader.reservedBytes).toBe(0);
 });
 it('rejects outstanding leases on worker failure and permits a fresh worker',async()=>{
  const a=new AbortController(),first=load('a',a.signal).catch(e=>e.message);worker.onerror?.();expect(await first).toBe('The data worker stopped');expect(worker.terminated).toBe(true);
  worker=WorkerStub.instances[1];const fresh=load('a');expect(await Promise.resolve(worker.reply('a'))).toBe(await fresh);
 });
});
