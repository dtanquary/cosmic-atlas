import {it,expect} from 'vitest';
import {ResolvedGalaxy, type GalaxyFamily} from '../src/galaxy-detail';
import {nearbyDetails} from '../src/nearby-galaxies';

it('uses bounded spiral geometry for every family without rewriting source identities or projected measurements',()=>{
 const original=nearbyDetails()[0],source={...original,galaxy:{...original.galaxy,targetId:'unmatched:appearance-test'}};
 for(const family of ['spiral','barred','elliptical','lenticular','irregular'] as GalaxyFamily[]){
  const data={...source,spiral:undefined,model:{...source.model!,family}};
  const before=JSON.stringify(data),catalog=new ResolvedGalaxy(data,'catalog'),spiral=new ResolvedGalaxy(data,'spiral');
  try{
   expect(spiral.appearance).toBe('spiral');expect(spiral.memoryBytes).toBe(12000*7*4*2);
   expect(spiral.data).toBe(data);expect(JSON.stringify(data)).toBe(before);
   expect(spiral.center.toArray()).toEqual(catalog.center.toArray());expect(spiral.radius).toBe(catalog.radius);
   expect(spiral.frame.q).toBe(catalog.frame.q);expect(spiral.frame.positionAngle).toBe(catalog.frame.positionAngle);
   const f=spiral.frame;
   // Project the disk covariance back onto the sky, independent of its chosen depth.
   const minor=f.east.clone().multiplyScalar(Math.cos(f.positionAngle*Math.PI/180)).addScaledVector(f.north,-Math.sin(f.positionAngle*Math.PI/180));
   expect(Math.hypot(f.major.dot(minor),f.minor.dot(minor),f.thickness*f.normal.dot(minor))).toBeCloseTo(f.q,12);
  }finally{catalog.dispose();spiral.dispose()}
 }
});
