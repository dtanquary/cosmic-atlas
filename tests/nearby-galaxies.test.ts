import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createNearbyGalaxies,nearbyDetails,nearbyReference} from '../src/nearby-galaxies';
import {mergeNearbyNames,namedSuggestions} from '../src/galaxy-search';
import {uncertainLocalPosition} from '../src/local-distances';

describe('Independently measured nearby galaxies',()=>{
 it('retains cited local distances and separate identities without fabricated redshifts',()=>{
  const details=nearbyDetails();expect(details).toHaveLength(6);
  expect(new Set(details.map(d=>d.galaxy.id)).size).toBe(6);
  [.785,.809,.04959,.06244,10**((24.53+5)/5)/1e6,.824].forEach((distance,i)=>expect(details[i].galaxy.distance).toBeCloseTo(distance,13));
  for(const d of details){
   expect(d.galaxy.id).toBeLessThan(0);expect(d.galaxy.targetId).toMatch(/^nearby:/);expect(d.galaxy.z).toBeNull();
   expect(Math.hypot(...d.galaxy.position)).toBeCloseTo(d.galaxy.distance,13);
   expect(d.galaxy.nearby?.distanceSource).toMatch(/^https:\/\//);expect(uncertainLocalPosition(d.galaxy)).toBe(false);
   expect(uncertainLocalPosition({...d.galaxy,nearby:undefined})).toBe(true);
  }
  expect(details[0].galaxy.ra).toBeCloseTo(10.6845833333,8);expect(details[0].galaxy.dec).toBeCloseTo(41.2691666667,8);
 });
 it('reproduces the adopted projected ellipse with bounded geometry and explicit missing orientation',()=>{
  const models=createNearbyGalaxies();
  try{
   for(const [i,m] of models.entries()){
    const ref=nearbyReference.entries[i];
    expect(m.frame.q).toBeCloseTo(ref.axisRatio,12);
    if(ref.positionAngleDeg!==null)expect(m.frame.positionAngle).toBeCloseTo(ref.positionAngleDeg,10);
    const minorProjection=Math.hypot(m.frame.minor.dot(m.frame.north),m.frame.minor.dot(m.frame.east));
    const normalProjection=Math.hypot(m.frame.normal.dot(m.frame.north),m.frame.normal.dot(m.frame.east))*m.frame.thickness;
    expect(Math.hypot(minorProjection,normalProjection)).toBeCloseTo(ref.axisRatio,12);
    const camera=new THREE.PerspectiveCamera(50,1,.000001,100);
    camera.position.copy(m.center).addScaledVector(m.frame.radial,-m.radius*12);camera.lookAt(m.center);camera.updateMatrixWorld();m.update(camera,900,1,true);expect(m.visible).toBe(true);
   }
   expect(models.reduce((n,m)=>n+m.memoryBytes,0)).toBeLessThan(4*1048576);
   expect(models[2].data.galaxy.nearby?.orientationMeasured).toBe(false);
   expect(models[3].data.model?.shapeMeasured).toBe(false);
  }finally{models.forEach(m=>m.dispose())}
 });
 it('replaces unavailable aliases with one nearby destination, including in a bootstrap search',()=>{
  const entries=mergeNearbyNames([{name:'NGC 224',aliases:['M 31','Andromeda Galaxy']}]);
  expect(entries).toHaveLength(6);
  for(const q of ['M31','M 031','Messier 31','NGC224','Andromeda']){const hit=namedSuggestions(entries,q)[0];expect(hit.kind).toBe('nearby');expect(hit.id).toBe(-1)}
  for(const q of ['M33','LMC','SMC','M32','M110'])expect(namedSuggestions(entries,q)[0].kind).toBe('nearby');
  expect(namedSuggestions(entries,'').every(e=>e.kind==='observer'||e.kind==='nearby')).toBe(true);
 });
});
