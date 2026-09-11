import {it,expect} from 'vitest';
import {galaxyVariants,galaxyVariant} from '../src/galaxy-variants';
import {galaxyColors} from '../src/galaxy-colors';
import {spiralSamples,spiralLight} from '../src/galaxy-detail';
import {nearbyDetails} from '../src/nearby-galaxies';

it('assigns every variant across stable identities without depending on the dataset row or source type',()=>{
 const source=nearbyDetails()[0],light=spiralLight(source);
 expect(spiralLight({...source,galaxy:{...source.galaxy,id:314}}).spiral).toEqual(light.spiral);
 expect(spiralLight({...source,model:{...source.model!,family:'elliptical'}}).spiral).toEqual(light.spiral);
 const keys=new Set(Array.from({length:256},(_,i)=>galaxyVariant(`variant-test:${i}`).variant.key));
 expect(keys.size).toBe(galaxyVariants.length);
 for(const variant of galaxyVariants)expect(keys.has(variant.key)).toBe(true);
});

it('redistributes spiral structure without enlarging, thickening or increasing its light budget',()=>{
 const common={seed:171,phaseRadians:.5},palette=galaxyColors('nearby:m31');
 const base=spiralSamples({...galaxyVariants[0],...common},12000,palette);
 for(const variant of galaxyVariants.slice(1)){
  const samples=spiralSamples({...variant,...common},12000,palette);
  expect(samples.positions).not.toEqual(base.positions);
  expect(samples.sizes).toEqual(base.sizes);
  for(let i=0;i<samples.sizes.length;i++){
   const j=i*3,r=Math.hypot(samples.positions[j],samples.positions[j+1]);
   expect(r).toBeCloseTo(Math.hypot(base.positions[j],base.positions[j+1]),5);
   expect(r).toBeLessThanOrEqual(4.500001);
   expect(samples.positions[j+2]).toBe(base.positions[j+2]);
   for(let c=0;c<3;c++)expect(samples.colors[j+c]).toBeCloseTo(base.colors[j+c],6);
  }
 }
});

it('keeps a common smooth profile, exposure and sample budget for all assigned variants',()=>{
 const source=nearbyDetails()[0],base=spiralLight(source),seen=new Set<string>();
 for(let i=0;i<256;i++){
  const targetId=`variant-test:${i}`,recipe=galaxyVariant(targetId);
  if(seen.has(recipe.variant.key))continue;
  seen.add(recipe.variant.key);
  const light=spiralLight({...source,galaxy:{...source.galaxy,targetId}});
  expect(light.family).toBe('spiral');expect(light.gaussians).toBe(base.gaussians);
  expect(light.exposure).toBe(.55);expect(light.knotCount).toBe(base.knotCount);
  expect(light.spiral?.bar).toBeUndefined(); // The bright concentrated-bar recipe is not used.
 }
 expect(seen.size).toBe(galaxyVariants.length);
});
