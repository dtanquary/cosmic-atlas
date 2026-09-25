import {it,expect} from 'vitest';
import {lookDisc,lookSeed} from '../src/galaxy-looks';

it('puts the smooth disc half-light radius at the adopted catalog radius',()=>{
 const {scale,fadeStart,fadeEnd,unitsPerRe}=lookDisc,steps=200000;
 const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
 let total=0;const cumulative:number[]=[];
 for(let i=0;i<steps;i++){const r=(i+.5)/steps*fadeEnd;total+=Math.exp(-r/scale)*smooth(fadeEnd,fadeStart,r)*r;cumulative.push(total)}
 const half=(cumulative.findIndex(value=>value>=total/2)+.5)/steps*fadeEnd;
 expect(half/unitsPerRe).toBeCloseTo(1,3);
});

it('seeds structure from the exact public identity only',()=>{
 expect(lookSeed('39633325333155389')).toEqual(lookSeed('39633325333155389'));
 expect(lookSeed('39633325333155389')).not.toEqual(lookSeed('39633325333155388'));
 for(const value of lookSeed('nearby:m31')){expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThan(100)}
});
