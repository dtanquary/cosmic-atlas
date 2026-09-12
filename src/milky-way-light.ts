import reference from './data/milky-way.json';

// A density field, not a photograph or a catalog of individual stars. Channels
// hold sqrt(old disk), sqrt(young arms), dust, and faint emission regions.
export const HOME_FIELD_SIZE=512;
export const HOME_EXTENT_RE=4.5;
export const HOME_RAY_STEPS=64;
const phase=Math.PI-reference.barAngleDeg*Math.PI/180;
const bar=reference.barHalfLengthMpc/reference.radiusMpc;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function hash(x:number,y:number){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^20260911;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295}
function noise(x:number,y:number){
  const ix=Math.floor(x),iy=Math.floor(y),u=smooth(0,1,x-ix),v=smooth(0,1,y-iy);
  const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
const ridge=(angle:number,width:number)=>Math.exp(-.5*(Math.atan2(Math.sin(angle),Math.cos(angle))/width)**2);

export function milkyWayDensityField(size=HOME_FIELD_SIZE){
  const data=new Uint8Array(size*size*4),winding=1/Math.tan(14*Math.PI/180);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=((x+.5)/size*2-1)*HOME_EXTENT_RE,py=((y+.5)/size*2-1)*HOME_EXTENT_RE,r=Math.hypot(px,py);
    const edge=1-smooth(3.5,HOME_EXTENT_RE,r);if(!edge)continue;
    const coarse=noise(px*3.1+7,py*3.1-4),fine=noise(px*18-9,py*18+2),grain=noise(px*65,py*65);
    const cloud=.5*coarse+.3*fine+.2*grain;
    const theta=Math.atan2(py,px),spiral=phase+winding*Math.log(Math.max(r,bar)/bar);
    const bend=.42*(coarse-.5)+.1*(fine-.5)+.07*Math.sin(r*7+theta*3);
    const width=.23+.1/Math.max(1,r);
    let arms=0,dust=0;
    // Two stronger stellar arms and two fainter, broken secondary arms. These
    // are illustrative paths, not a fit to individual Milky Way arm tracers.
    for(let arm=0;arm<4;arm++){
      const strength=arm%2===0?1:.48+.16*Math.sin(r*7+arm);
      const offset=theta-spiral-arm*Math.PI/2+bend+.07*Math.sin(r*4+arm*1.7);
      arms+=strength*ridge(offset,width);
      dust+=strength*(ridge(offset+.19,width*.25)+.55*ridge(offset+.34+.07*fine,width*.14));
    }
    // A short local spur near the Sun (negative model X), not an extra ring.
    const spur=theta-Math.PI-winding*Math.log(Math.max(r,.1)/(reference.observerDistanceMpc/reference.radiusMpc));
    arms+=.32*ridge(spur,.12)*Math.exp(-(((r-1.86)/.4)**2));
    const onset=smooth(.78,1.3,r),outer=Math.exp(-.8*r)*edge;
    const old=Math.exp(-1.67834699*r)*edge*(.7+.6*cloud);
    const young=outer*onset*(.24+.76*arms)*(.24+1.45*cloud);
    const filaments=Math.pow(1-Math.abs(2*noise(px*11+coarse*2,py*11)-1),9);
    const dustDensity=smooth(.4,1.2,r)*edge*Math.exp(-.22*r)*(.1+1.65*dust+.5*filaments)*(.15+1.65*cloud);
    const emission=young*smooth(.64,.84,fine)*smooth(.5,.8,grain)*.65;
    const i=(y*size+x)*4;
    data[i]=Math.round(Math.sqrt(old)*255);data[i+1]=Math.round(Math.sqrt(Math.min(1,young))*255);
    data[i+2]=Math.round(Math.min(1,dustDensity)*255);data[i+3]=Math.round(Math.min(1,emission)*255);
  }
  return data;
}

/** One bounded emission/absorption volume. Texture lookup replaces per-frame
 * procedural noise; the ray starts at the camera even when inside the disk. */
