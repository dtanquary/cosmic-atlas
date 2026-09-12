import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {DWELL_SECONDS,Tour,tours,type CatalogEntry,type TourAtlas,type TourState} from '../src/tour';
import type {Explorer} from '../src/explorer';
import type {ViewState} from '../src/view-link';
import {cartesian} from '../src/format';
import {nearbyReference} from '../src/nearby-galaxies';

// The real explorer must satisfy the surface the tour drives (compile-time only).
const _explorerIsATourAtlas:TourAtlas=null as unknown as Explorer;void _explorerIsATourAtlas;

class FakeAtlas implements TourAtlas{
  manifest={count:1000000};
  camera={position:new THREE.Vector3(0,0,1)};controls={target:new THREE.Vector3()};
  milkyWay={approachDirection:new THREE.Vector3(.6,0,.8)};
  calls:{method:string;args:unknown[]}[]=[];
  canNavigate:(()=>boolean)|null=null;
  stops=0;
  private pending:((arrived:boolean)=>void)|null=null;
  /** Like the explorer: a running travel resolves false; nothing pending is a no-op. */
  stopTravel(){this.stops++;const resolve=this.pending;if(resolve){this.pending=null;resolve(false)}}
  private visit(method:string,...args:unknown[]){this.calls.push({method,args});return new Promise<boolean>(resolve=>{this.pending=resolve})}
  reset(s:number){return this.visit('reset',s)}
  viewCosmicHorizon(s:number){return this.visit('viewCosmicHorizon',s)}
  visitMilkyWay(s:number):Promise<boolean>|undefined{return this.visit('visitMilkyWay',s)}
  visitNearby(id:number,s:number){return this.visit('visitNearby',id,s)}
  visitCatalog(entry:CatalogEntry,canNavigate:()=>boolean,s:number){this.canNavigate=canNavigate;return this.visit('visitCatalog',entry,s)}
  applyView(state:ViewState,s:number){return this.visit('applyView',state,s)}
  settle(arrived:boolean){const resolve=this.pending;this.pending=null;resolve?.(arrived);return flush()}
  get last(){return this.calls[this.calls.length-1]}
}
const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve()};
const entry:CatalogEntry={id:13426480,node:'512',row:20296,targetId:'39633325333155389'};
const roadTrip=tours.find(tour=>tour.key==='road-trip')!,zoomOut=tours.find(tour=>tour.key==='zoom-out')!;
const nearbyId=(key:string)=>nearbyReference.entries.find(e=>e.key===key)!.id;

function setup(tour=roadTrip,available=true){
  const atlas=new FakeAtlas(),shell:boolean[]=[],notices:string[]=[],states:TourState[]=[];
  const runner=new Tour(atlas,tour,{showCosmicHorizon:v=>shell.push(v),resolveCatalog:()=>available?entry:null,onChange:s=>states.push(s),notify:m=>notices.push(m)});
  return {atlas,runner,shell,notices,states};
}
const dwell=(runner:Tour)=>vi.advanceTimersByTimeAsync((runner.state.stop!.dwellSeconds??DWELL_SECONDS)*1000);

beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());

