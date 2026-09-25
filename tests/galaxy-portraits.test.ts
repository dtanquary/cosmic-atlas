import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {galaxyPortrait} from '../src/galaxy-portraits';
import {ResolvedGalaxy,type GalaxyDetailData} from '../src/galaxy-detail';
import {galaxyLookFragment} from '../src/galaxy-looks';
import {nearbyDetails} from '../src/nearby-galaxies';

it('preserves sourced geometry and profiles through recipe selection and appearance recycling',()=>{
 const sources=[...nearbyDetails(),...['galaxy-detail','galaxy-spiral'].map(file=>JSON.parse(readFileSync(new URL(`../public/data/${file}.json`,import.meta.url),'utf8')) as GalaxyDetailData)];
 let nearbyBytes=0;
 for(const data of sources){
  const original=JSON.stringify(data),portrait=galaxyPortrait(data.galaxy.targetId);expect(portrait).toBeDefined();
  const a=new ResolvedGalaxy(data,'spiral'),b=new ResolvedGalaxy({...data,galaxy:{...data.galaxy,id:777}},'catalog');
  try{
   expect(JSON.stringify(data)).toBe(original);expect(a.center.toArray()).toEqual(data.galaxy.position);expect(a.radius).toBe(b.radius);
   expect(a.frame.q).toBe(b.frame.q);expect(a.frame.positionAngle).toBe(b.frame.positionAngle);
   expect(a.radius/data.galaxy.distance*180/Math.PI*3600).toBeCloseTo(data.shape.radiusArcsec,10);
   const material=(m:ResolvedGalaxy)=>(m.scene.children[0] as THREE.Mesh<THREE.PlaneGeometry,THREE.RawShaderMaterial>).material;
   if(portrait?.look){
    // Procedural: no texture, and the noise seed follows the exact identity, not the dense row.
    expect(a.scene.children).toHaveLength(1);expect(a.memoryBytes).toBe(0);expect(material(a).fragmentShader).toBe(galaxyLookFragment);
    expect(material(a).uniforms.uSeed.value.toArray()).toEqual(material(b).uniforms.uSeed.value.toArray());
   }else if(portrait?.smooth){
    expect(a.scene.children).toHaveLength(1);expect(a.memoryBytes).toBe(0);
    expect(material(a).uniforms.uGaussians.value.slice(0,data.gaussians.length).map((v:THREE.Vector2)=>({sigmaRe:v.x,peak:v.y}))).toEqual(data.gaussians);
   }
   if(data.galaxy.nearby)nearbyBytes+=a.memoryBytes;
  }finally{a.dispose();b.dispose()}
 }
 expect(nearbyBytes).toBeLessThan(4*1048576);
});

it('falls back for absent or merely similar identities and exposes original profiles for measurement checks',()=>{
 for(const id of ['nearby:m310','39633325333155388','NGC 3982','NGC 4874','NGC 4889','toString'])expect(galaxyPortrait(id)).toBeUndefined();
 const original=nearbyDetails()[0],unknown={...original,galaxy:{...original.galaxy,targetId:'unmatched:portrait-fallback'}};
 const fallback=new ResolvedGalaxy(unknown,'spiral'),profile=new ResolvedGalaxy({...original,sourceProfileOnly:true,spiral:undefined,knotCount:0},'catalog');
 try{expect(fallback.memoryBytes).toBe(672000);expect(fallback.scene.children).toHaveLength(2);expect(profile.memoryBytes).toBe(0);expect(profile.scene.children).toHaveLength(1)}finally{fallback.dispose();profile.dispose()}
});
