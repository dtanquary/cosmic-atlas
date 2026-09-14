import type { Asset } from './types';
type Kind='points'|'metadata'|'profiles';
interface Task {key:string;url:string;asset:Asset;kind:Kind;count:number;priority:boolean;required:boolean;owners:Set<symbol>;cancelled:boolean;promise:Promise<ArrayBuffer>;resolve:(buffer:ArrayBuffer)=>void;reject:(error:Error)=>void}
const cancelled=()=>new DOMException('Cancelled','AbortError');
export class ChunkLoader {
  private worker=new Worker(new URL('./data.worker.ts',import.meta.url),{type:'module'});
  private queue:Task[]=[];
  private active=new Map<string,Task>();
  private tasks=new Map<string,Task>();
  private disposed=false;
  onChange=()=>{};
  constructor(){
    this.worker.onmessage=event=>{
      const {key,type,buffer,message,aborted}=event.data;
      const task=this.active.get(key);if(!task)return;
      this.active.delete(key);this.tasks.delete(key);
      if(task.cancelled)task.reject(cancelled());else if(type==='loaded')task.resolve(buffer);else task.reject(new DOMException(message,aborted?'AbortError':'DataError'));
      this.pump();this.onChange();
    };
    this.worker.onerror=()=>{
      for(const task of this.tasks.values())task.reject(new Error('The data worker stopped'));
      this.active.clear();this.queue=[];this.tasks.clear();
      const message=this.worker.onmessage,error=this.worker.onerror;
      this.worker.terminate();this.worker=new Worker(new URL('./data.worker.ts',import.meta.url),{type:'module'});
      this.worker.onmessage=message;this.worker.onerror=error;this.onChange();
    };
  }
  get pending(){return this.active.size+this.queue.length}
  get reservedBytes(){return [...this.tasks.values()].reduce((sum,t)=>sum+t.asset.bytes*2+t.asset.decodedBytes*3,0)}
  /** A signal owns a speculative lease. A normal caller promotes the shared load to required work. */
  load(key:string,url:string,asset:Asset,kind:Kind,count:number,priority=false,signal?:AbortSignal):Promise<ArrayBuffer>{
    if(this.disposed||signal?.aborted)return Promise.reject(cancelled());
    let task=this.tasks.get(key);
    // Wait for the old worker acknowledgement before reusing a cancelled key: its reply must never settle a newer request.
    if(task?.cancelled)return task.promise.catch(()=>{}).then(()=>this.load(key,url,asset,kind,count,priority,signal));
    if(!task){
      let resolve!:Task['resolve'],reject!:Task['reject'];
      const promise=new Promise<ArrayBuffer>((yes,no)=>{resolve=yes;reject=no});
      task={key,url,asset,kind,count,priority,required:!signal,owners:new Set(),cancelled:false,promise,resolve,reject};
      this.tasks.set(key,task);this.queue.push(task);
    }else if(!signal){task.required=true;task.priority||=priority}
    const result=signal?this.lease(task,signal):task.promise;
    this.pump();return result;
  }
  private lease(task:Task,signal:AbortSignal){
    const owner=Symbol();task.owners.add(owner);
    return new Promise<ArrayBuffer>((resolve,reject)=>{
      const cleanup=()=>{signal.removeEventListener('abort',abort);task.owners.delete(owner)};
      const abort=()=>{cleanup();reject(cancelled());this.cancelUnused(task)};
      signal.addEventListener('abort',abort,{once:true});
      task.promise.then(buffer=>{cleanup();resolve(buffer)},error=>{cleanup();reject(error)});
    });
  }
  private cancelUnused(task:Task){
    if(task.required||task.owners.size||task.cancelled||this.tasks.get(task.key)!==task)return;
    task.cancelled=true;
    if(this.active.has(task.key))this.worker.postMessage({type:'cancel',key:task.key});
    else{this.queue=this.queue.filter(t=>t!==task);this.tasks.delete(task.key);task.reject(cancelled());this.onChange()}
  }
  private pump(){
    // Current-view work precedes speculative leases; an in-flight shared fetch is never duplicated.
    this.queue.sort((a,b)=>Number(b.required)-Number(a.required)||Number(b.priority)-Number(a.priority));
    while(!this.disposed&&this.active.size<6&&this.queue.length){const task=this.queue.shift()!;this.active.set(task.key,task);this.worker.postMessage({type:'load',key:task.key,url:task.url,asset:task.asset,kind:task.kind,count:task.count})}
  }
  retain(keys:Set<string>){
    for(const task of this.tasks.values())if(!keys.has(task.key)&&task.kind==='points'&&!task.priority){task.required=false;this.cancelUnused(task)}
  }
  dispose(){this.disposed=true;this.worker.terminate();for(const task of this.tasks.values())task.reject(new DOMException('Disposed','AbortError'));this.active.clear();this.queue=[];this.tasks.clear()}
}
