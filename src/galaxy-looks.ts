/** Procedural spiral looks ported from the Atrium Galaxy screensaver (docs/galaxy-looks.md).
 * Every structure (arms, dust, stars, H II regions) is illustrative; only the
 * adopted size, sky ellipse and position come from the source catalogs. */
import * as THREE from 'three';
import {warmthTint,type GalaxyColors} from './galaxy-colors';

export type CatalogLookKey='grand'|'multi'|'tight'|'flocculent'|'barred'|'weakBar';
export type GalaxyLookKey='ngc3982'|'m31'|'m33'|'milkyWay'|'m51'|'m101'|'ngc1300'|CatalogLookKey;
type RGB=[number,number,number];
export interface GalaxyLook {arms:number;minor:number;pitchDegrees:number;bar:number;bulge:number;ragged:number;dust:number;hii:number;
 extent:number;unitsPerRe:number;phaseDegrees:number;spin:1|-1;core:RGB;disc:RGB;young:RGB;knots:RGB}

// Bar and bulge are in disc radii (the exponential scale length is 0.4); ragged
// runs from grand design (0) to flocculent (1); hii scales how many H II regions
// light the arms. extent stretches the disc's outer fade (lookDisc) and
// unitsPerRe then holds its half-light radius at the adopted radius. phase and
// spin orient the pattern in the model frame (spin -1 mirrors it). Colours are
// bulge, old disc, young arm stars and H II pink, in the family Atrium sampled
// from Hubble/ESO photos.
const andromeda:GalaxyLook={arms:2,minor:1,pitchDegrees:8,bar:0,bulge:.13,ragged:.5,dust:1.2,hii:1,extent:1,unitsPerRe:.5311,phaseDegrees:0,spin:1,core:[1,.9,.78],disc:[.86,.78,.86],young:[.74,.76,1],knots:[1,.5,.7]};
const triangulum:GalaxyLook={arms:2,minor:1,pitchDegrees:30,bar:0,bulge:.015,ragged:.9,dust:.6,hii:1.5,extent:1,unitsPerRe:.5311,phaseDegrees:0,spin:1,core:[1,.96,.9],disc:[.88,.9,1],young:[.74,.86,1],knots:[1,.5,.56]};
const whirlpool:GalaxyLook={arms:2,minor:1,pitchDegrees:19,bar:0,bulge:.05,ragged:.2,dust:1.3,hii:1,extent:1,unitsPerRe:.5311,phaseDegrees:0,spin:1,core:[1,.91,.8],disc:[.94,.9,.87],young:[.72,.86,1],knots:[1,.42,.5]};
const pinwheel:GalaxyLook={arms:4,minor:1,pitchDegrees:27,bar:0,bulge:.03,ragged:.55,dust:.8,hii:1,extent:1,unitsPerRe:.5311,phaseDegrees:0,spin:1,core:[1,.93,.86],disc:[.95,.93,.93],young:[.7,.82,1],knots:[1,.5,.6]};
const greatBarred:GalaxyLook={arms:2,minor:1,pitchDegrees:17,bar:.45,bulge:.05,ragged:.1,dust:1,hii:1,extent:1,unitsPerRe:.5311,phaseDegrees:0,spin:1,core:[1,.9,.84],disc:[.93,.9,.97],young:[.72,.84,1],knots:[1,.5,.6]};
export const galaxyLooks:Record<GalaxyLookKey,GalaxyLook>={
 // NGC 3982 (Hubble opo1036a): many short winding arms, dense dust filaments, rich in H II, small warm centre.
 ngc3982:{arms:4,minor:.8,pitchDegrees:26,bar:0,bulge:.05,ragged:.7,dust:2.2,hii:2,extent:1,unitsPerRe:.5311,phaseDegrees:0,spin:1,core:[1,.92,.84],disc:[.88,.9,1],young:[.7,.82,1],knots:[1,.45,.58]},
 // Andromeda (heic2501a): tightly wound dusty arms that read as rings, large cream bulge, mauve outskirts.
 m31:andromeda,
 // Triangulum (eso1424a): a flocculent patchwork, weak nucleus, rich in H II.
 m33:triangulum,
 // Milky Way: two major arms off the bar's ends and two minor between. The bar
 // length (5 kpc half-length) and angle (28 degrees from the Sun-centre line)
 // and the handedness follow the sourced home reference; the disc reaches about
 // 15 kpc so the Sun at 8.1 kpc sits inside it.
 milkyWay:{arms:4,minor:.45,pitchDegrees:13,bar:.71075,bulge:.09,ragged:.3,dust:1.2,hii:1,extent:1.5,unitsPerRe:.6203,phaseDegrees:152,spin:-1,core:[1,.9,.76],disc:[.92,.88,.84],young:[.72,.84,1],knots:[1,.45,.55]},
 // Atrium's own kinds on their galaxies, handedness from the photos (north up).
 // M51 (heic0506a): winds clockwise outward; turned so an arm crest passes
 // where the line of sight to NGC 5195 crosses the disc.
 m51:{...whirlpool,phaseDegrees:37.3},
 // M101 (heic0602a): many open, lopsided arms winding clockwise outward.
 m101:pinwheel,
 // NGC 1300 (opo0501a): winds anticlockwise outward; the bar has the S4G bar's
 // length (75 arcsec) and sky angle (100.3 degrees), pinned by the tests.
 ngc1300:{...greatBarred,bar:.3817,phaseDegrees:-6.98,spin:-1},
 // Catalog looks, after Atrium's kinds: Whirlpool (M51), Pinwheel (M101),
 // Andromeda, Triangulum, Great Barred (NGC 1300) and its Milky Way.
 grand:whirlpool,
 multi:pinwheel,
 tight:andromeda,
 flocculent:triangulum,
 barred:greatBarred,
 weakBar:{arms:4,minor:.45,pitchDegrees:13,bar:.28,bulge:.09,ragged:.3,dust:1.2,hii:1,extent:1,unitsPerRe:.5311,phaseDegrees:0,spin:1,core:[1,.9,.76],disc:[.92,.88,.84],young:[.72,.84,1],knots:[1,.45,.55]},
};
export const catalogLookLabels:Record<CatalogLookKey,string>={grand:'Grand-design spiral',multi:'Multi-arm spiral',tight:'Tightly wound spiral',flocculent:'Flocculent spiral',barred:'Barred spiral',weakBar:'Weakly barred spiral'};

