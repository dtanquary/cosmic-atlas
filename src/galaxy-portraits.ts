import type {GalaxyLookKey} from './galaxy-looks';

export interface GalaxyPortrait {label:string;source:string;look?:GalaxyLookKey;smooth?:'elliptical'|'lenticular';exposure?:number}
// Image interpretation is keyed only to verified public identities. Coordinates,
// profile sidecars and classifications are never rewritten by this registry.
const portraits:ReadonlyMap<string,GalaxyPortrait>=new Map([
 ['nearby:m31',{label:'Andromeda · dust-ring disk',look:'m31',source:'https://esahubble.org/images/heic2501a/'}],
 ['nearby:m33',{label:'Triangulum · patchy spiral',look:'m33',source:'https://www.eso.org/public/images/eso1424a/'}],
 ['39633325333155389',{label:'NGC 3982 · intricate spiral',look:'ngc3982',source:'https://esahubble.org/images/opo1036a/'}],
 ['nearby:m32',{label:'M32 · compact elliptical',smooth:'elliptical',exposure:8,source:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-32/'}],
 ['nearby:m110',{label:'M110 · diffuse elliptical',smooth:'elliptical',exposure:6,source:'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-110/'}],
 ['39633263488141603',{label:'NGC 4026 · smooth lenticular',smooth:'lenticular',source:'https://www.legacysurvey.org/viewer?ra=179.8544868&dec=50.9616574&layer=ls-dr9&zoom=14'}],
 ['nearby:lmc',{label:'Large Magellanic Cloud · stellar bar',source:'https://noirlab.edu/public/images/noirlab2030a/'}],
 ['nearby:smc',{label:'Small Magellanic Cloud · diffuse wing',source:'https://noirlab.edu/public/images/noirlab2030b/'}],
]);
export const galaxyPortrait=(identity:string)=>portraits.get(identity);
