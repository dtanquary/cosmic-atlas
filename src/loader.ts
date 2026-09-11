import type { Asset } from './types';
interface Task {key:string;url:string;asset:Asset;kind:'points'|'metadata'|'profiles';count:number;resolve:(buffer:ArrayBuffer)=>void;reject:(error:Error)=>void}
export class ChunkLoader {
  private worker=new Worker(new URL('./data.worker.ts',import.meta.url),{type:'module'});
  private queue:Task[]=[];
  private active=new Map<string,Task>();
  private promises=new Map<string,Promise<ArrayBuffer>>();
  onChange=()=>{};
  constructor(){
    this.worker.onmessage=event=>{
      const {key,type,buffer,message,aborted}=event.data;
      const task=this.active.get(key);if(!task)return;
      this.active.delete(key);this.promises.delete(key);
      if(type==='loaded')task.resolve(buffer);else task.reject(new DOMException(message,aborted?'AbortError':'DataError'));
      this.pump();this.onChange();
    };
    this.worker.onerror=()=>{
      for(const task of [...this.active.values(),...this.queue])task.reject(new Error('The data worker stopped'));
      this.active.clear();this.queue=[];this.promises.clear();
      const message=this.worker.onmessage,error=this.worker.onerror;
      this.worker.terminate();this.worker=new Worker(new URL('./data.worker.ts',import.meta.url),{type:'module'});
      this.worker.onmessage=message;this.worker.onerror=error;this.onChange();
    };
  }
  get pending(){return this.active.size+this.queue.length}
  get reservedBytes(){return [...this.active.values(),...this.queue].reduce((sum,t)=>sum+t.asset.bytes*2+t.asset.decodedBytes*3,0)}
  load(key:string,url:string,asset:Asset,kind:'points'|'metadata'|'profiles',count:number,priority=false){
    const existing=this.promises.get(key);if(existing)return existing;
    const promise=new Promise<ArrayBuffer>((resolve,reject)=>{
      const task={key,url,asset,kind,count,resolve,reject};
      if(priority)this.queue.unshift(task);else this.queue.push(task);
    });
    this.promises.set(key,promise);this.pump();return promise;
  }
  private pump(){while(this.active.size<6&&this.queue.length){const task=this.queue.shift()!;this.active.set(task.key,task);this.worker.postMessage({type:'load',key:task.key,url:task.url,asset:task.asset,kind:task.kind,count:task.count})}}
  retain(keys:Set<string>){
    this.queue=this.queue.filter(t=>{if(keys.has(t.key)||t.kind==='metadata')return true;t.reject(new DOMException('Cancelled','AbortError'));this.promises.delete(t.key);return false});
    for(const task of this.active.values())if(!keys.has(task.key)&&task.kind==='points')this.worker.postMessage({type:'cancel',key:task.key});
  }
  dispose(){this.worker.terminate();for(const task of [...this.active.values(),...this.queue])task.reject(new DOMException('Disposed','AbortError'));this.active.clear();this.queue=[];this.promises.clear()}
}
