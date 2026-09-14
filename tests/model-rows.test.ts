import {describe,it,expect,vi} from 'vitest';
import {ModelRows} from '../src/model-rows';
describe('bounded point-to-model row lookup',()=>{
 it('preserves rows and absent identities while avoiding repeated full-chunk scans',()=>{
  const ids=new Uint32Array([42,14140374,17,0]),scan=vi.spyOn(ids,'indexOf'),lookup=new ModelRows(3);
  expect(lookup.resolve(ids,[17,14140374,999])).toEqual([2,1,-1]);expect(scan).toHaveBeenCalledTimes(3);
  expect(lookup.resolve(ids,[999,17,14140374])).toEqual([-1,2,1]);expect(scan).toHaveBeenCalledTimes(3);
  expect(lookup.resolve(ids,[42,17,14140374])).toEqual([0,2,1]);expect(scan).toHaveBeenCalledTimes(4);
  expect(lookup.resolve(ids,[42,17,14140374])).toEqual([0,2,1]);expect(scan).toHaveBeenCalledTimes(4);
  expect(lookup.memoryBytes).toBe(24);
 });
 it('recycles only retired identities and treats a newly loaded chunk independently',()=>{
  const ids=new Uint32Array([42,0,17]),lookup=new ModelRows(2);
  for(let n=0;n<50;n++){expect(lookup.resolve(ids,[n,42])).toEqual([ids.indexOf(n),0]);expect(lookup.memoryBytes).toBe(16)}
  expect(new ModelRows(2).resolve(new Uint32Array([17,42,0]),[42,0])).toEqual([1,2]);
  expect(()=>lookup.resolve(ids,[1,2,3])).toThrow(/limit/);
 });
});
