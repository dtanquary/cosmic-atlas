import {describe,it,expect} from 'vitest';
import {encodeView,decodeView,type ViewState} from '../src/view-link';

const desi={id:1234567,node:'42',row:815,targetId:'39627670392150409'};
const states:ViewState[]=[
  {target:[0,0,0],camera:[0,0,.06],identity:'sun'},
  {target:[-8.2e-3,0,0],camera:[-8.2e-3,.04,.03],identity:'core'},
  {target:[.785,0,.1],camera:[.8,-.2,.3],identity:'nearby:m31'},
  {target:[4800,-1200,300],camera:[4800+1.2345678901e-5,-1200-2.3456789012e-5,300+3.4567890123e-5],identity:desi},
  {target:[1,2,3],camera:[100,200,300],identity:null},
];

describe('view links',()=>{
  it('round-trips every identity kind and keeps tiny camera offsets far from the origin',()=>{
    for(const state of states){
      const decoded=decodeView(encodeView(state));
      expect(decoded).not.toBeNull();
      expect(decoded!.identity).toEqual(state.identity);
      for(let i=0;i<3;i++){
        expect(Math.abs(decoded!.target[i]-state.target[i])).toBeLessThanOrEqual(Math.abs(state.target[i])*1e-11);
        const offset=state.camera[i]-state.target[i];
        expect(Math.abs(decoded!.camera[i]-decoded!.target[i]-offset)).toBeLessThanOrEqual(Math.abs(offset)*1e-9);
      }
    }
  });
  it('writes the documented grammar with relative camera and no g for a null identity',()=>{
    expect(encodeView(states[0])).toBe('#t=0,0,0&c=0,0,0.06&g=sun');
    expect(encodeView(states[4])).toBe('#t=1,2,3&c=99,198,297');
    expect(encodeView(states[3])).toMatch(/^#t=4800,-1200,300&c=0\.00001\d{7,11},-0\.00002\d{7,11},0\.00003\d{7,11}&g=desi:1234567:42:815:39627670392150409$/);
  });
  it('keeps 64-bit target ids as exact strings',()=>{
    for(const targetId of ['39627670392150409','12345678901234567890','-39627670392150409']){
      const identity=decodeView(`#t=1,2,3&c=4,5,6&g=desi:1:2:3:${targetId}`)!.identity as typeof desi;
      expect(typeof identity.targetId).toBe('string');
      expect(identity.targetId).toBe(targetId);
    }
    expect(decodeView('#t=1,2,3&c=4,5,6&g=desi:1:2:3:123456789012345678901')).toBeNull();
  });
  it('rejects anything outside the grammar and ignores unknown or duplicate keys',()=>{
    for(const hash of ['','#','#c=1,2,3','#t=1,2&c=1,2,3','#t=1,2,3&c=1,2','#t=1,NaN,3&c=1,2,3','#t=1,2,3&c=Infinity,2,3','#t=1e7,2,3&c=1,2,3',
      '#t=1,2,3&c=1,2,3,4','#t=1,,3&c=1,2,3','#t=0x10,2,3&c=1,2,3','#t=1,2,3&c=1,2,3&g=desi:1:2:3','#t=1,2,3&c=1,2,3&g=desi:1:2:3:abc',
      '#t=1,2,3&c=1,2,3&g=desi:1:2:-3:4','#t=1,2,3&c=1,2,3&g=desi:12345678901:2:3:4','#t=1,2,3&c=1,2,3&g=nearby:M31','#t=1,2,3&c=1,2,3&g=milkyway','#t=1,2,3&c=1,2,3&g='])
      expect(decodeView(hash),hash).toBeNull();
    expect(decodeView('#x=9&t=1,2,3&c=1,2,3&t=7,8,9')).toEqual({target:[1,2,3],camera:[2,4,6],identity:null});
    expect(decodeView('#t=-999999,2e-7,3&c=999999,0,0&g=nearby:lmc')).toEqual({target:[-999999,2e-7,3],camera:[0,2e-7,3],identity:'nearby:lmc'});
  });
});
