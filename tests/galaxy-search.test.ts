import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {normalizeName,namedSuggestions,type NameIndex} from '../src/galaxy-search';
import type {GalaxyDetailData} from '../src/galaxy-detail';
const index:NameIndex=JSON.parse(readFileSync(new URL('../public/data/galaxy-search.json',import.meta.url),'utf8'));
const spiral:GalaxyDetailData=JSON.parse(readFileSync(new URL('../public/data/galaxy-spiral.json',import.meta.url),'utf8'));

describe('Named galaxy visits',()=>{
 it('recognizes spacing, case, zero padding and Messier aliases',()=>{
  for(const name of ['NGC3982','ngc 03982','NGC 3982'])expect(namedSuggestions(index.entries,name)[0].id).toBe(spiral.galaxy.id);
  for(const name of ['m109','M 0109','Messier 109'])expect(namedSuggestions(index.entries,name)[0].name).toBe('NGC 3992');
  expect(normalizeName('PGC 037520')).toBe(normalizeName('pgc37520'));
 });
 it('offers only real destinations in the initial nearby suggestions',()=>{
  const suggestions=namedSuggestions(index.entries,'');expect(suggestions.length).toBeGreaterThan(3);
  expect(suggestions.every(s=>s.kind==='observer'||s.id!==undefined)).toBe(true);
  expect(suggestions.some(s=>s.id===spiral.galaxy.id)).toBe(true);
 });
 it('keeps unmatched famous names explicit and empty results empty',()=>{
  const andromeda=namedSuggestions(index.entries,'Andromeda');expect(andromeda[0]?.name).toBe('NGC 224');expect(andromeda[0]?.id).toBeUndefined();
  expect(namedSuggestions(index.entries,'no-galaxy-by-this-name')).toEqual([]);
 });
 it('preserves unique identities and complete visit references',()=>{
  const available=index.entries.filter(e=>e.id!==undefined);
  expect(available.length).toBe(index.matched);expect(new Set(available.map(e=>e.id)).size).toBe(available.length);
  for(const entry of available){expect(entry.targetId).toMatch(/^\d+$/);expect(entry.node).toMatch(/^\d+$/);expect(Number.isInteger(entry.row)).toBe(true);expect(entry.distance).toBeGreaterThan(0)}
 });
});
describe('NGC 3982 sidecar',()=>{
 it('keeps the exact identity and a tight smooth-profile fit',()=>{
  expect(spiral.galaxy.targetId).toBe('39633325333155389');expect(spiral.fitMaxRelativeError).toBeLessThan(.003);
 });
});
