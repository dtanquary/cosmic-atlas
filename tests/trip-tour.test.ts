import {describe,it,expect,vi} from 'vitest';
import {Tour,type TourAtlas,type TourHooks} from '../src/tour';
import {tripRoute,type Trip} from '../src/trips';
const trip:Trip={version:1,title:'Saved route',stops:[{id:'saved',kind:'view',name:'Panned galaxy',hash:'#t=1,2,3&c=0.1,0,0&g=desi:512:10:39633325333155389'}]};
describe('custom tour navigation ownership',()=>{
 it('preserves the creator camera and revokes a pending lookup on pause or exit',async()=>{
  for(const action of ['pause','exit'] as const){
   let options:{preserveTarget?:boolean;canNavigate?:()=>boolean}|undefined,resolve!:(arrived:boolean)=>void;
   const atlas={manifest:{count:1},camera:{position:{x:0,y:0,z:1}},controls:{target:{x:0,y:0,z:0}},milkyWay:{approachDirection:{x:0,y:0,z:1}},applyView:vi.fn((_state,_seconds,opts)=>{options=opts;return new Promise<boolean>(r=>{resolve=r})}),stopTravel:vi.fn()} as unknown as TourAtlas;
   const hooks={showCosmicHorizon:vi.fn(),resolveCatalog:()=>null,onChange:vi.fn(),notify:vi.fn()} satisfies TourHooks;
   const tour=new Tour(atlas,tripRoute(trip),hooks);tour.start();expect(options?.preserveTarget).toBe(true);expect(options?.canNavigate?.()).toBe(true);tour[action]();expect(options?.canNavigate?.()).toBe(false);resolve(false);await Promise.resolve();expect(tour.state.status).toBe(action==='exit'?'idle':'paused');expect(tour.state.autoplay).toBe(false);
  }
 });
});
