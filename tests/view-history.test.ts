import {describe,expect,it} from 'vitest';
import {ViewHistory} from '../src/view-history';
import type {ViewState} from '../src/view-link';
const view=(x:number):ViewState=>({target:[x,0,0],camera:[x,0,1],identity:'nearby:m31'});
describe('deliberate view history',()=>{
 it('restores copied camera and exact public identity without remembering live mutations',()=>{
  const history=new ViewHistory(),original=view(1);original.identity={node:'512',row:20296,targetId:'39633325333155389'};
  history.remember(original);original.target[0]=42;original.identity.targetId='1';
  expect(history.back(view(2))).toEqual({target:[1,0,0],camera:[1,0,1],identity:{node:'512',row:20296,targetId:'39633325333155389'}});
  expect(history.available(view(2))).toBe(false);
 });
 it('skips the current pose and duplicate entries and retains only a bounded past',()=>{
  const history=new ViewHistory(2);history.remember(view(0));history.remember(view(1));history.remember(view(1));history.remember(view(2));
  expect(history.available(view(2))).toBe(true);expect(history.back(view(2))).toEqual(view(1));
  expect(history.back(view(1))).toBeNull();
 });
 it('ignores a view outside the share grammar and does not expose a no-op Back',()=>{
  const history=new ViewHistory();history.remember(view(Infinity));expect(history.available(view(0))).toBe(false);
  history.remember(view(0));expect(history.available(view(0))).toBe(false);expect(history.back(view(0))).toBeNull();
 });
});