// Recorded Hubble types: bars first (SB, SAB), then the stage sets winding,
// bulge and raggedness, as along the Hubble sequence. Display choices, not fits.
const stageLooks:Record<string,CatalogLookKey>={a:'tight',ab:'tight',b:'grand',bc:'multi',c:'multi',cd:'flocculent',d:'flocculent',m:'flocculent'};
// Without a usable type: weights in hash space, not measured population fractions.
const identityLooks:[number,CatalogLookKey][]=[[.25,'grand'],[.5,'multi'],[.65,'tight'],[.8,'barred'],[.9,'weakBar'],[1,'flocculent']];

function identityHash(text:string){
 let h=2166136261;
 for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0;
}

/** A catalog galaxy's look: from its recorded visual type when that names a
 * spiral stage, otherwise from its exact public identity. */
export function catalogLook(identity:string,morphology?:string):{key:CatalogLookKey;fromType:boolean}{
 const type=morphology?.match(/^S(AB|B)?(a|ab|b|bc|c|cd|d|m)$/);
 if(type)return {key:type[1]==='B'?'barred':type[1]==='AB'?'weakBar':stageLooks[type[2]],fromType:true};
 const fraction=identityHash(`look:${identity}`)/4294967296;
 return {key:identityLooks.find(([limit])=>fraction<limit)![1],fromType:false};
}
const catalogKeys=new Set<GalaxyLookKey>(Object.keys(catalogLookLabels) as CatalogLookKey[]);

