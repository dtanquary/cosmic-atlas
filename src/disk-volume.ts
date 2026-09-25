/** The home galaxy's continuous stellar/dust march: forward rays, finite extent,
 * exact vertical integration and filtered detail at grazing angles. Defines
 * diskMarch(origin, ray) in model units, returning premultiplied light and
 * opacity, or a negative opacity outside the volume. It relies on the look
 * shader's column() and uniforms. */
export function diskMarch({size,steps,extent,center,emission}:{size:number;steps:number;extent:number;center:string;emission:string}){
return `uniform vec2 uBarDirection;
uniform float uBarRadius;
uniform sampler2D uDensity;
vec4 diskMarch(vec3 origin,vec3 ray){
  const float EXTENT=${extent.toFixed(1)};
  // Finite slab plus radial cylinder, including parallel rays and inside views.
  vec3 inv=vec3(ray.x<0.?-1.:1.,ray.y<0.?-1.:1.,ray.z<0.?-1.:1.)/max(abs(ray),vec3(1e-7));
  vec3 a=(-vec3(EXTENT,EXTENT,.8)-origin)*inv,b=(vec3(EXTENT,EXTENT,.8)-origin)*inv;
  vec3 lo=min(a,b),hi=max(a,b);
  float entry=max(0.,max(lo.x,max(lo.y,lo.z))),exit=min(hi.x,min(hi.y,hi.z));
  float qa=dot(ray.xy,ray.xy),qb=dot(origin.xy,ray.xy),qc=dot(origin.xy,origin.xy)-EXTENT*EXTENT;
  if(qa>1e-8){float disc=qb*qb-qa*qc;if(disc<0.)return vec4(0.,0.,0.,-1.);float root=sqrt(disc);entry=max(entry,(-qb-root)/qa);exit=min(exit,(-qb+root)/qa);}
  else if(qc>0.)return vec4(0.,0.,0.,-1.);
  if(exit<=entry)return vec4(0.,0.,0.,-1.);
  float stepSize=(exit-entry)/float(${steps});
  vec3 light=vec3(0.),transmission=vec3(1.);
  for(int i=0;i<${steps};i++){
    vec3 p=origin+ray*(entry+(float(i)+.5)*stepSize);
    float r=length(p.xy),z=abs(p.z);
    float z0=p.z-ray.z*stepSize*.5,z1=p.z+ray.z*stepSize*.5;
    // Filter both the screen footprint and the distance traversed in this cell.
    // Otherwise high-frequency dust aliases into a grid in inclined views.
    float footprint=max(length(ray.xy)*stepSize,max(length(dFdx(p.xy)),length(dFdy(p.xy))));
    float lod=log2(max(1.,footprint*float(${size})/(EXTENT*2.)));
    vec4 field=textureLod(uDensity,p.xy/(EXTENT*2.)+.5,lod);
    vec2 disk=field.rg*field.rg;
    float old=disk.r*column(z0,z1,.065,ray.z,stepSize);
    float young=disk.g*column(z0,z1,.028,ray.z,stepSize);
${center}
${emission}    emission+=field.a*column(z0,z1,.025,ray.z,stepSize)*vec3(.6,.24,.3);
    float dust=field.b*column(z0,z1,.019,ray.z,stepSize)*uDustStrength;
    // Greater blue extinction gives warm dust edges without orange glow.
    vec3 opticalDepth=dust*vec3(.72,.95,1.3);
    vec3 through=exp(-opticalDepth);
    light+=transmission*emission*(1.-through+1e-5)/(opticalDepth+1e-5);
    transmission*=through;
  }
  // Fixed exposure with a shoulder: the core retains color at every angle.
  return vec4(.94*(1.-exp(-light*1.65)),1.-dot(transmission,vec3(.2126,.7152,.0722)));
}`;
}
