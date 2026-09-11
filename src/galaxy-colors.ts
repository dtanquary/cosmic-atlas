type RGB=[number,number,number];
export interface GalaxyColors {disk:RGB;core:RGB;emission:RGB;emissionFraction:number}

const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((value,i)=>value+(b[i]-value)*t) as RGB;
function luminance(rgb:RGB,value:number):RGB {
 const scale=value/(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722);
 return rgb.map(channel=>channel*scale) as RGB;
}

/** Plausible display colors, not measured photometry or inferred stellar ages. */
export function galaxyColors(identity:string):GalaxyColors {
 let state=2166136261;
 for(let i=0;i<identity.length;i++)state=Math.imul(state^identity.charCodeAt(i),16777619);
 const random=()=>{state=(state+0x6d2b79f5)|0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296};
 const warmth=.1+.8*random(),coreWarmth=warmth*.8+random()*.2;
 return {
  disk:luminance(mix([.50,.66,.83],[.76,.72,.64],warmth),.69),
  core:luminance(mix([.95,.91,.83],[1,.90,.72],coreWarmth),.88),
  emission:luminance([.86,.57,.64],.66),
  emissionFraction:.015+.02*random(),
 };
}
