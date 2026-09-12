import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {interpolatePose,cameraFromPose,type Pose} from '../src/travel';

const pose=(target:[number,number,number],distance:number,direction:[number,number,number]):Pose=>({target:new THREE.Vector3(...target),distance,direction:new THREE.Vector3(...direction).normalize()});
const samples=Array.from({length:11},(_,i)=>i/10);
const rel=(a:number,b:number)=>Math.abs(a-b)/Math.abs(b);

describe('interpolatePose',()=>{
  const from=pose([1,2,3],.003,[1,0,0]),to=pose([-4,7,9],30000,[0,0,1]);
  it('reproduces both endpoints exactly',()=>{
    for(const [s,end] of [[0,from],[1,to]] as const){
      const p=interpolatePose(from,to,s);
      expect(p.target.distanceTo(end.target)).toBeLessThan(1e-12);
      expect(rel(p.distance,end.distance)).toBeLessThan(1e-12);
      expect(p.direction.distanceTo(end.direction)).toBeLessThan(1e-12);
    }
  });
  it('eases the target with smoothstep, monotonically',()=>{
    const a=pose([0,0,0],1,[0,0,1]),b=pose([1,0,0],1,[0,0,1]);
    const xs=samples.map(s=>interpolatePose(a,b,s).target.x);
    for(let i=1;i<xs.length;i++)expect(xs[i]).toBeGreaterThan(xs[i-1]);
    expect(xs[5]).toBeCloseTo(.5,12);
    expect(interpolatePose(a,b,.25).target.x).toBeCloseTo(.15625,12);
  });
  it('interpolates distance in log space when the target does not move',()=>{
    const a=pose([5,5,5],.003,[0,0,1]),b=pose([5,5,5],30000,[0,0,1]);
    expect(rel(interpolatePose(a,b,.5).distance,Math.sqrt(.003*30000))).toBeLessThan(1e-9);
  });
  it('hops high enough at the apex to see both endpoints at fov 50°, also when writing into from',()=>{
    const a=pose([0,0,0],.01,[0,0,1]),b=pose([10,0,0],.01,[0,0,1]);
    const apex=interpolatePose(a,b,.5).distance;
    expect(apex).toBeGreaterThanOrEqual(5/Math.tan(25*Math.PI/180));
    expect(Math.abs(apex-13.01)).toBeLessThan(1e-9);
    const aliased=interpolatePose(a,b,.5,a);
    expect(aliased).toBe(a);
    expect(Math.abs(aliased.distance-13.01)).toBeLessThan(1e-9);
    expect(aliased.target.x).toBeCloseTo(5,12);
  });
  it('clamps s outside [0,1] to the endpoints',()=>{
    expect(interpolatePose(from,to,-.5).target.distanceTo(from.target)).toBe(0);
    expect(interpolatePose(from,to,1.5).target.distanceTo(to.target)).toBe(0);
    expect(rel(interpolatePose(from,to,7).distance,to.distance)).toBeLessThan(1e-12);
  });
  it('slerps the direction along the great circle at constant angular speed',()=>{
    const a=pose([0,0,0],1,[1,0,0]),b=pose([0,0,0],1,[0,1,0]);
    for(const s of samples){
      const p=interpolatePose(a,b,s),e=s*s*(3-2*s);
      expect(Math.abs(p.direction.length()-1)).toBeLessThan(1e-12);
      expect(Math.abs(p.direction.angleTo(a.direction)-e*Math.PI/2)).toBeLessThan(1e-12);
    }
    expect(interpolatePose(a,b,.5).direction.distanceTo(new THREE.Vector3(1,1,0).normalize())).toBeLessThan(1e-12);
  });
  it('handles antiparallel directions without collapsing and reaches the destination',()=>{
    for(const axis of [[0,0,1],[1,0,0],[0,1,0],[.3,-.4,.5]] as const){
      const a=pose([0,0,0],1,[...axis]),b=pose([0,0,0],1,[-axis[0],-axis[1],-axis[2]]);
      for(const s of samples)expect(Math.abs(interpolatePose(a,b,s).direction.length()-1)).toBeLessThan(1e-12);
      expect(interpolatePose(a,b,1).direction.distanceTo(b.direction)).toBeLessThan(1e-12);
      expect(interpolatePose(a,b,.5).direction.dot(a.direction)).toBeLessThan(1e-12);
    }
  });
  it('writes into a provided pose and derives the camera position',()=>{
    const out=pose([0,0,0],0,[0,0,1]);
    expect(interpolatePose(from,to,.3,out)).toBe(out);
    const camera=cameraFromPose(out);
    expect(camera.distanceTo(out.target.clone().addScaledVector(out.direction,out.distance))).toBeLessThan(1e-12);
    expect(cameraFromPose(pose([1,2,3],4,[0,0,1])).toArray()).toEqual([1,2,7]);
  });
});
