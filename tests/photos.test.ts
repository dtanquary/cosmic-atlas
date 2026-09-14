import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {photographs,photosForStop,photosForIdentity,matchedPhotoView,PHOTO_MAX_BYTES,PHOTO_MAX_DECODED} from '../src/photos';
import {tours} from '../src/tour';
import {nearbyReference} from '../src/nearby-galaxies';
const names=JSON.parse(readFileSync(new URL('../public/data/galaxy-search.json',import.meta.url),'utf8')).entries as {name:string;targetId:string}[];
describe('photograph provenance and budgets',()=>{
 it('pins exact source bytes, image dimensions, credits and independent rights for every asset',()=>{
  expect(new Set(photographs.map(p=>p.identity)).size).toBe(photographs.length);
  for(const p of photographs){
   const bytes=readFileSync(new URL('../public'+p.asset,import.meta.url));expect(bytes.length).toBe(p.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(p.sha256);
   expect(bytes[0]).toBe(255);expect(bytes[1]).toBe(216);expect(p.bytes).toBeLessThanOrEqual(PHOTO_MAX_BYTES);expect(p.width*p.height*4).toBeLessThanOrEqual(PHOTO_MAX_DECODED);
   expect(p.credit.length).toBeGreaterThan(2);expect(p.license).toBe('https://creativecommons.org/licenses/by/4.0/');expect(p.source).toMatch(/^https:\/\//);expect(p.rights).toMatch(/^https:\/\//);
  }
 });
 it('matches supported route targets without treating a catalog name or nearby row number as an identity',()=>{
  for(const stop of tours.find(t=>t.key==='road-trip')!.stops){
   const photos=photosForStop(stop);
   if(stop.target.kind==='overview'){expect(photos).toEqual([]);continue}
   expect(photos.length,stop.id).toBeGreaterThan(0);
   if(stop.target.kind==='catalog')expect(photos[0].identity).toBe(names.find(n=>n.name===stop.target.name)!.targetId);
   if(stop.target.kind==='nearby'&&stop.id!=='andromeda-companions')expect(photos[0].identity).toBe(`nearby:${nearbyReference.entries.find(e=>e.key===stop.target.key)!.key}`);
  }
  expect(photosForIdentity('unverified-name')).toEqual([]);expect(photosForIdentity('core')[0].note).toContain('inside the Milky Way');
  expect(photosForStop(tours[1].stops.find(s=>s.id==='andromeda-companions')!).map(p=>p.identity)).toEqual(['nearby:m32','nearby:m110']);
 });
 it('offers framing only for the checked north-up TAN cutout and preserves the exact identity',()=>{
  const photo=photographs.find(p=>p.key==='ngc4026')!;expect(photographs.filter(p=>p.match)).toHaveLength(1);
  expect(photo.match!.cdDegPerPixel).toEqual([-0.000173611111111111,0,0,0.000173611111111111]);expect(photo.fovArcmin).toEqual([8,8]);
  const state={target:[0,0,20] as [number,number,number],camera:[0,0,21] as [number,number,number],identity:{node:'512',row:1,targetId:photo.identity}},view=matchedPhotoView(photo,state,50)!;
  expect(view.identity).toBe(state.identity);expect(view.target).toEqual(state.target);expect(view.camera[2]).toBeLessThan(20);
  const span=2*(20-view.camera[2])*Math.tan(25*Math.PI/180);expect(span).toBeCloseTo(40*Math.tan(4/60*Math.PI/180),12);
  expect(matchedPhotoView(photo,{...state,identity:null},50)).toBeNull();expect(matchedPhotoView(photographs[0],state,50)).toBeNull();
 });
});
