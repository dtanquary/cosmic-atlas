import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {cartesian} from '../src/format';
import {galaxyFrame,galaxyRadius,detailBlend,ResolvedGalaxy,type GalaxyDetailData} from '../src/galaxy-detail';

const data:GalaxyDetailData=JSON.parse(readFileSync(new URL('../public/data/galaxy-detail.json',import.meta.url),'utf8'));

describe('Measured galaxy deprojection',()=>{
 it('recovers the Tractor sky covariance from the 3D oblate shape across sky positions',()=>{
  for(const [ra,dec] of [[0,0],[90,0],[270,80],[35,-90],[data.galaxy.ra,data.galaxy.dec]]){
   for(const [e1,e2] of [[.5,0],[0,.4],[0,-.4],[data.shape.e1,data.shape.e2]]){
    const f=galaxyFrame(ra,dec,e1,e2),theta=.5*Math.atan2(e2,e1);
    const covariance=(a:THREE.Vector3,b:THREE.Vector3)=>f.major.dot(a)*f.major.dot(b)+f.minor.dot(a)*f.minor.dot(b)+f.thickness**2*f.normal.dot(a)*f.normal.dot(b);
    // Independent 2D covariance from Tractor's documented getRaDecBasis columns.
    expect(covariance(f.east,f.east)).toBeCloseTo(Math.sin(theta)**2+f.q**2*Math.cos(theta)**2,12);
    expect(covariance(f.north,f.north)).toBeCloseTo(Math.cos(theta)**2+f.q**2*Math.sin(theta)**2,12);
    expect(covariance(f.east,f.north)).toBeCloseTo((1-f.q**2)*Math.sin(theta)*Math.cos(theta),12);
    expect(new THREE.Vector3().crossVectors(f.major,f.minor).dot(f.normal)).toBeCloseTo(1,12);
   }
  }
 });
 it('preserves the measured angular size in comoving coordinates',()=>{
  const radius=galaxyRadius(data.galaxy.distance,data.shape.radiusArcsec);
  expect(radius/data.galaxy.distance*180/Math.PI*3600).toBeCloseTo(data.shape.radiusArcsec,12);
  expect(radius/(1+data.galaxy.z)).toBeCloseTo(data.galaxy.distance/(1+data.galaxy.z)*data.shape.radiusArcsec*Math.PI/(180*3600),12);
  const expected=cartesian(data.galaxy.ra,data.galaxy.dec,data.galaxy.distance);
  data.galaxy.position.forEach((coordinate,i)=>expect(coordinate).toBeCloseTo(expected[i],12));
  expect(data.galaxy.targetId).toBe('39633263488141603');
 });
 it('retains half the fitted projected light within the measured effective radius',()=>{
  const total=data.gaussians.reduce((n,g)=>n+g.peak*g.sigmaRe**2,0);
  const enclosed=data.gaussians.reduce((n,g)=>n+g.peak*g.sigmaRe**2*(1-Math.exp(-.5/g.sigmaRe**2)),0);
  expect(enclosed/total).toBeCloseTo(.5,2);
  expect(data.fitMaxRelativeError).toBeLessThan(.001);
 });
 it('crossfades monotonically between the unresolved and fully resolved sizes',()=>{
  expect(detailBlend(0)).toBe(0);expect(detailBlend(1)).toBe(0);expect(detailBlend(8)).toBe(1);
  let previous=0;
  for(let pixels=0;pixels<12;pixels+=.1){const value=detailBlend(pixels);expect(value).toBeGreaterThanOrEqual(previous);previous=value}
 });
 it('selects the resolved body away from its center and remains finite inside it',()=>{
  const model=new ResolvedGalaxy(data),camera=new THREE.PerspectiveCamera(50,1,.0001,100000);
  camera.up.set(0,0,1);camera.position.copy(model.center).addScaledVector(model.frame.radial,-12*model.radius);camera.lookAt(model.center);camera.updateMatrixWorld();
  model.update(camera,900);expect(model.visible).toBe(true);expect(model.blend.value).toBe(1);
  const offset=model.center.clone().addScaledVector(model.frame.major,2*model.radius).project(camera);
  expect(model.hitTest(new THREE.Vector2(offset.x,offset.y),camera)).toBe(true);
  expect(model.hitTest(new THREE.Vector2(.9,.9),camera)).toBe(false);
  camera.position.copy(model.center);camera.updateMatrixWorld();model.update(camera,900);
  expect(model.visible).toBe(true);expect(model.hitTest(new THREE.Vector2(0,0),camera)).toBe(true);
  camera.position.copy(model.center).addScaledVector(model.frame.radial,-1000);camera.lookAt(model.center);camera.updateMatrixWorld();model.update(camera,900);
  expect(model.visible).toBe(false);expect(model.blend.value).toBe(0);model.dispose();
 });
});