export const milkyWayFragment=`precision highp float;
in vec2 vNdc;
uniform mat3 uToModel;
uniform vec3 uOrigin,uForward,uRight,uUp;
uniform vec2 uProjection,uBarDirection;
uniform float uMix,uThickness,uBarRadius,uDustStrength;
uniform sampler2D uDensity;
out vec4 fragColor;
const float EXTENT=${HOME_EXTENT_RE.toFixed(1)};
// Integrate each thin vertical layer exactly across a ray cell. Midpoint-only
// sampling aliases into bands as an inclined camera crosses the dust plane.
float column(float z0,float z1,float height,float rayZ,float stepSize){
  if(abs(rayZ)<1e-5)return exp(-abs((z0+z1)*.5)/height)*stepSize/(2.*height);
  float integral=z0*z1<0.?2.-exp(-abs(z0)/height)-exp(-abs(z1)/height):
    exp(-min(abs(z0),abs(z1))/height)*(1.-exp(-abs(z1-z0)/height));
  return integral/(2.*abs(rayZ));
}
void main(){
  vec3 origin=uOrigin*vec3(1.,1.,uThickness);
  vec3 ray=normalize((uToModel*normalize(uForward+vNdc.x*uProjection.x*uRight+vNdc.y*uProjection.y*uUp))*vec3(1.,1.,uThickness));
  // Finite slab plus radial cylinder, including parallel rays and inside views.
  vec3 inv=vec3(ray.x<0.?-1.:1.,ray.y<0.?-1.:1.,ray.z<0.?-1.:1.)/max(abs(ray),vec3(1e-7));
  vec3 a=(-vec3(EXTENT,EXTENT,.8)-origin)*inv,b=(vec3(EXTENT,EXTENT,.8)-origin)*inv;
  vec3 lo=min(a,b),hi=max(a,b);
  float entry=max(0.,max(lo.x,max(lo.y,lo.z))),exit=min(hi.x,min(hi.y,hi.z));
  float qa=dot(ray.xy,ray.xy),qb=dot(origin.xy,ray.xy),qc=dot(origin.xy,origin.xy)-EXTENT*EXTENT;
  if(qa>1e-8){float disc=qb*qb-qa*qc;if(disc<0.)discard;float root=sqrt(disc);entry=max(entry,(-qb-root)/qa);exit=min(exit,(-qb+root)/qa);}
  else if(qc>0.)discard;
  if(exit<=entry)discard;
  float stepSize=(exit-entry)/float(${HOME_RAY_STEPS});
  vec3 light=vec3(0.),transmission=vec3(1.);
  for(int i=0;i<${HOME_RAY_STEPS};i++){
    vec3 p=origin+ray*(entry+(float(i)+.5)*stepSize);
    float r=length(p.xy),z=abs(p.z);
    float z0=p.z-ray.z*stepSize*.5,z1=p.z+ray.z*stepSize*.5;
    // Filter both the screen footprint and the distance traversed in this cell.
    // Otherwise high-frequency dust aliases into a grid in inclined views.
    float footprint=max(length(ray.xy)*stepSize,max(length(dFdx(p.xy)),length(dFdy(p.xy))));
    float lod=log2(max(1.,footprint*float(${HOME_FIELD_SIZE})/(EXTENT*2.)));
    vec4 field=textureLod(uDensity,p.xy/(EXTENT*2.)+.5,lod);
    vec2 disk=field.rg*field.rg;
    float old=disk.r*column(z0,z1,.065,ray.z,stepSize);
    float young=disk.g*column(z0,z1,.028,ray.z,stepSize);
    vec2 barPos=vec2(dot(p.xy,uBarDirection),dot(p.xy,vec2(-uBarDirection.y,uBarDirection.x)));
    float barEnd=1.-smoothstep(.75,1.,abs(barPos.x)/uBarRadius);
    float barLight=.15*exp(-2.*pow(barPos.x/uBarRadius,2.)-2.*pow(barPos.y/.23,2.))*barEnd*column(z0,z1,.055,ray.z,stepSize);
    // Smooth box/peanut center blends into the long bar, with no bright knots.
    float bulgeHeight=.13+.055*exp(-pow((abs(barPos.x)-.35)/.2,2.));
    float bulgeRadius=length(vec3(barPos.x/.55,barPos.y/.27,p.z/bulgeHeight));
    float bulge=3.8*exp(-2.3*bulgeRadius)*stepSize;
    vec3 diskColor=mix(vec3(.83,.76,.65),vec3(.63,.70,.81),smoothstep(.5,2.8,r));
    vec3 emission=old*1.25*diskColor+young*.85*vec3(.62,.70,.82)+(barLight+bulge)*vec3(1.,.86,.66);
    emission+=field.a*column(z0,z1,.025,ray.z,stepSize)*vec3(.6,.24,.3);
    float dust=field.b*column(z0,z1,.019,ray.z,stepSize)*uDustStrength;
    // Greater blue extinction gives warm dust edges without orange glow.
    vec3 opticalDepth=dust*vec3(.72,.95,1.3);
    vec3 through=exp(-opticalDepth);
    light+=transmission*emission*(1.-through+1e-5)/(opticalDepth+1e-5);
    transmission*=through;
  }
  // Fixed exposure with a shoulder: the core retains color at every angle.
  vec3 color=.94*(1.-exp(-light*1.65));
  float opacity=1.-dot(transmission,vec3(.2126,.7152,.0722));
  if(max(color.r,max(color.g,color.b))<.0001&&opacity<.0001)discard;
  fragColor=vec4(color*uMix,opacity*uMix);
}`;
