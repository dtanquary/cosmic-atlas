import type {Explorer} from './explorer';
import {formatDistance} from './format';
import {familyLabels} from './galaxy-detail';

export interface NamedGalaxy {
  name:string; aliases:string[]; sgaId?:number; id?:number; node?:string; row?:number; targetId?:string; distance?:number;
  kind?:'observer';
}
export interface NameIndex {version:1;catalogId:string;catalogSourceSha256:string;matched:number;entries:NamedGalaxy[]}
export function normalizeName(value:string){
  return value.toLowerCase().replace(/messier/g,'m').replace(/\b(ngc|ic|ugc|pgc|m)\s*0*(\d+)/g,'$1$2').replace(/[^a-z0-9]/g,'');
}
export const observerEntry:NamedGalaxy={name:'Milky Way',aliases:['Observer','Home','Our galaxy'],kind:'observer',distance:0};
const favorites=['NGC 3982','NGC 5107','NGC 4026','NGC 4121','NGC 3738','NGC 3992'];
export function namedSuggestions(entries:NamedGalaxy[],query:string,limit=8){
  const needle=normalizeName(query);
  if(!needle)return [observerEntry,...favorites.flatMap(name=>entries.filter(e=>e.name===name&&e.id!==undefined))].slice(0,limit);
  const results:{entry:NamedGalaxy;rank:number}[]=[];
  for(const entry of [observerEntry,...entries]){
    let rank=Infinity;
    for(const name of [entry.name,...entry.aliases]){
      const normalized=normalizeName(name);
      rank=Math.min(rank,normalized===needle?0:normalized.startsWith(needle)?1:normalized.includes(needle)?2:Infinity);
    }
    if(Number.isFinite(rank))results.push({entry,rank:rank*10+(entry.id===undefined&&entry.kind!=='observer'?1:0)});
  }
  return results.sort((a,b)=>a.rank-b.rank||(a.entry.distance??Infinity)-(b.entry.distance??Infinity)||a.entry.name.localeCompare(b.entry.name)).slice(0,limit).map(r=>r.entry);
}

export class GalaxySearch {
  private entries:NamedGalaxy[]=[];
  private byId=new Map<number,NamedGalaxy>();
  private loading:Promise<void>|null=null;
  private loaded=false;
  private active=0;
  private results:NamedGalaxy[]=[];
  private busy=false;
  private readonly dialog=document.getElementById('visit-dialog') as HTMLDialogElement;
  private readonly input=document.getElementById('galaxy-query') as HTMLInputElement;
  private readonly list=document.getElementById('galaxy-results')!;
  private readonly status=document.getElementById('search-status')!;
  private readonly retry=document.getElementById('search-retry') as HTMLButtonElement;

