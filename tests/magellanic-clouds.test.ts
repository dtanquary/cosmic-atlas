import {it,expect} from 'vitest';
import * as THREE from 'three';
import {cloudDensityField,cloudLightSamples,CLOUD_FIELD_SIZE} from '../src/magellanic-clouds';
import {nearbyDetails} from '../src/nearby-galaxies';
import {ResolvedGalaxy} from '../src/galaxy-detail';

it('builds two distinct, deterministic bounded cloud fields with empty boundaries',()=>{
 const size=CLOUD_FIELD_SIZE,lmc=cloudDensityField('lmc'),smc=cloudDensityField('smc');
 expect(lmc).toEqual(cloudDensityField('lmc'));expect(smc).not.toEqual(lmc);
 for(const field of [lmc,smc]){
  expect(field.byteLength).toBe(48**3*2);
  let light=0,dust=0;
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const i=((z*size+y)*size+x)*2;light+=field[i];dust+=field[i+1];
   if([x,y,z].some(v=>v===0||v===size-1)){expect(field[i]).toBe(0);expect(field[i+1]).toBe(0)}
  }
  expect(light).toBeGreaterThan(100000);expect(dust).toBeGreaterThan(10000);
 }
 const samples=cloudLightSamples('lmc',lmc);
 expect(samples).toEqual(cloudLightSamples('lmc',lmc));
 expect(samples.sizes.length).toBe(4096);
 for(let i=0;i<samples.sizes.length;i++){
  expect(Math.hypot(...samples.positions.subarray(i*3,i*3+3))).toBeLessThan(4.5);
  expect(samples.sizes[i]).toBeGreaterThan(.02);expect(samples.sizes[i]).toBeLessThan(.06);
 }
});

it('keeps cloud identities, adopted geometry, visibility, selection and allocations through appearance changes',()=>{
 const sources=nearbyDetails().filter(data=>data.cloud);
 expect(sources.map(d=>d.galaxy.targetId)).toEqual(['nearby:lmc','nearby:smc']);
 for(const data of sources){
  const before=JSON.stringify(data),a=new ResolvedGalaxy(data,'spiral'),b=new ResolvedGalaxy({...data,galaxy:{...data.galaxy,id:-123}},'catalog');
  try{
   expect(JSON.stringify(data)).toBe(before);expect(a.center.toArray()).toEqual(b.center.toArray());expect(a.radius).toBe(b.radius);expect(a.frame.q).toBe(b.frame.q);
   const geometry=(m:ResolvedGalaxy)=>(m.scene.children[1] as THREE.Points).geometry;
   expect(geometry(a).getAttribute('position').array).toEqual(geometry(b).getAttribute('position').array);
   expect(a.memoryBytes).toBeLessThanOrEqual(12000*7*4*2);
   const camera=new THREE.PerspectiveCamera(50,1,1e-8,100);
   camera.position.copy(a.center).addScaledVector(a.frame.normal,12*a.radius);camera.lookAt(a.center);camera.updateMatrixWorld();
   a.update(camera,900,1,true);expect(a.visible).toBe(true);expect(a.hitTest(new THREE.Vector2(),camera)).toBe(true);
   a.update(camera,900,1,true,'automatic',.4);expect(a.blend.value).toBe(.4);
   a.update(camera,900,1,true,'points');expect(a.visible).toBe(false);expect(a.hitTest(new THREE.Vector2(),camera)).toBe(false);
   camera.position.copy(a.center);a.update(camera,900);expect(a.visible).toBe(false);
  }finally{a.dispose();b.dispose()}
 }
});