/** Stable noise offsets per galaxy, from its exact public identity. */
export function lookSeed(identity:string):[number,number]{
 let h=2166136261;
 for(let i=0;i<identity.length;i++)h=Math.imul(h^identity.charCodeAt(i),16777619);
 h>>>=0;return [(h&65535)/65536*100,(h>>>16)/65536*100];
}

/** The smooth disc: exponential (scale 0.4 disc radii) fading out between
 * 0.85 and 1.4 times a look's extent. Each look's unitsPerRe puts that profile's
 * half-light radius at exactly the adopted radius, so arms and bulge are the
 * only added light. */
export const lookDisc={scale:.4,fadeStart:.85,fadeEnd:1.4};

/** The colours and pattern orientation a model draws with. Catalog looks turn
 * and mirror their pattern and tint their colours (at fixed luminance) by exact
 * identity (the disc and young stars, at fixed luminance), so no two catalog
 * galaxies line up or match exactly; named looks
 * keep their tuned values. */
export function lookAppearance(key:GalaxyLookKey,identity:string,palette?:GalaxyColors){
 const l=galaxyLooks[key],catalog=catalogKeys.has(key),h=identityHash(`pattern:${identity}`);
 const tint=palette?warmthTint(palette):[1,1,1];
 const shift=(rgb:RGB,amount:number):RGB=>{
  const lum=(c:RGB)=>c[0]*.2126+c[1]*.7152+c[2]*.0722,out=rgb.map((value,i)=>value*(1+amount*(tint[i]-1))) as RGB,scale=lum(rgb)/lum(out);
  // Light multipliers, so a channel may pass 1; the stretch keeps the output in range.
  return out.map(value=>value*scale) as RGB;
 };
 return {phase:catalog?(h&16777215)/16777216*Math.PI*2:THREE.MathUtils.degToRad(l.phaseDegrees),spin:catalog?(h>>>31?-1:1):l.spin,
  core:l.core,disc:shift(l.disc,1),young:shift(l.young,.6),knots:l.knots};
}

/** Uniforms shared by every model drawn with a look. */
export function lookUniforms(key:GalaxyLookKey,identity:string,palette?:GalaxyColors){
 const l=galaxyLooks[key],a=lookAppearance(key,identity,palette),v=(rgb:RGB)=>new THREE.Vector3().fromArray(rgb);
 return {uShape:{value:new THREE.Vector4(l.arms,1/Math.tan(THREE.MathUtils.degToRad(l.pitchDegrees)),l.bar,l.bulge)},uArms:{value:new THREE.Vector4(l.ragged,l.dust,l.minor,l.hii)},
  uPattern:{value:new THREE.Vector4(a.phase,a.spin,l.extent,l.unitsPerRe)},uSeed:{value:new THREE.Vector2(...lookSeed(identity))},
  uCore:{value:v(a.core)},uDisc:{value:v(a.disc)},uYoung:{value:v(a.young)},uKnots:{value:v(a.knots)},uPixelRatio:{value:1}};
}

/** Thin disc, bulge and dust evaluated once where each ray crosses the midplane,
 * which keeps the per-pixel detail of the 2D original at any zoom. Grazing and
 * in-plane rays fall back to a march through the azimuthally averaged disc, or,
 * given home (GLSL defining diskMarch), to that march, also used whenever the
 * camera is within the disc layer. */
