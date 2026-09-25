import {it,expect} from 'vitest';
import {galaxyLooks,lookDisc,lookSeed} from '../src/galaxy-looks';
import reference from '../src/data/milky-way.json';

it('puts every look\'s smooth disc half-light radius at the adopted catalog radius',()=>{
 const {scale,fadeStart,fadeEnd}=lookDisc,steps=200000;
 const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
 for(const look of Object.values(galaxyLooks)){
  const outer=fadeEnd*look.extent;let total=0;const cumulative:number[]=[];
  for(let i=0;i<steps;i++){const r=(i+.5)/steps*outer;total+=Math.exp(-r/scale)*smooth(outer,fadeStart*look.extent,r)*r;cumulative.push(total)}
  const half=(cumulative.findIndex(value=>value>=total/2)+.5)/steps*outer;
  expect(half/look.unitsPerRe).toBeCloseTo(1,3);
 }
});

it('keeps the Milky Way bar length, angle and handedness from the sourced reference',()=>{
 const look=galaxyLooks.milkyWay;
 expect(look.bar).toBeCloseTo(reference.barHalfLengthMpc/reference.radiusMpc*look.unitsPerRe,4);
 expect(look.phaseDegrees).toBe(180-reference.barAngleDeg);
 // milky-way-light.ts winds its arms anticlockwise outward in the model frame; the look mirrors to match.
 expect(look.spin).toBe(-1);
});

it('seeds structure from the exact public identity only',()=>{
 expect(lookSeed('39633325333155389')).toEqual(lookSeed('39633325333155389'));
 expect(lookSeed('39633325333155389')).not.toEqual(lookSeed('39633325333155388'));
 for(const value of lookSeed('nearby:m31')){expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThan(100)}
});
