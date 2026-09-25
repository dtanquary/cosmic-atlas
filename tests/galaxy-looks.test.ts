import {it,expect} from 'vitest';
import {catalogLook,catalogLookLabels,galaxyLooks,lookAppearance,lookDisc,lookSeed} from '../src/galaxy-looks';
import {galaxyColors} from '../src/galaxy-colors';
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

it('chooses catalog looks from recorded Hubble types, bars first',()=>{
 const cases:[string,string][]=[['Sa','tight'],['Sab','tight'],['Sb','grand'],['Sbc','multi'],['Sc','multi'],['Scd','flocculent'],['Sd','flocculent'],['Sm','flocculent'],
  ['SABa','weakBar'],['SABc','weakBar'],['SBa','barred'],['SBbc','barred'],['SBm','barred']];
 for(const [type,key] of cases)expect(catalogLook('any-identity',type)).toEqual({key,fromType:true});
 for(const type of ['S?','E','S0',undefined])expect(catalogLook('any-identity',type).fromType).toBe(false);
});

it('spreads untyped galaxies over every catalog look by exact identity',()=>{
 const seen=new Set(Array.from({length:512},(_,i)=>catalogLook(`look-test:${i}`).key));
 expect([...seen].sort()).toEqual(Object.keys(catalogLookLabels).sort());
 expect(catalogLook('39633325333155390')).toEqual(catalogLook('39633325333155390'));
});

it('turns, mirrors and tints catalog looks by identity at fixed luminance, leaving named looks tuned',()=>{
 const lum=(c:number[])=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
 const a=lookAppearance('grand','look-test:a',galaxyColors('look-test:a')),b=lookAppearance('grand','look-test:b',galaxyColors('look-test:b'));
 expect(a.phase).not.toBe(b.phase);
 for(const key of ['disc','young'] as const){expect(lum(a[key])).toBeCloseTo(lum(galaxyLooks.grand[key]),6);expect(a[key]).not.toEqual(b[key])}
 expect(a.core).toEqual(galaxyLooks.grand.core);
 const spins=new Set(Array.from({length:64},(_,i)=>lookAppearance('barred',`look-test:${i}`).spin));expect(spins).toEqual(new Set([1,-1]));
 const named=lookAppearance('milkyWay','milky-way');expect(named.spin).toBe(-1);expect(named.disc).toEqual(galaxyLooks.milkyWay.disc);
});
