import {describe,it,expect} from 'vitest';
import {cartesian,decodeGalaxy,formatDistance,separation,validateBinary,niceScale} from '../src/format';
import {chooseFrontier,coveredFrontier} from '../src/spatial';
import type {SpatialNode} from '../src/types';

describe('Scientific coordinate and identifier contracts',()=>{
 it('uses equatorial right-handed axes without distance compression',()=>{
  expect(cartesian(0,0,10)).toEqual([10,0,0]);
  expect(cartesian(90,0,10)[1]).toBeCloseTo(10,12);
  expect(cartesian(0,90,10)[2]).toBeCloseTo(10,12);
  expect(separation(cartesian(0,0,100),cartesian(180,0,100))).toBeCloseTo(200,12);
 });
 it('preserves signed 64-bit identifiers larger than JavaScript safe integers',()=>{
  const buffer=new ArrayBuffer(72),view=new DataView(buffer);
  view.setUint32(0,0x43414d31,true);view.setUint32(4,1,true);view.setUint32(8,1,true);
  view.setBigInt64(16,9007199254740993n,true);view.setFloat64(24,90,true);view.setFloat64(32,0,true);view.setFloat64(40,.2,true);view.setFloat64(48,.0001,true);view.setFloat64(56,800,true);
  const galaxy=decodeGalaxy(buffer,0,123);
  expect(galaxy.targetId).toBe('9007199254740993');expect(galaxy.position[1]).toBeCloseTo(800,10);
  view.setBigInt64(16,-9007199254740993n,true);expect(decodeGalaxy(buffer,0,123).targetId).toBe('-9007199254740993');
  expect(()=>decodeGalaxy(buffer,1,123)).toThrow('Invalid object reference');
 });
 it('rejects truncated, oversized and wrong-version chunks',()=>{
  const buffer=new ArrayBuffer(32),view=new DataView(buffer);
  view.setUint32(0,0x43415431,true);view.setUint32(4,1,true);view.setUint32(8,1,true);
  expect(validateBinary(buffer,'points',1)).toBe(1);
  expect(()=>validateBinary(buffer.slice(0,31),'points')).toThrow();
  view.setUint32(4,2,true);expect(()=>validateBinary(buffer,'points')).toThrow();
 });
 it('uses distance units without confusing light travel time',()=>{
  expect(formatDistance(1,'ly')).toBe('3.26 million ly');
  expect(formatDistance(1000,'ly')).toBe('3.26 billion ly');
  expect(formatDistance(0,'ly')).toBe('0 ly');
  expect(formatDistance(12.345,'Mpc')).toBe('12.3 Mpc');
  expect(formatDistance(NaN)).toBe('Unavailable');
  expect(niceScale(7.2)).toBe(5);
 });
});

function node(id:string,count:number,children:string[]=[]):SpatialNode{return {id,count,storedCount:children.length?2:count,children,center:[0,0,0],min:[-1,-1,-1],max:[1,1,1],points:{url:'',bytes:0,decodedBytes:0,sha256:''},metadata:{url:'',bytes:0,decodedBytes:0,sha256:''}}}
const nodes=new Map([node('0',8,['1','2']),node('1',4),node('2',4)].map(n=>[n.id,n]));
describe('Spatial coverage and detail completeness',()=>{
 it('limits adaptive detail while full mode keeps every visible leaf',()=>{
  const options={root:'0',nodes,visible:()=>true,projectedSize:()=>1000,budget:4};
  expect(chooseFrontier({...options,mode:'adaptive'})).toEqual(['0']);
  expect(chooseFrontier({...options,mode:'full'})).toEqual(['1','2']);
  expect(chooseFrontier({...options,budget:8,mode:'adaptive'})).toEqual(['1','2']);
 });
 it('uses a parent until all required children load, avoiding duplicate counts',()=>{
  const desired=new Set(['1','2']),required=new Set(['0','1','2']);
  expect(coveredFrontier('0',nodes,desired,required,id=>id!=='2')).toEqual(['0']);
  expect(coveredFrontier('0',nodes,desired,required,()=>true)).toEqual(['1','2']);
  expect(coveredFrontier('0',nodes,desired,required,()=>false)).toEqual([]);
 });
 it('culls unobserved camera directions without inventing replacement points',()=>{
  const result=chooseFrontier({root:'0',nodes,mode:'full',budget:0,visible:n=>n.id!=='2',projectedSize:()=>1000});
  expect(result).toEqual(['1']);
  expect(chooseFrontier({root:'0',nodes,mode:'full',budget:0,visible:()=>false,projectedSize:()=>1000})).toEqual([]);
 });
});
