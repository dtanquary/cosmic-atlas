import type {Vec3} from './types';

/** What the view is looking at; DESI identities keep the exact 64-bit target ID as a string. The dense id is derived from data, never trusted from a link. */
export type ViewIdentity='sun'|'core'|`nearby:${string}`|{node:string;row:number;targetId:string}|null;
export interface ViewState{target:Vec3;camera:Vec3;identity:ViewIdentity}

const NUMBER=/^-?\d+(\.\d+)?(e-?\d+)?$/i;
const IDENTITY=/^(sun|core|nearby:[a-z0-9]{1,16}|desi:(\d{1,6}):(\d{1,5}):(-?\d{1,20}))$/;
const inRange=(v:number)=>Math.abs(v)<1e6;
const num=(v:number)=>`${+v.toPrecision(12)}`;

/** `#t=x,y,z&c=dx,dy,dz[&g=identity]`; `c` is the camera relative to the target so close orbits survive 12 digits. Null when a value is non-finite or beyond 1e6 Mpc. */
export function encodeView(state:ViewState):string|null{
  const offset=state.camera.map((v,i)=>v-state.target[i]);
  if(![...state.target,...offset].every(inRange))return null;
  const g=state.identity===null?'':typeof state.identity==='string'?state.identity:`desi:${state.identity.node}:${state.identity.row}:${state.identity.targetId}`;
  return `#t=${state.target.map(num).join(',')}&c=${offset.map(num).join(',')}${g&&`&g=${g}`}`;
}

/** Returns null for anything outside the grammar; never throws. Unknown keys are ignored, duplicates use the first. */
export function decodeView(hash:string):ViewState|null{
  const params=new URLSearchParams(hash.replace(/^#/,''));
  const triple=(key:string):Vec3|null=>{
    const parts=(params.get(key)??'').split(',');
    if(parts.length!==3||!parts.every(p=>NUMBER.test(p)))return null;
    const values=parts.map(Number);
    return values.every(inRange)?values as Vec3:null;
  };
  const target=triple('t'),offset=triple('c'),g=params.get('g'),match=g===null?null:IDENTITY.exec(g);
  if(!target||!offset||(g!==null&&!match))return null;
  const identity:ViewIdentity=!match?null:match[2]!==undefined?{node:match[2],row:Number(match[3]),targetId:match[4]}:match[1] as 'sun'|'core'|`nearby:${string}`;
  return {target,camera:target.map((v,i)=>v+offset[i]) as Vec3,identity};
}

/** A tour invitation carries no camera/selection and always starts at stop one. */
export const ROAD_TRIP_HASH='#tour=road-trip';
export function decodeTourLink(hash:string):'road-trip'|null{
  return hash===ROAD_TRIP_HASH?'road-trip':null;
}
