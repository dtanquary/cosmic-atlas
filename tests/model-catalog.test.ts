import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {decodeModel,type ModelManifest,type ProfileChunk} from '../src/model-catalog';
import {ResolvedGalaxy,galaxyRadius,irregularSamples,type GalaxyFamily,type GalaxyDetailData} from '../src/galaxy-detail';
import {validateBinary} from '../src/format';

const manifest:ModelManifest=JSON.parse(readFileSync(new URL('../public/data/models/manifest.json',import.meta.url),'utf8'));
const original:GalaxyDetailData=JSON.parse(readFileSync(new URL('../public/data/galaxy-spiral.json',import.meta.url),'utf8'));
function chunk(type:number,family=0,e1=.4):ProfileChunk{
 const buffer=new ArrayBuffer(36),view=new DataView(buffer);view.setUint32(0,0x43415331,true);view.setUint32(4,1,true);view.setUint32(8,1,true);
 for(const [i,value] of [20,e1,.1,1.4].entries())view.setFloat32(16+i*4,value,true);
 view.setUint32(32,type|(family<<8),true);return {buffer,values:new Float32Array(buffer,16),flags:new Uint32Array(buffer,16),used:0};
}
describe('Catalog-wide models',()=>{
 it('does not treat an imaging-fit type as a visual galaxy classification',()=>{
  const disk=decodeModel(manifest,chunk(3),0,original.galaxy),round=decodeModel(manifest,chunk(2),0,original.galaxy),spheroid=decodeModel(manifest,chunk(4),0,original.galaxy);
  for(const model of [disk,round,spheroid]){expect(model.model?.typeSource).toBe('proxy');expect(model.model?.shapeMeasured).toBe(true)}
  expect(disk.model?.family).toBe('spiral');expect(round.model?.family).toBe('lenticular');expect(spheroid.model?.family).toBe('elliptical');
  expect(galaxyRadius(disk.galaxy.distance,disk.shape.radiusArcsec)).toBeCloseTo(galaxyRadius(original.galaxy.distance,20),12);
 });
 it('uses the explicit visual classification ahead of the imaging profile',()=>{
  const families:GalaxyFamily[]=['spiral','barred','elliptical','lenticular','irregular'];
  families.forEach((family,i)=>{
   const data=decodeModel(manifest,chunk(4,i+1,.85),0,original.galaxy);expect(data.model?.family).toBe(family);expect(data.model?.typeSource).toBe('catalog');
   const model=new ResolvedGalaxy(data),f=model.frame;
   // Very flat catalog ellipses still admit a thinner assumed 3D model.
   const covariance=(axis:typeof f.major)=>f.major.dot(axis)**2+f.minor.dot(axis)**2+f.thickness**2*f.normal.dot(axis)**2;
   const major=f.north.clone().multiplyScalar(Math.cos(f.positionAngle*Math.PI/180)).addScaledVector(f.east,Math.sin(f.positionAngle*Math.PI/180));
   const minor=f.east.clone().multiplyScalar(Math.cos(f.positionAngle*Math.PI/180)).addScaledVector(f.north,-Math.sin(f.positionAngle*Math.PI/180));
   expect(covariance(major)).toBeCloseTo(1,10);expect(covariance(minor)).toBeCloseTo(f.q**2,10);
   expect(model.memoryBytes).toBeLessThan(2*1048576);model.dispose();
  });
 });
 it('marks unresolved sizes and orientation as assumptions, even if PSF fields contain numbers',()=>{
  const data=decodeModel(manifest,chunk(1),0,original.galaxy);
  expect(data.model?.shapeMeasured).toBe(false);expect(data.model?.typeSource).toBe('proxy');expect(data.shape.e1).toBe(0);expect(data.shape.e2).toBe(0);
  expect(galaxyRadius(data.galaxy.distance,data.shape.radiusArcsec)).toBeCloseTo(.005,12);
  const invalid=chunk(5);invalid.values[0]=NaN;expect(decodeModel(manifest,invalid,0,original.galaxy).model?.shapeMeasured).toBe(false);
 });
 it('rejects incorrect profile formats and row references',()=>{
  const profiles=chunk(5);expect(validateBinary(profiles.buffer,'profiles',1)).toBe(1);
  expect(()=>validateBinary(profiles.buffer,'metadata',1)).toThrow();expect(()=>decodeModel(manifest,profiles,1,original.galaxy)).toThrow();
  expect(()=>validateBinary(profiles.buffer.slice(0,35),'profiles',1)).toThrow();
 });
 it('has reproducible, bounded irregular light clumps',()=>{
  const a=irregularSamples(3738,4000),b=irregularSamples(3738,4000),other=irregularSamples(3739,4000);
  expect(a.positions).toEqual(b.positions);expect(a.positions).not.toEqual(other.positions);
  let thickness=0;for(let i=0;i<a.positions.length;i+=3){expect(Math.hypot(...a.positions.slice(i,i+3))).toBeLessThanOrEqual(4.501);thickness+=a.positions[i+2]**2}
  expect(Math.sqrt(thickness/4000)).toBeGreaterThan(.15);
 });
});
