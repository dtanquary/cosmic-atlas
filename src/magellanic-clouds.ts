/** Deliberate illustrations at two sourced galaxy positions, never new objects.
 * Coordinates are in units of the adopted radius, with Z scaled by the frame's
 * assumed thickness. The field is static and independent of catalog row IDs. */
export type MagellanicCloudKind='lmc'|'smc';
export const CLOUD_FIELD_SIZE=48;
export const CLOUD_EXTENT_RE=4.5;
export const CLOUD_RAY_STEPS=64;
export const cloudLabels={lmc:'Barred stellar cloud',smc:'Fragmented stellar cloud'} as const;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function hash(x:number,y:number,z:number,seed:number){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295}
function noise(x:number,y:number,z:number,seed:number){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,y-iy),w=smooth(0,1,z-iz);
 const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
 const plane=(k:number)=>mix(mix(hash(ix,iy,k,seed),hash(ix+1,iy,k,seed),u),mix(hash(ix,iy+1,k,seed),hash(ix+1,iy+1,k,seed),u),v);
 return mix(plane(iz),plane(iz+1),w);
}
const gaussian=(x:number,y:number,z:number,sx:number,sy:number,sz:number)=>Math.exp(-.5*((x/sx)**2+(y/sy)**2+(z/sz)**2));

/** RG stores sqrt(stellar light) and dust. No telescope pixels or gas map. */
export function cloudDensityField(kind:MagellanicCloudKind,size=CLOUD_FIELD_SIZE){
 const data=new Uint8Array(size**3*2),seed=kind==='lmc'?2026091203:2026091204;
 for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=((x+.5)/size*2-1)*CLOUD_EXTENT_RE,py=((y+.5)/size*2-1)*CLOUD_EXTENT_RE,pz=((z+.5)/size*2-1)*CLOUD_EXTENT_RE;
  const edge=1-smooth(3.3,CLOUD_EXTENT_RE-CLOUD_EXTENT_RE*2/size,Math.hypot(px,py,pz));if(!edge)continue;
  const coarse=noise(px*1.8+4,py*1.8-3,pz*2,seed),fine=noise(px*4.3,py*4.3,pz*.8,seed),grain=noise(px*8,py*8,pz*1.4,seed);
  const warp=(coarse-.5)*.55;
  let envelope:number,knots:number;
  if(kind==='lmc'){
   // Broad old-star envelope, an offset soft bar and broken outer star-forming
   // patches. The bar angle/offset and all individual structures are assumed.
   envelope=.13*gaussian(px,py,pz,1.35,1.2,.8)+.39*gaussian(px-.12,py+.23,pz,1.25,.3,.55);
   knots=.19*gaussian(px-1.05,py-.65,pz-.15,.38,.5,.48)
    +.11*gaussian(px+.95,py-.85,pz+.2,.57,.4,.6)
    +.09*gaussian(px+.8,py+.9,pz,.68,.43,.48)
    +.1*gaussian(px-1.35,py+.6,pz+.25,.45,.7,.55);
  }else{
   // A less ordered, broken elongated body; not a tidal simulation or a
   // reconstruction of the SMC's unresolved line-of-sight depth.
   envelope=.12*gaussian(px,py,pz,1.35,.95,1.1)+.29*gaussian(px+.35,py+.12,pz,1.05,.52,.75);
   knots=.14*gaussian(px+.9,py-.18-warp,pz+.24,.52,.43,.68)
    +.14*gaussian(px-.35,py+.27-warp,pz-.18,.6,.48,.58)
    +.2*gaussian(px-1.25,py-.7,pz+.2,.7,.42,.7)
    +.07*gaussian(px+.3,py-1.1,pz-.5,.46,.57,.55);
  }
  const billow=.12+5*Math.pow(.65*coarse+.35*fine,2.5);
  const stellar=(envelope*(.75+.5*coarse)+knots*billow)*edge;
  const filaments=Math.pow(1-Math.abs(2*fine-1),5);
  const dust=stellar*(.2+2.8*filaments)*(.35+.8*grain);
  const index=((z*size+y)*size+x)*2;
  data[index]=Math.round(Math.sqrt(Math.min(1,stellar))*255);
  data[index+1]=Math.round(Math.min(1,dust)*255);
 }
 return data;
}

