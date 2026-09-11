/** Display recipes sharing one disk profile, radial distribution and light budget. */
export const galaxyVariants=[
 {key:'classic',label:'Classic spiral',arms:2,pitchDegrees:20},
 {key:'multi',label:'Fine multi-arm spiral',arms:4,pitchDegrees:22},
 {key:'ringed',label:'Ringed spiral disk',arms:2,pitchDegrees:20,innerStyle:'ring'},
] as const;
export type GalaxyVariant=typeof galaxyVariants[number];

/** Independent of color, dense row indices, camera position and source classification. */
export function galaxyVariant(identity:string){
 let seed=2166136261;
 for(const c of `spiral:${identity}`)seed=Math.imul(seed^c.charCodeAt(0),16777619);
 seed^=seed>>>16;seed=Math.imul(seed,0x7feb352d);seed^=seed>>>15;seed=Math.imul(seed,0x846ca68b);seed=(seed^(seed>>>16))>>>0;
 const fraction=seed/4294967296;
 // Keep the familiar two-arm recipe most common; the other styles are accents.
 const variant=galaxyVariants[fraction<.5?0:fraction<.8?1:2];
 return {variant,parameters:{...variant,seed,phaseRadians:(Math.imul(seed,2654435761)>>>0)/4294967296*Math.PI*2}};
}
