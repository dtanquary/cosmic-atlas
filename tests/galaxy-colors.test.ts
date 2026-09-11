import {it,expect} from 'vitest';
import {galaxyColors} from '../src/galaxy-colors';
import {spiralSamples,irregularSamples} from '../src/galaxy-detail';

const luminance=(rgb:number[])=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;

it('keeps repeatable, restrained palettes with equal brightness across galaxy identities',()=>{
 const palettes=Array.from({length:256},(_,i)=>galaxyColors(`desi-test:${i}`));
 expect(galaxyColors('nearby:m31')).toEqual(galaxyColors('nearby:m31'));
 expect(galaxyColors('nearby:m31')).not.toEqual(galaxyColors('nearby:m33'));
 for(const palette of palettes){
  expect(luminance(palette.disk)).toBeCloseTo(.69,12);expect(luminance(palette.core)).toBeCloseTo(.88,12);
  for(const color of [palette.disk,palette.core,palette.emission])for(const channel of color){expect(channel).toBeGreaterThan(0);expect(channel).toBeLessThanOrEqual(1)}
  expect(palette.core[0]/palette.core[2]).toBeGreaterThan(palette.disk[0]/palette.disk[2]);
 }
 const ratios=palettes.map(p=>p.disk[0]/p.disk[2]);
 expect(Math.min(...ratios)).toBeLessThan(.75);expect(Math.max(...ratios)).toBeGreaterThan(1.05);
});

it('changes arm and clump colors without moving light samples or changing their sizes',()=>{
 const a=galaxyColors('nearby:m31'),b=galaxyColors('nearby:m33'),parameters={seed:123,arms:2,pitchDegrees:20,phaseRadians:.4};
 for(const samples of [(palette:typeof a)=>spiralSamples(parameters,1200,palette),(palette:typeof a)=>irregularSamples(123,1200,palette)]){
  const first=samples(a),second=samples(b);
  expect(first.positions).toEqual(second.positions);expect(first.sizes).toEqual(second.sizes);
  expect(first.colors).not.toEqual(second.colors);expect(samples(a).colors).toEqual(first.colors);
 }
});
