import type {Explorer} from './explorer';
import {formatDistance} from './format';
import {familyLabels} from './galaxy-detail';
import {nearbyReference} from './nearby-galaxies';

export interface NamedGalaxy {
  name:string; aliases:string[]; sgaId?:number; id?:number; node?:string; row?:number; targetId?:string; distance?:number;
  kind?:'observer'|'nearby';
}
export interface NameIndex {version:1;catalogId:string;catalogSourceSha256:string;matched:number;entries:NamedGalaxy[]}
export function normalizeName(value:string){
  return value.toLowerCase().replace(/messier/g,'m').replace(/\b(ngc|ic|ugc|pgc|m)\s*0*(\d+)/g,'$1$2').replace(/[^a-z0-9]/g,'');
}
export const observerEntry:NamedGalaxy={name:'Milky Way',aliases:['Observer','Home','Our galaxy'],kind:'observer',distance:0};
export const nearbyEntries:NamedGalaxy[]=nearbyReference.entries.map(entry=>({name:entry.name,aliases:entry.aliases,kind:'nearby',id:entry.id,distance:entry.distanceMpc}));
export function mergeNearbyNames(entries:NamedGalaxy[]){
 const aliases=new Set(nearbyEntries.flatMap(entry=>[entry.name,...entry.aliases].map(normalizeName)));
 return [...nearbyEntries,...entries.filter(entry=>![entry.name,...entry.aliases].some(name=>aliases.has(normalizeName(name))))];
}
const favorites=['NGC 3982','NGC 5107','NGC 4026','NGC 4121','NGC 3738','NGC 3992'];
const isVisitable=(entry:NamedGalaxy)=>entry.kind==='observer'||entry.id!==undefined;
export function namedSuggestions(entries:NamedGalaxy[],query:string,limit=8){
  const needle=normalizeName(query);
  if(!needle)return [observerEntry,...entries.filter(entry=>entry.kind==='nearby'),...favorites.flatMap(name=>entries.filter(e=>e.name===name&&e.id!==undefined))].slice(0,limit);
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
  private pendingVisit:AbortController|null=null;
  private readonly dialog=document.getElementById('visit-dialog') as HTMLDialogElement;
  private readonly input=document.getElementById('galaxy-query') as HTMLInputElement;
  private readonly list=document.getElementById('galaxy-results')!;
  private readonly status=document.getElementById('search-status')!;
  private readonly retry=document.getElementById('search-retry') as HTMLButtonElement;
  private readonly unavailable=document.getElementById('unavailable-matches')!;
  private readonly unavailableNames=document.getElementById('unavailable-names')!;
  private readonly browse=document.getElementById('browse-available') as HTMLButtonElement;

  constructor(private atlas:Explorer,private signal:AbortSignal,private onLoaded:()=>void){
    this.input.addEventListener('input',()=>{this.active=0;this.render()},{signal});
    this.input.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        if(!this.results.length)return;
        event.preventDefault();this.active=(this.active+(event.key==='ArrowDown'?1:-1)+this.results.length)%Math.max(1,this.results.length);this.highlight();
      }else if(event.key==='Enter'){event.preventDefault();void this.choose(this.active)}
    },{signal});
    const cancelVisit=()=>{this.pendingVisit?.abort();this.pendingVisit=null;this.busy=false;this.input.disabled=false;this.dialog.removeAttribute('aria-busy')};
    this.dialog.addEventListener('cancel',cancelVisit,{signal});
    this.dialog.addEventListener('close',()=>{if(this.dialog.open)return;cancelVisit();this.input.setAttribute('aria-expanded','false');this.input.removeAttribute('aria-activedescendant')},{signal});
    signal.addEventListener('abort',cancelVisit,{once:true});
    this.list.addEventListener('mousedown',event=>event.preventDefault(),{signal});
    this.list.addEventListener('click',event=>{const option=(event.target as HTMLElement).closest<HTMLElement>('[data-result]');if(option)void this.choose(Number(option.dataset.result))},{signal});
    this.retry.onclick=()=>void this.load();
    this.browse.onclick=()=>{this.input.value='';this.active=0;this.render();this.input.focus()};
  }
  nameFor(id:number){return this.byId.get(id)?.name}
  /** The verified visit reference for an exact index name, or null when the name is unmatched or the DESI index is not loaded (subsets). */
  find(name:string){const entry=this.entries.find(entry=>entry.name===name&&entry.id!==undefined&&entry.node!==undefined);return entry?{id:entry.id!,node:entry.node!,row:entry.row!,targetId:entry.targetId!}:null}
  /** Resolves once the name index has loaded (or fallen back to nearby names), without opening the dialog. */
  ready(){return this.loaded?Promise.resolve():this.load()}
  open(){
    this.pendingVisit?.abort();this.pendingVisit=null;this.busy=false;this.input.disabled=false;this.dialog.removeAttribute('aria-busy');
    this.atlas.exitFlight();this.dialog.showModal();this.input.value='';this.active=0;this.input.setAttribute('aria-expanded','true');this.input.focus();
    if(this.loaded)this.render();else void this.load();
  }
  private async load(){
    if(this.loading)return this.loading;
    this.retry.hidden=true;this.status.textContent='Loading galaxy names…';this.results=[];this.list.replaceChildren();this.list.hidden=true;this.unavailable.hidden=true;this.browse.hidden=true;this.highlight();
    this.loading=(async()=>{
      try{
        if(this.atlas.manifest.subset){this.entries=mergeNearbyNames([]);this.byId=new Map(this.entries.map(e=>[e.id!,e]));this.loaded=true;this.onLoaded();this.render();return}
        const response=await fetch(this.atlas.catalogAsset('galaxy-search.json'),{signal:this.signal});if(!response.ok)throw new Error('Galaxy names could not load.');
        const index:NameIndex=await response.json();
        if(index.version!==1||index.catalogId!==this.atlas.manifest.id||index.catalogSourceSha256!==this.atlas.manifest.source.sha256||this.atlas.manifest.subset)throw new Error('Name search is available with the full DESI DR1 atlas.');
        this.entries=mergeNearbyNames(index.entries);this.byId=new Map(this.entries.filter(e=>e.id!==undefined).map(e=>[e.id!,e]));this.loaded=true;this.onLoaded();this.render();
      }catch(error){if(!this.signal.aborted){this.entries=mergeNearbyNames([]);this.byId=new Map(this.entries.map(e=>[e.id!,e]));this.loaded=true;this.onLoaded();this.render();this.status.textContent+=' · DESI names unavailable; nearby galaxies remain available.';this.retry.hidden=false}}
      finally{this.loading=null}
    })();return this.loading;
  }
  private render(){
    if(!this.loaded)return;
    const matches=namedSuggestions(this.entries,this.input.value),unavailable=matches.filter(entry=>!isVisitable(entry));
    this.results=matches.filter(isVisitable);this.active=Math.min(this.active,Math.max(0,this.results.length-1));
    this.list.replaceChildren();this.list.hidden=!this.results.length;
    this.unavailableNames.replaceChildren();this.unavailable.hidden=!unavailable.length;
    this.browse.hidden=!this.input.value.trim()||this.results.length>0;
    const availability=this.results.length?`${this.results.length} available to visit`:`no visit location${matches.length===1?'':'s'}`;
    this.status.textContent=this.input.value.trim()?`${matches.length} name match${matches.length===1?'':'es'} · ${availability}`:'Popular & nearby · available in this atlas';
    if(!matches.length)this.status.textContent='No name matches. Try an NGC, IC, UGC or Messier name.';
    for(const entry of unavailable){
      const item=document.createElement('li'),title=document.createElement('span'),aliases=document.createElement('span');
      const needle=normalizeName(this.input.value);
      const matchedAlias=entry.aliases.find(alias=>normalizeName(alias).includes(needle)&&!/^(NGC|IC|UGC|PGC|M |Messier )/i.test(alias));
      title.className='search-result-name';title.textContent=matchedAlias??entry.name;
      aliases.className='search-result-detail';aliases.textContent=[entry.name,...entry.aliases].filter((name,i,all)=>name!==title.textContent&&!name.startsWith('PGC')&&!name.startsWith('UGC')&&!name.startsWith('Messier')&&all.indexOf(name)===i).slice(0,3).join(' · ');
      item.append(title,aliases);this.unavailableNames.append(item);
    }
    for(const [i,entry] of this.results.entries()){
      const option=document.createElement('li');option.id=`galaxy-option-${i}`;option.setAttribute('role','option');
      const title=document.createElement('span');title.className='search-result-name';title.textContent=entry.name;
      const detail=document.createElement('span');detail.className='search-result-detail';
      const model=entry.id===undefined?null:this.atlas.resolvedFor(entry.id);
      const recorded=entry.id===undefined?null:this.atlas.modelCatalog?.manifest.namedTypes[String(entry.id)];
      const modelLabel=recorded?`${familyLabels[recorded.family]} model`:model?.data.spiral?'Spiral model':model?'Smooth model':this.atlas.modelCatalog?'3D model':'Catalog point';
      const aliases=entry.aliases.filter(a=>a!==entry.name&&!a.startsWith('PGC')&&!a.startsWith('UGC')&&!a.startsWith('Messier')).slice(0,2).join(' · ');
      detail.textContent=entry.kind==='observer'?'Our home galaxy · Galactic core view':entry.kind==='nearby'?[aliases,formatDistance(entry.distance!,this.atlas.units),'Independent distance'].filter(Boolean).join(' · '):[aliases,formatDistance(entry.distance!,this.atlas.units),modelLabel].filter(Boolean).join(' · ');
      option.append(title,detail);option.dataset.result=String(i);this.list.append(option);
    }
    this.highlight();
  }
  private highlight(){
    this.input.setAttribute('aria-expanded',String(this.dialog.open&&this.results.length>0));
    [...this.list.children].forEach((element,i)=>element.setAttribute('aria-selected',String(i===this.active)));
    const selected=this.list.children[this.active];
    if(selected){this.input.setAttribute('aria-activedescendant',selected.id);selected.scrollIntoView({block:'nearest'})}else this.input.removeAttribute('aria-activedescendant');
  }
  private async choose(index:number){
    if(this.busy)return;
    const entry=this.results[index];if(!entry)return;
    if(!isVisitable(entry))return;
    const controller=new AbortController();this.pendingVisit=controller;
    this.busy=true;this.input.disabled=true;this.dialog.setAttribute('aria-busy','true');this.status.textContent=`Visiting ${entry.name}…`;
    try{
      if(entry.kind==='observer')this.atlas.visitMilkyWay();
      else if(entry.kind==='nearby')this.atlas.visitNearby(entry.id!);
      // Check the actual dialog state as well: its close event is asynchronous.
      else await this.atlas.visitCatalog({id:entry.id!,node:entry.node!,row:entry.row!,targetId:entry.targetId!},()=>this.dialog.open&&this.pendingVisit===controller&&!controller.signal.aborted);
      if(controller.signal.aborted||!this.dialog.open)return;
      this.dialog.close();
    }catch(error){if(!controller.signal.aborted)this.status.textContent=error instanceof Error?error.message:'Could not visit this galaxy. Try again.'}
    finally{
      // An earlier request cannot reset a newly opened search or steal its focus.
      if(this.pendingVisit===controller){this.pendingVisit=null;this.busy=false;this.input.disabled=false;this.dialog.removeAttribute('aria-busy');if(this.dialog.open)this.input.focus()}
    }
  }
}
