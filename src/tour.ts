import type {ViewState} from './view-link';
import type {Vec3} from './types';
import {cartesian} from './format';
import {nearbyReference} from './nearby-galaxies';
import data from './data/tours.json';

export type StopKind='sun'|'core'|'localgroup'|'overview'|'cmb'|'nearby'|'catalog'|'cluster';
/** `cites` names the nearby galaxy whose distance the caption quotes when it is not the target; `{catalogCount}` in a caption is filled from the active manifest. */
export interface TourStop{
  title:string;caption:string;target:{kind:StopKind;key?:string;name?:string;positionMpc?:number[]};
  distanceMpc?:number;cites?:string;dwellSeconds?:number;travelSeconds:number;
}
export interface TourData{key:string;title:string;summary:string;stops:TourStop[]}
export const tours=data.tours as unknown as TourData[];
export const DWELL_SECONDS=8;
export interface CatalogEntry{id:number;node:string;row:number;targetId:string}
type XYZ={x:number;y:number;z:number};
/** The explorer surface a tour drives; every visit resolves true on arrival, false when taken over by input, flight or a newer focus. */
export interface TourAtlas{
  manifest:{count:number};camera:{position:XYZ};controls:{target:XYZ};milkyWay:{approachDirection:XYZ};
  reset(seconds:number):Promise<boolean>|undefined;
  viewCosmicHorizon(seconds:number):Promise<boolean>|undefined;
  visitMilkyWay(seconds:number):Promise<boolean>|undefined;
  visitNearby(id:number,seconds:number):Promise<boolean>|undefined;
  visitCatalog(entry:CatalogEntry,canNavigate:()=>boolean,seconds:number):Promise<boolean|void>;
  applyView(state:ViewState,seconds:number):Promise<boolean>;
}
export type TourStatus='idle'|'travelling'|'dwelling'|'paused'|'finished';
export interface TourState{index:number;status:TourStatus;stop:TourStop|null;autoplay:boolean}
export interface TourHooks{
  showCosmicHorizon(visible:boolean):void;
  resolveCatalog(name:string):CatalogEntry|null;
  onChange(state:TourState):void;
  notify(message:string):void;
}
const vec=(v:XYZ):Vec3=>[v.x,v.y,v.z];
const add=(a:Vec3,b:Vec3,k:number):Vec3=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k];

/**
 * Plays one route over the explorer's animated visits: travel → dwell → next, with a single timer. Every stop uses its
 * own travelSeconds, including the first one from wherever the camera happens to be. The tour never moves the camera
 * itself; input that takes over a travel pauses it, and a pose change during the dwell pauses instead of hopping.
 */
