/** Display recipes sharing one disk profile, radial distribution and light budget. */
export const galaxyVariants=[
 {key:'classic',label:'Classic spiral',arms:2,pitchDegrees:20},
 {key:'multi',label:'Fine multi-arm spiral',arms:4,pitchDegrees:22},
 {key:'ringed',label:'Ringed spiral disk',arms:2,pitchDegrees:20,innerStyle:'ring'},
 {key:'tight',label:'Tightly wound spiral',arms:2,pitchDegrees:12},
 {key:'feathered',label:'Feathered spiral',arms:3,pitchDegrees:26,armStyle:'feathered'},
] as const;
export type GalaxyVariant=typeof galaxyVariants[number];

/** Independent of color, dense row indices, camera position and source classification. */
export function galaxyVariant(identity:string){
 let seed=2166136261;
 for(const c of `spiral:${identity}`)seed=Math.imul(seed^c.charCodeAt(0),16777619);
 seed^=seed>>>16;seed=Math.imul(seed,0x7feb352d);seed^=seed>>>15;seed=Math.imul(seed,0x846ca68b);seed=(seed^(seed>>>16))>>>0;
 const fraction=seed/4294967296;
 // Named illustrations are deliberate display recipes, not morphology fits.
 // Exact public IDs keep the same destination stable in subsets and both tours.
 const named:Record<string,number>={'nearby:m31':3,'nearby:m33':4,'39633325333155389':1};
 const variant=galaxyVariants[named[identity]??(fraction<.4?0:fraction<.65?1:fraction<.8?2:fraction<.9?3:4)];
 return {variant,parameters:{...variant,seed,phaseRadians:(Math.imul(seed,2654435761)>>>0)/4294967296*Math.PI*2}};
}