describe('Tour runner',()=>{
  it('plays the road trip choosing the visit per kind with each stop\'s travel seconds',async()=>{
    const {atlas,runner,shell}=setup();
    runner.start();
    const expected:[string,unknown[]][]=[
      ['visitMilkyWay',[4]],['visitNearby',[nearbyId('lmc'),5]],['visitNearby',[nearbyId('smc'),5]],['visitNearby',[nearbyId('m31'),5]],
      ['applyView',[expect.objectContaining({identity:'nearby:m31'}),4]],['visitNearby',[nearbyId('m33'),5]],
      ['visitCatalog',[entry,6]],['visitCatalog',[entry,5]],['applyView',[expect.objectContaining({identity:null}),6]],['reset',[6]],
    ];
    for(const [i,[method,args]] of expected.entries()){
      expect(runner.state).toMatchObject({index:i,status:'travelling',autoplay:true});expect(runner.state.stop!.title).toBe(roadTrip.stops[i].title);
      expect(atlas.calls.length).toBe(i+1);expect(atlas.last.method).toBe(method);expect(atlas.last.args).toEqual(args);
      await atlas.settle(true);
      expect(runner.state.status).toBe('dwelling');expect(vi.getTimerCount()).toBe(1);
      await dwell(runner);
    }
    expect(runner.state).toMatchObject({index:9,status:'finished',autoplay:false});
    expect(vi.getTimerCount()).toBe(0);expect(atlas.calls.length).toBe(10);expect(shell).toEqual([]);
    // The overview caption names the active dataset's accepted count, not the full-release figure.
    expect(roadTrip.stops[9].caption).toContain('{catalogCount}');
    expect(runner.state.stop!.caption).toContain('1,000,000 accepted DESI DR1 observations in this dataset');
    expect(runner.state.stop!.caption).not.toContain('{catalogCount}');
    // Satellite framing: observer-facing from Andromeda, pulled back to the stop's 0.16 Mpc.
    const m31=nearbyReference.entries.find(e=>e.key==='m31')!,at=cartesian(m31.raDeg,m31.decDeg,m31.distanceMpc),satellites=atlas.calls[4].args[0] as ViewState;
    expect(satellites.target).toEqual(at);
    satellites.camera.forEach((v,i)=>expect(v).toBeCloseTo(at[i]*(1-.16/.785),12));
    // Cluster framing: the NED center, camera along the Milky Way approach direction at the stop distance.
    const coma=roadTrip.stops[8],cluster=atlas.calls[8].args[0] as ViewState;
    expect(cluster.target).toEqual(coma.target.positionMpc);
    cluster.camera.forEach((v,i)=>expect(v).toBeCloseTo(coma.target.positionMpc![i]+[.6,0,.8][i]*coma.distanceMpc!,12));
  });
  it('frames the zoom-out: Sun view from the origin, Local Group midpoint, overview reset and the CMB shell hook',async()=>{
    const {atlas,runner,shell}=setup(zoomOut);
    runner.start();
    expect(atlas.last).toEqual({method:'applyView',args:[{target:[0,0,0],camera:[.6*.003,0,.8*.003],identity:'sun'},4]});
    await atlas.settle(true);await dwell(runner);
    expect(atlas.last).toEqual({method:'visitMilkyWay',args:[5]});
    await atlas.settle(true);await dwell(runner);
    const group=zoomOut.stops[2],view=atlas.last.args[0] as ViewState;
    expect(atlas.last.method).toBe('applyView');expect(atlas.last.args[1]).toBe(6);
    expect(view.identity).toBeNull();expect(view.target).toEqual(group.target.positionMpc);
    view.camera.forEach((v,i)=>expect(v).toBeCloseTo(group.target.positionMpc![i]+[.6,0,.8][i]*1.2,12));
    await atlas.settle(true);await dwell(runner);
    expect(atlas.last).toEqual({method:'reset',args:[6]});expect(shell).toEqual([]);
    await atlas.settle(true);await dwell(runner);
    expect(shell).toEqual([true]);expect(atlas.last).toEqual({method:'viewCosmicHorizon',args:[6]});
    await atlas.settle(true);await dwell(runner);
    expect(runner.state.status).toBe('finished');expect(shell).toEqual([true]); // the shell stays until exit
    runner.exit();
    expect(shell).toEqual([true,false]);expect(runner.state).toEqual({index:-1,status:'idle',stop:null,autoplay:false});
    runner.start(4);await atlas.settle(true);runner.previous();
    expect(shell).toEqual([true,false,true,false]);expect(atlas.last).toEqual({method:'reset',args:[6]});
  });
  it('pauses when input takes over a travel and schedules nothing; play travels back',async()=>{
    const {atlas,runner}=setup();
    runner.start();await atlas.settle(false);
    expect(runner.state).toMatchObject({index:0,status:'paused',autoplay:false});expect(vi.getTimerCount()).toBe(0);
    runner.play();
    expect(runner.state).toMatchObject({index:0,status:'travelling',autoplay:true});expect(atlas.calls.length).toBe(2);expect(atlas.last.method).toBe('visitMilkyWay');
  });
  it('play schedules exactly one timer, pause clears it, and a pause during travel lands paused',async()=>{
    const {atlas,runner}=setup();
    runner.start();await atlas.settle(true);
    expect(vi.getTimerCount()).toBe(1);
    runner.pause();
    expect(runner.state).toMatchObject({status:'paused',autoplay:false});expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);expect(atlas.calls.length).toBe(1);
    runner.play();
    expect(runner.state).toMatchObject({status:'dwelling',autoplay:true});expect(vi.getTimerCount()).toBe(1);expect(atlas.calls.length).toBe(1);
    await dwell(runner);
    expect(runner.state).toMatchObject({index:1,status:'travelling'});
    runner.pause(); // mid-travel: the explorer's travel is stopped and the cancelled arrival lands paused
    expect(atlas.stops).toBe(1);await flush();
    expect(runner.state).toMatchObject({index:1,status:'paused',autoplay:false});expect(vi.getTimerCount()).toBe(0);
  });
  it('pauses when a visit could not start instead of dwelling at the wrong pose',async()=>{
    const {atlas,runner}=setup();
    atlas.visitMilkyWay=()=>undefined;
    runner.start();await flush();
    expect(runner.state).toMatchObject({index:0,status:'paused',autoplay:false});expect(vi.getTimerCount()).toBe(0);
  });
  it('dwells for the default eight seconds unless a stop sets its own',async()=>{
    const {atlas,runner}=setup({...roadTrip,stops:[roadTrip.stops[0],{...roadTrip.stops[1],dwellSeconds:2}]});
    runner.start();await atlas.settle(true);
    await vi.advanceTimersByTimeAsync(DWELL_SECONDS*1000-1);expect(runner.state.status).toBe('dwelling');
    await vi.advanceTimersByTimeAsync(1);expect(runner.state).toMatchObject({index:1,status:'travelling'});
    await atlas.settle(true);
    await vi.advanceTimersByTimeAsync(1999);expect(runner.state.status).toBe('dwelling');
    await vi.advanceTimersByTimeAsync(1);expect(runner.state.status).toBe('finished');
  });
  it('pauses instead of hopping when the pose changed during the dwell',async()=>{
    const {atlas,runner}=setup();
    runner.start();await atlas.settle(true);
    atlas.camera.position.x+=1e-8; // below 1e-6 of the 1 Mpc orbit distance: not a user move
    await dwell(runner);
    expect(runner.state).toMatchObject({index:1,status:'travelling'});expect(atlas.calls.length).toBe(2);
    await atlas.settle(true);
    atlas.controls.target.y+=1e-5;
    await dwell(runner);
    expect(runner.state).toMatchObject({index:1,status:'paused',autoplay:false});expect(atlas.calls.length).toBe(2);
    runner.play(); // still displaced from the arrival pose: travel back instead of hopping
    expect(runner.state).toMatchObject({index:1,status:'travelling',autoplay:true});expect(atlas.calls.length).toBe(3);
  });
  it('skips unresolved catalog stops with a notice, in the direction of travel',async()=>{
    const {atlas,runner,notices}=setup(roadTrip,false);
    runner.start(6);await flush();
    expect(notices).toEqual(['NGC 3982 is not available in this dataset; skipping.','NGC 4026 is not available in this dataset; skipping.']);
    expect(runner.state).toMatchObject({index:8,status:'travelling'});expect(atlas.calls.map(c=>c.method)).toEqual(['applyView']);
    await atlas.settle(true);
    runner.previous();await flush();
    expect(runner.state).toMatchObject({index:5,status:'travelling'});expect(atlas.last).toEqual({method:'visitNearby',args:[nearbyId('m33'),5]});
    expect(notices.length).toBe(4);
    await atlas.settle(true);
    runner.start(6);await flush(); // a start always skips forward, whatever the previous index was
    expect(runner.state).toMatchObject({index:8,status:'travelling'});expect(atlas.last.method).toBe('applyView');expect(notices.length).toBe(6);
  });
  it('treats a rejected visit like an unavailable stop and passes a live navigation guard to visitCatalog',async()=>{
    const {atlas,runner,notices}=setup();
    runner.start(6);
    const guard=atlas.canNavigate!;expect(guard()).toBe(true);
    atlas.visitCatalog=()=>Promise.reject(new Error('The name index does not match this catalog.'));
    runner.next();
    expect(guard()).toBe(false); // the superseded NGC 3982 visit must not move the camera
    await flush();
    expect(notices).toEqual(['NGC 4026: The name index does not match this catalog. Skipping.']);
    expect(runner.state).toMatchObject({index:8,status:'travelling'});expect(atlas.last.method).toBe('applyView');
  });
  it('ignores out-of-range stops, finishes after the last stop and drops late arrivals after exit',async()=>{
    const {atlas,runner,states}=setup();
    runner.start(99);runner.previous();
    expect(runner.state.status).toBe('idle');expect(atlas.calls.length).toBe(0);expect(states.length).toBe(0);
    runner.start(9);await atlas.settle(true);
    runner.next();
    expect(runner.state).toMatchObject({index:9,status:'finished',autoplay:false});expect(vi.getTimerCount()).toBe(0);
    runner.play();
    expect(runner.state).toMatchObject({index:0,status:'travelling'});
    runner.exit(); // stops the explorer's travel; the cancelled arrival is ignored
    expect(atlas.stops).toBe(1);await atlas.settle(true);
    expect(runner.state.status).toBe('idle');expect(vi.getTimerCount()).toBe(0);
  });
});
