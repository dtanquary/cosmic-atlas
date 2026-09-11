import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {MilkyWay,milkyWayReference as reference} from '../src/milky-way';

describe('Milky Way reference model',()=>{
 it('places the observer at the Sun, using the pinned Galactocentric coordinates',()=>{
  const model=new MilkyWay(),sun=model.center.clone().negate(),{major,minor,normal}=model.frame;
  expect(model.center.length()).toBeCloseTo(.008122,14);
  expect(sun.dot(major)).toBeCloseTo(-Math.sqrt(.008122**2-.0000208**2),14);
  expect(sun.dot(minor)).toBeCloseTo(0,14);
  expect(sun.dot(normal)).toBeCloseTo(.0000208,14);
  expect((THREE.MathUtils.radToDeg(Math.atan2(model.center.y,model.center.x))+360)%360).toBeCloseTo(266.4051,9);
  expect(THREE.MathUtils.radToDeg(Math.asin(model.center.z/model.center.length()))).toBeCloseTo(-28.936175,9);
  expect(new THREE.Vector3().crossVectors(major,minor).dot(normal)).toBeCloseTo(1,12);
  for(const axis of [major,minor,normal])expect(axis.length()).toBeCloseTo(1,12);
  model.dispose();
 });
 it('shows the whole galaxy and observer in the arrival view, with bounded allocations',()=>{
  const model=new MilkyWay(),camera=new THREE.PerspectiveCamera(50,1,.000001,100000);
  camera.up.set(0,0,1);camera.position.copy(model.approachDirection).multiplyScalar(.06);camera.lookAt(0,0,0);camera.updateMatrixWorld();model.update(camera,900,1,true);
  const projected=model.center.clone().project(camera);
  expect(Math.abs(projected.x)).toBeLessThan(.6);expect(Math.abs(projected.y)).toBeLessThan(.6);
  expect(model.visible).toBe(true);expect(model.blend.value).toBe(1);
  expect(model.memoryBytes).toBeLessThan(2*1048576);
  expect('data' in model).toBe(false); // No fabricated DESI ID or redshift.
  model.dispose();
 });
 it('supports a solar-position view without allowing incidental foreground obstruction',()=>{
  const model=new MilkyWay(),camera=new THREE.PerspectiveCamera(50,1,.0000001,100000);
  camera.position.set(0,0,0);camera.lookAt(model.center);camera.updateMatrixWorld();
  model.update(camera,900,1,true);expect(model.visible).toBe(true);expect(model.blend.value).toBe(1);
  model.update(camera,900,1,false);expect(model.visible).toBe(false);
  model.update(camera,900,1,true,'points');expect(model.visible).toBe(false);
  camera.position.copy(model.approachDirection).multiplyScalar(100);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  model.update(camera,900,1,true);expect(model.visible).toBe(false);
  expect(reference.diskScaleMpc).toBe(.0026);model.dispose();
 });
});