  constructor(private atlas:Explorer,private signal:AbortSignal,private onLoaded:()=>void){
    this.input.addEventListener('input',()=>{this.active=0;this.render()},{signal});
    this.input.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();this.active=(this.active+(event.key==='ArrowDown'?1:-1)+this.results.length)%Math.max(1,this.results.length);this.highlight();
      }else if(event.key==='Enter'){event.preventDefault();void this.choose(this.active)}
    },{signal});
    this.dialog.addEventListener('close',()=>{this.input.setAttribute('aria-expanded','false')},{signal});
    this.list.addEventListener('mousedown',event=>event.preventDefault(),{signal});
    this.list.addEventListener('click',event=>{const option=(event.target as HTMLElement).closest<HTMLElement>('[data-result]');if(option)void this.choose(Number(option.dataset.result))},{signal});
    this.retry.onclick=()=>void this.load();
  }
  nameFor(id:number){return this.byId.get(id)?.name}
  open(){
    this.atlas.exitFlight();this.dialog.showModal();this.input.value='';this.active=0;this.input.setAttribute('aria-expanded','true');this.input.focus();
    if(this.loaded)this.render();else void this.load();
  }
  private async load(){
    if(this.loading)return this.loading;
    this.retry.hidden=true;this.status.textContent='Loading galaxy names…';this.list.replaceChildren();
    this.loading=(async()=>{
      try{
        const response=await fetch('/data/galaxy-search.json',{signal:this.signal});if(!response.ok)throw new Error('Galaxy names could not load.');
        const index:NameIndex=await response.json();
        if(index.version!==1||index.catalogId!==this.atlas.manifest.id||index.catalogSourceSha256!==this.atlas.manifest.source.sha256||this.atlas.manifest.subset)throw new Error('Name search is available with the full DESI DR1 atlas.');
        this.entries=index.entries;this.byId=new Map(index.entries.filter(e=>e.id!==undefined).map(e=>[e.id!,e]));this.loaded=true;this.onLoaded();this.render();
      }catch(error){if(!this.signal.aborted){this.status.textContent=error instanceof Error?error.message:'Galaxy names could not load.';this.retry.hidden=false}}
      finally{this.loading=null}
    })();return this.loading;
  }
  private render(){
    if(!this.loaded)return;
    this.results=namedSuggestions(this.entries,this.input.value);this.active=Math.min(this.active,Math.max(0,this.results.length-1));
    this.list.replaceChildren();
    this.status.textContent=this.input.value.trim()?`${this.results.length} suggestion${this.results.length===1?'':'s'}`:'Popular & nearby · available in this atlas';
    if(!this.results.length)this.status.textContent='No named match. Try an NGC, IC, UGC or Messier name.';
    for(const [i,entry] of this.results.entries()){
      const option=document.createElement('li');option.id=`galaxy-option-${i}`;option.setAttribute('role','option');
      const available=entry.kind==='observer'||entry.id!==undefined;option.setAttribute('aria-disabled',String(!available));
      const title=document.createElement('span');title.className='search-result-name';title.textContent=entry.name;
      const detail=document.createElement('span');detail.className='search-result-detail';
      const model=entry.id===undefined?null:this.atlas.resolvedFor(entry.id);
      const recorded=entry.id===undefined?null:this.atlas.modelCatalog?.manifest.namedTypes[String(entry.id)];
      const modelLabel=recorded?`${familyLabels[recorded.family]} model`:model?.data.spiral?'Spiral model':model?'Smooth model':this.atlas.modelCatalog?'3D model':'Catalog point';
      const aliases=entry.aliases.filter(a=>a!==entry.name&&!a.startsWith('PGC')&&!a.startsWith('UGC')&&!a.startsWith('Messier')).slice(0,2).join(' · ');
      detail.textContent=entry.kind==='observer'?'Observer · our location':available?[aliases,formatDistance(entry.distance!,this.atlas.units),modelLabel].filter(Boolean).join(' · '):[aliases,'No matched observation in this atlas'].filter(Boolean).join(' · ');
      option.append(title,detail);option.dataset.result=String(i);this.list.append(option);
    }
    this.highlight();
  }
  private highlight(){
    [...this.list.children].forEach((element,i)=>element.setAttribute('aria-selected',String(i===this.active)));
    const selected=this.list.children[this.active];
    if(selected){this.input.setAttribute('aria-activedescendant',selected.id);selected.scrollIntoView({block:'nearest'})}else this.input.removeAttribute('aria-activedescendant');
  }
  private async choose(index:number){
    if(this.busy)return;
    const entry=this.results[index];if(!entry)return;
    if(entry.kind!=='observer'&&entry.id===undefined){this.status.textContent='This name has no verified matching observation in the current atlas.';return}
    this.busy=true;this.input.disabled=true;this.status.textContent=`Visiting ${entry.name}…`;
    try{
      if(entry.kind==='observer')this.atlas.focusObserver();
      else await this.atlas.visitCatalog({id:entry.id!,node:entry.node!,row:entry.row!,targetId:entry.targetId!});
      this.dialog.close();
    }catch(error){this.status.textContent=error instanceof Error?error.message:'Could not visit this galaxy. Try again.'}
    finally{this.busy=false;this.input.disabled=false;this.input.focus()}
  }
}