export class Tour{
  state:TourState={index:-1,status:'idle',stop:null,autoplay:false};
  private timer:ReturnType<typeof setTimeout>|null=null;
  private serial=0;private step=1;
  private arrival:{target:Vec3;camera:Vec3}|null=null;
  constructor(private atlas:TourAtlas,readonly tour:TourData,private hooks:TourHooks){}
  start(index=0){if(!this.tour.stops[index])return;this.set({autoplay:true});void this.goTo(index)}
  next(){if(this.state.index+1<this.tour.stops.length)void this.goTo(this.state.index+1);else this.finish()}
  previous(){void this.goTo(this.state.index-1)}
  play(){
    if(this.state.status==='idle'||this.state.status==='finished')return this.start(0);
    this.set({autoplay:true});
    if(this.state.status!=='paused')return; // travelling or dwelling: arrival (or the running timer) continues
    if(this.arrival&&!this.moved()){this.set({status:'dwelling'});this.schedule()}
    else void this.goTo(this.state.index); // taken over mid-travel or moved since: travel back to the stop
  }
  pause(){this.clearTimer();this.set({autoplay:false,status:this.state.status==='dwelling'?'paused':this.state.status})}
  exit(){this.clearTimer();this.serial++;if(this.state.stop?.target.kind==='cmb')this.hooks.showCosmicHorizon(false);this.arrival=null;this.set({index:-1,status:'idle',stop:null,autoplay:false})}
  private finish(){this.clearTimer();this.serial++;this.set({status:'finished',autoplay:false})}
  private set(patch:Partial<TourState>){this.state={...this.state,...patch};this.hooks.onChange(this.state)}
  private clearTimer(){if(this.timer!==null)clearTimeout(this.timer);this.timer=null}
  private pose(){return {target:vec(this.atlas.controls.target),camera:vec(this.atlas.camera.position)}}
  /** Any orbit, pan or wheel during the dwell changes the pose by far more than 1e-6 of the orbit distance. */
  private moved(){
    const now=this.pose(),then=this.arrival!,scale=1e-6*Math.hypot(...add(now.camera,now.target,-1));
    return Math.hypot(...add(now.camera,then.camera,-1))>scale||Math.hypot(...add(now.target,then.target,-1))>scale;
  }
  private schedule(){this.clearTimer();this.timer=setTimeout(()=>{this.timer=null;if(this.moved())this.set({status:'paused',autoplay:false});else this.next()},(this.state.stop!.dwellSeconds??DWELL_SECONDS)*1000)}
  /** The stop as the panel should show it: the caption's `{catalogCount}` is the active dataset's accepted count. */
  private present(stop:TourStop):TourStop{return {...stop,caption:stop.caption.replaceAll('{catalogCount}',this.atlas.manifest?.count.toLocaleString('en-US')??'all')}}
  private async goTo(index:number):Promise<void>{
    const stop=this.tour.stops[index];if(!stop)return;
    this.clearTimer();const serial=++this.serial;this.step=index<this.state.index?-1:1;
    if(this.state.stop?.target.kind==='cmb'&&stop.target.kind!=='cmb')this.hooks.showCosmicHorizon(false);
    this.set({index,stop:this.present(stop),status:'travelling'});
    let arrived:boolean|void|'skipped';
    try{arrived=await this.visit(stop,serial)}
    catch(error){arrived='skipped';if(serial===this.serial)this.hooks.notify(`${stop.title}: ${error instanceof Error?error.message:'unavailable'} Skipping.`)}
    if(serial!==this.serial)return; // superseded by a newer stop, exit or finish
    if(arrived==='skipped'){const following=index+this.step;if(this.tour.stops[following])return this.goTo(following);this.set({status:this.step>0?'finished':'paused',autoplay:false});return}
    if(arrived===false){this.set({status:'paused',autoplay:false});return} // orbit input, flight or another focus took over
    this.arrival=this.pose();this.set({status:this.state.autoplay?'dwelling':'paused'});
    if(this.state.autoplay)this.schedule();
  }
  /** visitCatalog resolves when its travel starts (Phase 3 voids the inner arrival), so only an explicit false counts as cancelled. */
  private visit(stop:TourStop,serial:number){
    const {target,distanceMpc}=stop,s=stop.travelSeconds,approach=vec(this.atlas.milkyWay.approachDirection);
    switch(target.kind){
      case 'sun':return this.atlas.applyView({target:[0,0,0],camera:add([0,0,0],approach,distanceMpc??.06),identity:'sun'},s);
      case 'core':return this.atlas.visitMilkyWay(s);
      case 'overview':return this.atlas.reset(s);
      case 'cmb':this.hooks.showCosmicHorizon(true);return this.atlas.viewCosmicHorizon(s);
      case 'localgroup':case 'cluster':{const at=target.positionMpc as Vec3;return this.atlas.applyView({target:at,camera:add(at,approach,distanceMpc!),identity:null},s)}
      case 'nearby':{
        const entry=nearbyReference.entries.find(entry=>entry.key===target.key);if(!entry)throw new Error('Unknown nearby galaxy.');
        if(distanceMpc===undefined)return this.atlas.visitNearby(entry.id,s);
        // Observer-facing like visitGalaxy, pulled back to the stop's own distance so the satellites stay in frame.
        const at=cartesian(entry.raDeg,entry.decDeg,entry.distanceMpc);
        return this.atlas.applyView({target:at,camera:add(at,at,-distanceMpc/entry.distanceMpc),identity:`nearby:${entry.key}`},s);
      }
      case 'catalog':{
        const entry=this.hooks.resolveCatalog(target.name!);
        if(!entry){this.hooks.notify(`${stop.title} is not available in this dataset; skipping.`);return 'skipped' as const}
        return this.atlas.visitCatalog(entry,()=>serial===this.serial,s);
      }
    }
  }
}