/** Uniform rejection samples of this same bounded field, not generic clumps. */
export function cloudLightSamples(kind:MagellanicCloudKind,field:Uint8Array,count=4096){
 let seed=kind==='lmc'?1203:1204;
 const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return (seed+.5)/4294967296};
 const positions=new Float32Array(count*3),sizes=new Float32Array(count),emission=new Uint8Array(count);
 for(let i=0;i<count;){
  const x=random(),y=random(),z=random(),index=((Math.floor(z*CLOUD_FIELD_SIZE)*CLOUD_FIELD_SIZE+Math.floor(y*CLOUD_FIELD_SIZE))*CLOUD_FIELD_SIZE+Math.floor(x*CLOUD_FIELD_SIZE))*2;
  if(random()>(field[index]/255)**2)continue;
  positions.set([(x*2-1)*CLOUD_EXTENT_RE,(y*2-1)*CLOUD_EXTENT_RE,(z*2-1)*CLOUD_EXTENT_RE],i*3);
  sizes[i]=.024+random()*.028;emission[i]=random()<.025?1:0;i++;
 }
 return {positions,sizes,emission};
}

export const cloudFragment=`precision highp float;
precision highp sampler3D;
in vec2 vNdc;
uniform mat3 uToModel;
uniform vec3 uOrigin,uForward,uRight,uUp,uDiskColor,uCoreColor,uEmissionColor;
uniform vec2 uProjection;
uniform float uMix,uThickness,uDustStrength,uCloudKind;
uniform sampler3D uCloudDensity;
out vec4 fragColor;
void main(){
 vec3 direction=uToModel*normalize(uForward+vNdc.x*uProjection.x*uRight+vNdc.y*uProjection.y*uUp);
 float rate=length(direction);vec3 ray=direction/rate;
 float b=dot(uOrigin,ray),c=dot(uOrigin,uOrigin)-${CLOUD_EXTENT_RE**2},disc=b*b-c;
 if(disc<=0.)discard;
 float root=sqrt(disc),entry=max(0.,-b-root),exit=-b+root;
 if(exit<=entry)discard;
 float stepSize=(exit-entry)/float(${CLOUD_RAY_STEPS});
 float columnStep=stepSize/(rate*uThickness);
 vec3 light=vec3(0.);float transmission=1.;
 for(int i=0;i<${CLOUD_RAY_STEPS};i++){
  vec3 p=uOrigin+ray*(entry+(float(i)+.5)*stepSize);
  vec2 field=texture(uCloudDensity,p/${(CLOUD_EXTENT_RE*2).toFixed(1)}+.5).rg;
  float density=field.r*field.r;
  float dust=field.g*uDustStrength;
  float optical=(density*.7+dust)*columnStep;
  // Qualitative SMASH image features; these coordinates are illustrative and
  // never alter the sourced global ellipse. No foreground clusters are added.
  float bar=exp(-.5*(pow((p.x-.12)/1.2,2.)+pow((p.y+.23)/.3,2.)));
  float brightPatch=exp(-dot(p.xy-vec2(1.05,.65),p.xy-vec2(1.05,.65))/.075);
  float smallPatches=exp(-dot(p.xy-vec2(-.9,.7),p.xy-vec2(-.9,.7))/.09)+.7*exp(-dot(p.xy-vec2(.2,-.85),p.xy-vec2(.2,-.85))/.08);
  float wingPatches=exp(-dot(p.xy-vec2(1.1,.7),p.xy-vec2(1.1,.7))/.12)+.6*exp(-dot(p.xy-vec2(.5,.3),p.xy-vec2(.5,.3))/.06);
  float nebula=mix(brightPatch+.25*smallPatches,.65*wingPatches+.3*smallPatches,uCloudKind);
  vec3 color=mix(vec3(.57,.69,.84),uDiskColor,.16);
  color=mix(color,vec3(.84,.79,.73),bar*(1.-uCloudKind)*.75);
  color=mix(color,vec3(1.,.34,.49),clamp(nebula*(.65+field.g),0.,.85));
  float emitted=1.-exp(-density*.85*columnStep);
  light+=transmission*color*emitted;
  transmission*=exp(-optical);
 }
 if(max(light.r,max(light.g,light.b))<.0001)discard;
 // Bound highlights without a central bulge. Extinction is internal; unrelated
 // catalog points retain their own depth/fade policy, as with shared models.
 fragColor=vec4(1.-exp(-light*1.3),uMix);
}`;
