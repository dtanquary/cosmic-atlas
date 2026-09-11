import {ChunkLoader} from './loader';
import {validateBinary} from './format';
import {familyLabels,type GalaxyFamily,type GalaxyDetailData} from './galaxy-detail';
import type {Asset,Galaxy,Manifest,SpatialNode} from './types';

export const MODEL_LIMIT=12;
export interface NamedType {name:string;morphology:string;family:GalaxyFamily;source:string;node:string;row:number;targetId:string}
export interface ModelManifest {
  version:1;catalogId:string;catalogSourceSha256:string;count:number;measuredShapes:number;assumedShapes:number;visualTypes:number;
  nodes:Record<string,Asset&{maxRadiusMpc:number}>;namedTypes:Record<string,NamedType>;
  library:{n:number;weightedError:number;gaussians:GalaxyDetailData['gaussians']}[];fallbackRadiusMpc:number;
  unresolvedExample:{id:number;node:string;row:number;targetId:string};
}
export interface ProfileChunk {buffer:ArrayBuffer;values:Float32Array;flags:Uint32Array;used:number}
const familyByCode:Record<number,GalaxyFamily>={1:'spiral',2:'barred',3:'elliptical',4:'lenticular',5:'irregular'};
const profileTypes=['Unknown','PSF','REX','EXP','DEV','SER'];

export function measuredShape(chunk:ProfileChunk,row:number){
  const p=row*5,r=chunk.values[p],e1=chunk.values[p+1],e2=chunk.values[p+2],type=chunk.flags[p+4]&255;
  return type>=2&&type<=5&&Number.isFinite(r+e1+e2)&&r>0&&Math.hypot(e1,e2)<.999;
}
export function decodeModel(manifest:ModelManifest,chunk:ProfileChunk,row:number,galaxy:Galaxy):GalaxyDetailData{
  const count=validateBinary(chunk.buffer,'profiles');if(!Number.isInteger(row)||row<0||row>=count)throw new Error('Invalid model reference');
  const p=row*5,flags=chunk.flags[p+4],type=flags&255,measured=measuredShape(chunk,row),named=manifest.namedTypes[String(galaxy.id)];
  const rawIndex=type===4?4:type===2||type===3?1:chunk.values[p+3];
  const index=measured&&Number.isFinite(rawIndex)&&rawIndex>=.5?rawIndex:1;
  const fit=manifest.library.reduce((best,item)=>Math.abs(item.n-index)<Math.abs(best.n-index)?item:best);
  const known=familyByCode[(flags>>>8)&255];
  // A light-profile fit is not a visual Hubble classification. These are labeled
  // display proxies, including disk-like arms; unresolved sizes are also assumed.
  const family=known??(measured?(index>=2.5?'elliptical':type===2?'lenticular':'spiral'):'elliptical');
  const seed=(Math.imul(galaxy.id+1,2654435761)>>>0),phase=seed/4294967296*Math.PI*2;
  return {version:1,catalogId:manifest.catalogId,catalogSourceSha256:manifest.catalogSourceSha256,
    name:named?.name??galaxy.targetId,galaxy,
    shape:{radiusArcsec:measured?chunk.values[p]:manifest.fallbackRadiusMpc/galaxy.distance*180*3600/Math.PI,e1:measured?chunk.values[p+1]:0,e2:measured?chunk.values[p+2]:0,sersic:index,profileType:profileTypes[type]??'Unknown'},
    gaussians:fit.gaussians,fitMaxRelativeError:fit.weightedError,
    model:{family,typeSource:known?'catalog':'proxy',typeLabel:known?`${familyLabels[family]} · ${named?.morphology??'catalog type'}`:measured?`${family==='spiral'?'Disk-like':family==='lenticular'?'Smooth round':'Spheroidal'} approximation`:'Unresolved shape · illustrative model',shapeMeasured:measured,sourceName:named?.source,profileIndex:fit.n},
    spiral:family==='spiral'||family==='barred'?{arms:2+((seed>>>8)%3===0?1:0),pitchDegrees:18+seed%12,phaseRadians:phase,seed,bar:family==='barred'}:undefined,
    knotCount:12000};
}

export class ModelCatalog {
  private loader=new ChunkLoader();
  private chunks=new Map<string,ProfileChunk>();
  private pending=new Map<string,Promise<ProfileChunk>>();
  readonly failed=new Set<string>();
  private disposed=false;
  constructor(readonly manifest:ModelManifest,private base:string,private onChange:()=>void){}
  static async open(catalog:Manifest,url:string,signal:AbortSignal,onChange:()=>void){
    const response=await fetch(url,{signal});if(!response.ok)throw new Error('Galaxy model catalog unavailable');
    const manifest:ModelManifest=await response.json();
    if(manifest.version!==1||manifest.catalogId!==catalog.id||manifest.catalogSourceSha256!==catalog.source.sha256||manifest.count!==catalog.count||!manifest.library?.length||catalog.nodes.some(n=>!manifest.nodes[n.id]))throw new Error('Galaxy models do not match the active catalog');
    return new ModelCatalog(manifest,new URL('.',url).href,onChange);
  }
  get(id:string){const chunk=this.chunks.get(id);if(chunk)chunk.used=performance.now();return chunk}
  get pendingCount(){return this.pending.size}
  get memoryBytes(){return [...this.chunks.values()].reduce((sum,c)=>sum+c.buffer.byteLength,0)+this.loader.reservedBytes}
  async read(node:SpatialNode):Promise<ProfileChunk>{
    const cached=this.get(node.id);if(cached)return cached;
    const pending=this.pending.get(node.id);if(pending)return pending;
    const asset=this.manifest.nodes[node.id];if(!asset)throw new Error('No profile chunk for this node');
    const promise=this.loader.load(`s:${node.id}`,new URL(asset.url,this.base).href,asset,'profiles',node.storedCount,true).then(buffer=>{
      if(this.disposed)throw new DOMException('Disposed','AbortError');
      const chunk={buffer,values:new Float32Array(buffer,16),flags:new Uint32Array(buffer,16),used:performance.now()};
      this.chunks.set(node.id,chunk);this.trim();return chunk;
    }).catch(error=>{if(error.name!=='AbortError')this.failed.add(node.id);throw error}).finally(()=>{this.pending.delete(node.id);this.onChange()});
    this.pending.set(node.id,promise);return promise;
  }
  private trim(){
    for(const [id] of [...this.chunks].sort((a,b)=>a[1].used-b[1].used)){
      if(this.chunks.size<=16&&this.memoryBytes<48*1048576)break;
      this.chunks.delete(id);
    }
  }
  retry(){this.failed.clear()}
  dispose(){this.disposed=true;this.loader.dispose();this.chunks.clear()}
}
