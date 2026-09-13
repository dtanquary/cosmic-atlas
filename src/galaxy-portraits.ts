import {diskVolumeFragment} from './disk-volume';

export type DiskPortrait='m31'|'m33'|'ngc3982';
export interface GalaxyPortrait {label:string;source:string;disk?:DiskPortrait;smooth?:'elliptical'|'lenticular';exposure?:number}
// Image interpretation is keyed only to verified public identities. Coordinates,
// profile sidecars and classifications are never rewritten by this registry.
const portraits:ReadonlyMap<string,GalaxyPortrait>=new Map([
 ['nearby:m31',{label:'Andromeda · dust-ring disk',disk:'m31',source:'https://esahubble.org/images/heic2501a/'}],
 ['nearby:m33',{label:'Triangulum · patchy spiral',disk:'m33',source:'https://www.eso.org/public/images/eso1424a/'}],
 ['39633325333155389',{label:'NGC 3982 · intricate spiral',disk:'ngc3982',source:'https://esahubble.org/images/opo1036a/'}],
 ['nearby:m32',{label:'M32 · compact elliptical',smooth:'elliptical',exposure:8,source:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-32/'}],
 ['nearby:m110',{label:'M110 · diffuse elliptical',smooth:'elliptical',exposure:6,source:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-110/'}],
 ['39633263488141603',{label:'NGC 4026 · smooth lenticular',smooth:'lenticular',source:'https://www.legacysurvey.org/viewer?ra=179.8544868&dec=50.9616574&layer=ls-dr9&zoom=14'}],
 ['nearby:lmc',{label:'Large Magellanic Cloud · stellar bar',source:'https://noirlab.edu/public/images/noirlab2030a/'}],
 ['nearby:smc',{label:'Small Magellanic Cloud · diffuse wing',source:'https://noirlab.edu/public/images/noirlab2030b/'}],
]);
export const galaxyPortrait=(identity:string)=>portraits.get(identity);
export const PORTRAIT_FIELD_SIZE=384;
export const portraitMemoryBytes=(()=>{let bytes=PORTRAIT_FIELD_SIZE**2*4;for(let size=PORTRAIT_FIELD_SIZE;size>=1;size=Math.floor(size/2))bytes+=size*size*4;return bytes})();
export const PORTRAIT_EXTENT_RE=4.5;
export const PORTRAIT_RAY_STEPS=96;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const ridge=(angle:number,width:number)=>Math.exp(-.5*(Math.atan2(Math.sin(angle),Math.cos(angle))/width)**2);
function noise(x:number,y:number,seed:number){
 const hash=(x:number,y:number)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295};
 const ix=Math.floor(x),iy=Math.floor(y),u=smooth(0,1,x-ix),v=smooth(0,1,y-iy),a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
 return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
export const portraitLight={m31:{bulge:2.6,coreRadius:.38,old:1.3,young:1.2,dust:1.3},m33:{bulge:.13,coreRadius:.19,old:.9,young:1.4,dust:.55},ngc3982:{bulge:1.3,coreRadius:.23,old:1,young:1.5,dust:1.1}} as const;

/** Same four channels as the home template, regenerated from compact recipes.
 * Feature placement is illustrative, not registered telescope-image pixels. */
export function portraitDensityField(kind:DiskPortrait,size=PORTRAIT_FIELD_SIZE){
 const data=new Uint8Array(size*size*4),seed=kind==='m31'?31031:kind==='m33'?33033:39823982;
 const pitch=kind==='m31'?12:kind==='m33'?26:19,winding=1/Math.tan(pitch*Math.PI/180),count=kind==='m31'?2:kind==='m33'?3:4;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=((x+.5)/size*2-1)*PORTRAIT_EXTENT_RE,py=((y+.5)/size*2-1)*PORTRAIT_EXTENT_RE,r=Math.hypot(px,py),edge=1-smooth(3.3,4.45,r);if(!edge)continue;
  const coarse=noise(px*3.4+7,py*3.4-4,seed),fine=noise(px*17,py*17,seed),grain=noise(px*47+2,py*47-3,seed);
  const theta=Math.atan2(py,px),path=.8+winding*Math.log(Math.max(.22,r)/.55),bend=(coarse-.5)*(kind==='m33'?1.05:kind==='ngc3982'?.65:.36)+.09*Math.sin(r*11+theta*3);
  let arms=0,dust=0;
  for(let arm=0;arm<count;arm++){
   const a=theta-path-arm*Math.PI*2/count+bend,width=kind==='m33'?.33:.25;
   const broken=kind==='m33'?.25+1.6*coarse*coarse:.65+.5*coarse;
   arms+=ridge(a,width)*broken;
   if(kind!=='m31')arms+=.45*ridge(a+.4*Math.sin(r*9+arm),width*.5)*fine;
   dust+=ridge(a+.18,width*.35)+.45*ridge(a+.31+.1*fine,width*.2);
  }
  if(kind==='m31'){
   // Broad annular arcs rather than a sharp circular hoop; noise breaks them
   // into the long uneven dust lanes visible in the optical mosaic.
   const rr=r+.09*Math.sin(theta-1)+.06*(coarse-.5);
   const rings=Math.exp(-(((rr-1.13)/.14)**2))+.45*Math.exp(-(((rr-1.78)/.18)**2));
   arms=.35*arms+.8*rings;dust=.45*dust+1.8*rings;
  }
  const onset=smooth(.2,.65,r),outer=Math.exp(-1.15*r)*edge;
  const old=Math.exp(-1.67834699*r)*edge*(.88+.24*coarse);
  const young=outer*onset*(.3+.65*arms)*(.4+1.4*(.5*coarse+.5*fine)**2);
  const filament=Math.pow(1-Math.abs(2*noise(px*12+coarse,py*12,seed)-1),8);
  const dustDensity=onset*edge*Math.exp(-.55*r)*(.08+1.6*dust+.35*filament)*(.3+1.1*fine);
  let emission=young*smooth(.53,.76,fine)*smooth(.45,.74,grain)*(kind==='m31'?.45:2.4);
  if(kind==='m33')emission+=.13*Math.exp(-((px-1.4)**2+(py+.55)**2)/.018)*( .35+fine);
  const i=(y*size+x)*4;
  data[i]=Math.round(Math.sqrt(Math.min(1,old))*255);data[i+1]=Math.round(Math.sqrt(Math.min(1,young))*255);
  data[i+2]=Math.round(Math.min(1,dustDensity)*255);data[i+3]=Math.round(Math.min(1,emission)*255);
 }
 return data;
}

export const portraitFragment=diskVolumeFragment({size:PORTRAIT_FIELD_SIZE,steps:PORTRAIT_RAY_STEPS,extent:PORTRAIT_EXTENT_RE,
 uniforms:'uniform vec4 uPortrait; uniform vec3 uDiskColor,uCoreColor;',
 center:`float bulge=uPortrait.x*exp(-2.3*length(vec3(p.xy/uPortrait.y,p.z/(uPortrait.y*.55))))*stepSize;`,
 emission:`vec3 diskColor=mix(vec3(.83,.76,.65),vec3(.56,.66,.81),smoothstep(.3,1.8,r));
 vec3 emission=old*uPortrait.z*diskColor+young*uPortrait.w*mix(vec3(.53,.66,.85),uDiskColor,.18);
 emission+=bulge*mix(vec3(1.,.86,.68),uCoreColor,.15);`});
