import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {decodeFootprint,footprintUv,FOOTPRINT_HEIGHT,FOOTPRINT_WIDTH,type SurveyFootprintData} from '../src/survey-footprint';
import type {Manifest} from '../src/types';

const read=(name:string)=>JSON.parse(readFileSync(new URL(`../public/data/${name}`,import.meta.url),'utf8'));
const footprint:SurveyFootprintData=read('survey-footprint.json'),manifest:Manifest=read('dr1/manifest.json');
const cells=decodeFootprint(footprint,manifest);
const direction=(raDeg:number,decDeg:number)=>{const ra=raDeg*Math.PI/180,dec=decDeg*Math.PI/180;return {x:Math.cos(dec)*Math.cos(ra),y:Math.cos(dec)*Math.sin(ra),z:Math.sin(dec)}};
// The shader's sampling path: unit direction → (u,v) → nearest texel of the sidecar grid.
const cellAt=(raDeg:number,decDeg:number)=>{const [u,v]=footprintUv(direction(raDeg,decDeg));return cells[Math.floor(v*FOOTPRINT_HEIGHT)*FOOTPRINT_WIDTH+Math.floor(u*FOOTPRINT_WIDTH)]};

describe('survey footprint sidecar',()=>{
  it('decodes the 720×360 grid with the densest cell at row 182, column 299',()=>{
    expect(cells.length).toBe(FOOTPRINT_WIDTH*FOOTPRINT_HEIGHT);
    expect(cells[182*FOOTPRINT_WIDTH+299]).toBe(255);
    expect(cells.reduce((occupied,value)=>occupied+(value?1:0),0)).toBe(footprint.occupiedCells);
    expect(footprint.sources).toContain('https://data.desi.lbl.gov/doc/releases/dr1/');
    expect(footprint.disclosure).toContain('not the official survey tiling');
  });
  it('maps sky directions to the sidecar convention: row = Dec south to north, column = RA',()=>{
    expect(cellAt(149.75,1.25)).toBe(255);          // COSMOS, densest cell
    expect(cellAt(180.75,30.25)).toBeGreaterThan(0); // surveyed cell beside a real gap
    expect(cellAt(60,-70)).toBe(0);                  // south of the surveyed Dec range
    expect(footprintUv({x:1,y:0,z:0})).toEqual([0,.5]);
    expect(footprintUv({x:0,y:-1,z:0})[0]).toBeCloseTo(.75,12);
    expect(footprintUv({x:0,y:0,z:1})[1]).toBe(1);
  });
  it('rejects a sidecar from another source or shape while keeping subsets of the same source',()=>{
    expect(()=>decodeFootprint(footprint,{source:{...manifest.source,sha256:'0'}})).toThrow('does not match');
    expect(()=>decodeFootprint({...footprint,count:1},manifest)).toThrow('does not match');
    expect(()=>decodeFootprint({...footprint,version:2},manifest)).toThrow('does not match');
    expect(()=>decodeFootprint({...footprint,width:360},manifest)).toThrow('resolution');
    expect(()=>decodeFootprint({...footprint,cells:footprint.cells.slice(4)},manifest)).toThrow('incomplete');
    expect(decodeFootprint(footprint,{source:{sha256:manifest.source.sha256,acceptedRows:manifest.source.acceptedRows}}).length).toBe(cells.length);
  });
});