export function lookFragment(home=''){return `precision highp float;precision highp int;
in vec2 vNdc;
uniform mat3 uToModel;
uniform vec3 uOrigin,uForward,uRight,uUp,uCore,uDisc,uYoung,uKnots;
uniform vec2 uProjection,uSeed;
uniform vec4 uShape,uArms,uPattern; // (arms, cot pitch, bar, bulge), (ragged, dust, minor, H II), (phase, spin, extent, units per R_e)
uniform float uMix,uThickness,uDustStrength,uPixelRatio;
out vec4 fragColor;
// Units: disc radii of the original (lookDisc); uPattern.w converts half-light
// radii. Layer scale heights match the home template's 0.065/0.028/0.019 R_e.
const float SLAB=.3,QB=.6;
const int STEPS=48;
vec2 turn(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}
float wrapMod(float x,float y){return x-y*floor(x/y);}
// Integer hashes (Jarzynski & Olano 2020) give identical lattices on every GPU.
float lattice(vec2 i){uvec2 v=uvec2(ivec2(i))*1664525u+1013904223u;v.x+=v.y*1664525u;v.y+=v.x*1664525u;v^=v>>16u;v.x+=v.y*1664525u;v.y+=v.x*1664525u;v^=v>>16u;return float(v.x)/4294967296.;}
vec4 hash4(vec2 cell,int salt){uvec4 v=uvec4(uvec2(ivec2(cell)),uint(salt),7u)*1664525u+1013904223u;
 v.x+=v.y*v.w;v.y+=v.z*v.x;v.z+=v.x*v.y;v.w+=v.y*v.z;v^=v>>16u;v.x+=v.y*v.w;v.y+=v.z*v.x;v.z+=v.x*v.y;v.w+=v.y*v.z;return vec4(v)/4294967296.;}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
 return mix(mix(lattice(i),lattice(i+vec2(1,0)),u.x),mix(lattice(i+vec2(0,1)),lattice(i+vec2(1,1)),u.x),u.y);}
// Detail finer than about two pixels fades to its mean instead of aliasing.
float keep(float frequency,float footprint){return 1.-smoothstep(.25,.5,frequency*footprint);}
float fbm3(vec2 p){vec2 p1=p*2.03+vec2(1.7,9.2);return .5*noise(p)+.25*noise(p1)+.125*noise(p1*2.03+vec2(1.7,9.2))+.047;}
vec2 fbmRidge(vec2 p,float footprint){
 float v=0.,ridges=0.,a=.5,w=1.,frequency=1.;
 for(int i=0;i<5;i++){
  float k=keep(frequency,footprint),n=noise(p),rr=1.-abs(2.*n-1.);rr*=rr;
  v+=a*mix(.5,n,k);ridges+=a*mix(.35,rr*w,k);w=clamp(rr*2.,0.,1.);
  p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(1.7,9.2);a*=.5;frequency*=2.;
 }
 return vec2(v,ridges);
}
// A narrow profile across an arm, widened (with its light conserved) once the
// arm spacing approaches a pixel.
float band(float ph,float k,float dph){float kk=k/(1.+.3*k*dph*dph);return pow(.5+.5*cos(ph),kk)*sqrt(kk/k);}
// One star per cell, a round pinpoint on screen: M maps a step in the disc to points.
vec2 discStar(vec2 g,float cell,int salt,float chance,mat2 M){
 vec4 h=hash4(floor(g/cell),salt);
 if(h.x>chance)return vec2(0.);
 float d=length(M*((fract(g/cell)-.5-(h.yz-.5)*.8)*cell)),mag=pow(h.w,2.5);
 return vec2(exp(-d*d*(4.5-2.5*mag))*(.3+1.6*mag),h.x/max(chance,1e-4));
}
// Cells about \`points\` across on screen, blended over two octaves so zooming
// reveals new stars rather than resizing the old ones.
vec2 starLayer(vec2 g,float points,float unitsPerPoint,int salt,float chance,mat2 M){
 float level=max(log2(points*unitsPerPoint/.0005),-4.),l0=floor(level),f=level-l0,cell=.0005*exp2(l0);
 int i=int(l0)+64;
 return discStar(g,cell,salt*256+i,chance,M)*(1.-f)+discStar(g,cell*2.,salt*256+i+1,chance,M)*f;
}
// An H II region with its young cluster, physically sized (0.8-3.2 points at
// the original's framing of 390 points per disc radius) and round on screen.
vec2 knot(vec2 g,float cell,float chance,mat2 M,float pointsPerUnit){
 vec4 h=hash4(floor(g/cell),41);
 if(h.x>chance)return vec2(0.);
 float size=(.8+2.4*pow(h.w,3.))/390.*pointsPerUnit,shown=max(size,.7);
 float l=length(M*((fract(g/cell)-.5-(h.yz-.5)*.3)*cell))/shown;
 return vec2(exp(-l*l*2.),exp(-l*l*8.))*(.3+.7*h.x/max(chance,1e-4))*(size*size)/(shown*shown);
}
float column(float z0,float z1,float height,float rayZ,float stepSize){
 if(abs(rayZ)<1e-5)return exp(-abs((z0+z1)*.5)/height)*stepSize/(2.*height);
 float integral=z0*z1<0.?2.-exp(-abs(z0)/height)-exp(-abs(z1)/height):exp(-min(abs(z0),abs(z1))/height)*(1.-exp(-abs(z1-z0)/height));
 return integral/(2.*abs(rayZ));
}
float discLight(float r,float k){return exp(-r/${lookDisc.scale})*smoothstep(${lookDisc.fadeEnd}*k,${lookDisc.fadeStart}*k,r);}
${home}
void main(){
 float S=uPattern.w,k=uPattern.z,EXTENT=1.6*k,H_OLD=.065*S,H_YOUNG=.028*S,H_DUST=.019*S;
 vec3 oRe=uOrigin*vec3(1.,1.,uThickness),o=oRe*S;
 vec3 ray=normalize((uToModel*normalize(uForward+vNdc.x*uProjection.x*uRight+vNdc.y*uProjection.y*uUp))*vec3(1.,1.,uThickness));
 float cosi=abs(ray.z),tp=abs(ray.z)<1e-6?-1.:-o.z/ray.z;
 // Derivatives before any discard: the crossing point's footprint on the disc,
 // turned (and mirrored) into the pattern's frame.
 float pc=cos(uPattern.x),ps=sin(uPattern.x);mat2 R=mat2(pc,-ps*uPattern.y,ps,pc*uPattern.y);
 vec2 g=R*(o+ray*clamp(tp,0.,64.)).xy,gx=dFdx(g),gy=dFdy(g);
${home?' vec4 home=diskMarch(oRe,ray);\n':''} float arms=uShape.x,cot=uShape.y,bar=uShape.z,bulgeR=uShape.w,ragged=uArms.x,r0=max(bar,bulgeR*1.6);
 // The bulge: an oblate cloud (intrinsic axis ratio QB) whose projection is the
 // original's Sersic n=2 profile, part of it ahead of the camera and part behind the dust.
 vec3 P=o*vec3(1.,1.,1./QB),D=ray*vec3(1.,1.,1./QB);
 float dd=dot(D,D),tc=-dot(P,D)/dd,bulgeW=max(bulgeR*1.7,1e-4),rb=length(P+D*tc)/bulgeW;
 float bulge=(20.*exp(-3.67*sqrt(rb))+1.5*exp(-rb*rb*60.))/(sqrt(dd)*QB)*clamp(.5+.5*tc*sqrt(dd)/bulgeW,0.,1.);
 float behind=tp>0.?clamp(.5-.5*(tp-tc)*sqrt(dd)/bulgeW,0.,1.):0.;
 // Finite slab and cylinder, including inside views.
 vec3 inv=vec3(ray.x<0.?-1.:1.,ray.y<0.?-1.:1.,ray.z<0.?-1.:1.)/max(abs(ray),vec3(1e-7));
 vec3 a=(-vec3(EXTENT,EXTENT,SLAB)-o)*inv,b=(vec3(EXTENT,EXTENT,SLAB)-o)*inv,lo=min(a,b),hi=max(a,b);
 float entry=max(0.,max(lo.x,max(lo.y,lo.z))),exit=min(hi.x,min(hi.y,hi.z));
 float qa=dot(ray.xy,ray.xy),qb=dot(o.xy,ray.xy),qc=dot(o.xy,o.xy)-EXTENT*EXTENT,disc=qb*qb-qa*qc;
 if(qa>1e-8&&disc>=0.){float root=sqrt(disc);entry=max(entry,(-qb-root)/qa);exit=min(exit,(-qb+root)/qa);}else if(qc>0.)exit=entry;
 float dust0=uArms.y*uDustStrength,w=smoothstep(.06,.16,cosi)${home?'*smoothstep(.05,.2,abs(o.z))':''};
 if(exit<=entry&&bulge<1e-4${home?'&&home.a<0.':''})discard;
 vec3 light=vec3(0.),transmission=vec3(1.),vivid=vec3(0.),bulgeDust=vec3(1.);
 if(w>0.&&exit>entry){
  float r=length(g),ro=r/k;
  // Screen footprint in disc units per point, and its inverse for round pinpoints.
  mat2 J=mat2(gx,gy)*uPixelRatio;
  float ja=dot(J[0],J[0]),jb=dot(J[0],J[1]),jd=dot(J[1],J[1]),half_=.5*(ja+jd),spread=sqrt(max(half_*half_-(ja*jd-jb*jb),0.));
  float sMax=sqrt(half_+spread),sMin=sqrt(max(half_-spread,1e-20)),fp=sMax/uPixelRatio,det=J[0].x*J[1].y-J[1].x*J[0].y;
  mat2 M=mat2(J[1].y,-J[0].y,-J[1].x,J[0].x)/(abs(det)<1e-20?1e-20:det);
  float steep=smoothstep(.5,.25,cosi),soft=mix(1.,.4,steep);
  // Swirled space: logarithmic arms are straight rays, and noise is sheared along them.
  float lr=log(max(r,r0*.35)/r0);
  vec2 q=turn(g,lr*cot),qn=turn(g,lr*min(cot,1.));
  float warp=fbm3(q*2.2+uSeed)-.5,aq=atan(q.y,q.x),ph=arms*aq+warp*(2.+5.*ragged);
  float dph=arms*sqrt(1.+cot*cot)/max(r,r0*.35)*fp;
  float armN=wrapMod(floor(ph/6.2832+.5),arms);
  float armAmp=(.6+.4*hash4(vec2(armN,floor(uSeed.x)),5).x)*mix(1.,uArms.z,wrapMod(armN,2.));
  float crest=band(ph,(4.-2.*ragged)*soft,dph)*armAmp,young=band(ph-.35,8.*soft,dph)*armAmp,hii=band(ph+.2,10.*soft,dph)*armAmp;
  float n5=noise(q*5.+uSeed.yx),floc=ragged*ragged;
  crest*=mix(1.,smoothstep(.3,.7,n5),ragged);
  if(floc>.1){
   float patches=smoothstep(.45,.8,n5*.6+mix(.5,noise(q*11.-uSeed),keep(11.,fp*1.5))*.4)*armAmp;
   crest=mix(crest,max(crest*.35,patches),floc);young=mix(young,patches,floc);hii=mix(hii,patches,floc);
  }
  // Star clouds are lumpy in the disc itself, so arms read as clusters, not brush strokes.
  float lumps=mix(.5,noise(g*16.+uSeed),keep(16.,fp))*.5+mix(.5,noise(mat2(.8,.6,-.6,.8)*g*47.-uSeed),keep(47.,fp))*.5;
  float clump=smoothstep(.2,.9,lumps);
  float inArms=smoothstep(r0*.8,r0*1.5,r)*mix(1.,smoothstep(1.25,.9,ro),steep);
  float sigma=discLight(r,k),arm=crest*inArms*(.5+.9*clump);
  // Dust: broken lanes on the arms' inner edges with narrow dark cores, feathers,
  // a filament web down to the nucleus, and lanes along a bar's leading edges.
  vec2 fr=fbmRidge(qn*6.+uSeed*1.3+3.,fp*6.*1.5);
  float dt=fr.x,lp=ph+.45+(dt-.5)*2.5,lc=.5+.5*cos(lp);
  float along=lc>.6?mix(.5,noise(qn*40.+uSeed),keep(40.,fp*1.5)):.5;
  float broken=smoothstep(.25,.8,lumps+dt-.5);
  float lane=band(lp,14.*mix(1.,.7,steep),dph)*broken*mix(.45,1.,smoothstep(.3,.7,along));
  float perp=r/arms/sqrt(1.+cot*cot),lw=(.004+.006*lumps)*(1.+1.5*steep),lwShown=max(lw,.6*fp);
  float l1=(lp-6.2832*floor(lp/6.2832+.5))*perp/lwShown;
  float core=exp(-l1*l1)*lw/lwShown*smoothstep(.3,.7,along)*broken;
  float tanP=1./cot,kf=(1.-tanP*.7)/(tanP+.7);
  float fu=18.*(aq-(cot-kf)*lr)/6.2832+(dt-.5)*.8,phw=ph-6.2832*floor(ph/6.2832+.5);
  float feather=pow(.5+.5*cos(6.2832*fu),8.)*step(.45,hash4(vec2(wrapMod(floor(fu+.5),18.),floor(uSeed.y)),9).x)
   *smoothstep(-1.8,-.3,phw)*smoothstep(.7,.4,phw)*smoothstep(.3,.55,dt)*keep(18./6.2832/max(r,.05),fp);
  float web=smoothstep(.25,.7,fr.y)*mix(1.,.4,steep);
  float ax=abs(g.x)/max(bar,.001),barY=(g.y-sign(g.x)*bar*(.1+.15*ax*ax))/(.02+.02*dt);
  float barLane=step(.001,bar)*exp(-barY*barY)*smoothstep(.1,.35,ax)*smoothstep(1.1,.8,ax)*smoothstep(.3,.6,dt+.2);
  float barZone=mix(1.,smoothstep(bar*.7,bar*1.1,r),step(.001,bar));
  float dust=((lane*.7+core*.8)*(1.-.7*floc)+feather*.7*(1.-ragged))*smoothstep(r0*.5,r0*.95,r)
   +barLane*.9+web*(.25+.9*crest)*smoothstep(.015,.06,r)*barZone;
  // A thin midplane sheet: it reddens the light behind it, blue first.
  vec3 absorb=exp(-dust*smoothstep(1.3,.5,ro)*dust0/cosi*vec3(.65,.8,1.));
  float bx=g.x/max(bar,.001),by=g.y/max(bar*.3,.001);bx*=bx;
  float barLight=step(.001,bar)*exp(-bx*bx-by*by);
  vec3 old=mix(uCore,uDisc,smoothstep(.05,.7,r)),tint=mix(old,uYoung,clamp(arm*.7+.6*smoothstep(.4,1.1,ro),0.,1.));
  float tex=.7+.6*(.55*lumps+.45*mix(.5,noise(mat2(.6,-.8,.8,.6)*g*110.+uSeed.yx),keep(110.,fp)));
  // Dust sits in a thin midplane layer: as in the original, a third of the old
  // disc's light is in front of it, so lanes redden rather than go black.
  float zs=clamp(o.z,-SLAB,SLAB),ze=tp>0.?-sign(o.z)*SLAB:sign(ray.z)*SLAB,zc=tp>0.?0.:ze;
  float oldFront=column(zs,zc,H_OLD,ray.z,0.),oldBack=tp>0.?column(0.,ze,H_OLD,ray.z,0.):0.;
  float youngColumn=column(zs,zc,H_YOUNG,ray.z,0.)+(tp>0.?column(0.,ze,H_YOUNG,ray.z,0.):0.);
  vec3 seen=tp>0.?absorb:vec3(1.);
  vec3 a1=(tint*sigma*.84*tex+uCore*barLight*.9)*(oldFront+oldBack)*mix(seen,vec3(1.),.3);
  vec3 a2=(tint*sigma*3.5*arm*tex+uYoung*young*inArms*clump*sigma*1.2)*youngColumn*seen;
  // Resolved stars: a fine grain that follows the light, and blue giants past the crests.
  float unitsPerPoint=sMax;
  vec2 s1=starLayer(g,2.2,unitsPerPoint,3,clamp(crest*inArms*4.*smoothstep(1.4,.9,ro)+sigma*.6,0.,.85),M);
  float giants=clamp(young*inArms*clump*2.,0.,.3)*smoothstep(1.4,1.,ro);
  vec2 s2=giants>.002?starLayer(g,11.,unitsPerPoint,11,giants,M):vec2(0.);
  vec3 stars=(mix(old,uYoung,smoothstep(.05,.4,crest))*s1.x*min(sigma*(1.5+3.*arm),.3)+uYoung*s2.x*.5)*seen;
  // H II regions in complexes along the arms' inner edges; part of their pink is
  // kept saturated past the stretch, as Hubble processing does.
  vec2 kn=vec2(0.);float strung=hii*inArms*smoothstep(1.2,.8,ro),shownKnots=smoothstep(2.,5.,.041/sMax);
  if(strung>.002&&shownKnots>0.){float groups=smoothstep(.3,.7,noise(g*9.+uSeed.yx));kn=knot(g,.041,clamp(strung*groups*12.*uArms.w,0.,.9),M,1./sMin)*shownKnots*mix(1.,1.6,clamp(uArms.w-1.,0.,1.));}
  float fade=.25+.75*smoothstep(1.2,.3,ro);
  vec3 through=sqrt(seen);
  light=a1+a2+stars+(uKnots*kn.x*1.5+mix(uYoung,vec3(1.),.5)*kn.y*1.5)*through*fade;
  vivid=uKnots*kn.x*.7*through*fade;
  transmission=seen;bulgeDust=seen;
${home?'':'  light*=w;vivid*=w;\n'} }
${home?'':` if(w<1.&&exit>entry){
  // In-plane and grazing rays: march the azimuthally averaged disc and dust.
  float dt=(exit-entry)/float(STEPS);
  vec3 marched=vec3(0.),through=vec3(1.),atBulge=vec3(1.);
  for(int i=0;i<STEPS;i++){
   float t=entry+(float(i)+.5)*dt;
   vec3 p=o+ray*t;
   float r=length(p.xy),ro=r/k,z0=p.z-ray.z*dt*.5,z1=p.z+ray.z*dt*.5,sigma=discLight(r,k);
   float inArms=smoothstep(r0*.8,r0*1.5,r);
   vec3 old=mix(uCore,uDisc,smoothstep(.05,.7,r)),tint=mix(old,uYoung,clamp(.14*inArms+.6*smoothstep(.4,1.1,ro),0.,1.));
   float cellO=column(z0,z1,H_OLD,ray.z,dt),cellY=column(z0,z1,H_YOUNG,ray.z,dt),cellD=column(z0,z1,H_DUST,ray.z,dt);
   vec3 e=tint*sigma*(.84*cellO+.6*inArms*cellY);
   vec3 tau=.15*smoothstep(1.3,.5,ro)*smoothstep(r0*.5,r0*.95,r)*dust0*cellD*vec3(.65,.8,1.);
   vec3 cell=exp(-tau);
   marched+=through*e*(1.-cell+1e-5)/(tau+1e-5);
   through*=cell;
   if(t<tc)atBulge=through;
  }
  light+=marched*(1.-w);transmission=mix(through,transmission,w);bulgeDust=mix(atBulge,bulgeDust,w);
 }
`}
 light+=uCore*bulge*((1.-behind)+behind*bulgeDust);
 // Hubble-style stretch on brightness: faint outskirts lift, the core keeps its
 // colour, and only the brightest parts pale toward white.
 float lum=dot(light,vec3(.3,.5,.2))+1e-4,stretched=log(20.*lum+sqrt(400.*lum*lum+1.))/6.17;
 vec3 col=mix(min(light*stretched/lum,1.),vec3(stretched),.5*smoothstep(.55,1.,stretched))+vivid;
 col=.96*min(col,1.);
 float opacity=1.-dot(transmission,vec3(.2126,.7152,.0722));
${home?` vec4 shown=mix(max(home,0.),vec4(col,opacity),w);col=shown.rgb;opacity=shown.a;
`:''} if(max(col.r,max(col.g,col.b))<.002&&opacity<.0001)discard;
 fragColor=vec4(col*uMix,opacity*uMix);
}`}
export const galaxyLookFragment=lookFragment();
