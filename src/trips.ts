import {decodeView,encodeView} from './view-link';
import {tours,type TourData,type TourStop} from './tour';
export const MAX_TRIP_STOPS=10,MAX_SAVED_TRIPS=10,MAX_TRIP_FILE_BYTES=65536,MAX_TRIP_URL_BYTES=8192;
export interface PlaceStop{id:string;kind:'place';route:string;stop:string;note?:string}
export interface ViewStop{id:string;kind:'view';name:string;hash:string;note?:string}
export type TripStop=PlaceStop|ViewStop;
export interface Trip{version:1;title:string;stops:TripStop[]}
export interface SavedTrip{id:string;trip:Trip}
const key=/^[a-z0-9][a-z0-9-]{0,39}$/;
const bytes=(s:string)=>new TextEncoder().encode(s).length;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
const text=(v:unknown,max:number,empty=false):v is string=>typeof v==='string'&&(empty||v.trim().length>0)&&Array.from(v).length<=max&&!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
export function builtinStop(route:unknown,stop:unknown){return typeof route==='string'&&typeof stop==='string'?tours.find(t=>t.key===route)?.stops.find(s=>s.id===stop):undefined}
export function decodeStopLink(hash:string):{route:string;stop:string}|null{
 const match=/^#stop=1:([a-z0-9-]+):([a-z0-9-]+)$/.exec(hash);return match&&builtinStop(match[1],match[2])?{route:match[1],stop:match[2]}:null;
}
export function encodeStopLink(route:string,stop:string){return builtinStop(route,stop)?`#stop=1:${route}:${stop}`:null}
/** Untrusted input is normalized into fresh records; neither HTML nor arbitrary URL schemes enter a trip. */
export function validateTrip(value:unknown):Trip|null{
 if(!record(value)||!exact(value,['version','title','stops'])||value.version!==1||!text(value.title,60)||!Array.isArray(value.stops)||!value.stops.length||value.stops.length>MAX_TRIP_STOPS)return null;
 const stops:TripStop[]=[],ids=new Set<string>();
 for(const s of value.stops){
  if(!record(s)||typeof s.id!=='string'||!key.test(s.id)||ids.has(s.id)||s.note!==undefined&&!text(s.note,180,true))return null;ids.add(s.id);
  const base={id:s.id,...(s.note?{note:s.note as string}:{})};
  if(s.kind==='place'&&exact(s,['id','kind','route','stop','note'])&&builtinStop(s.route,s.stop))stops.push({...base,kind:'place',route:s.route as string,stop:s.stop as string});
  else if(s.kind==='view'&&exact(s,['id','kind','name','hash','note'])&&text(s.name,60)&&typeof s.hash==='string'&&s.hash.length<=512){
   const params=new URLSearchParams(s.hash.slice(1)),keys=[...params.keys()];
   if(!s.hash.startsWith('#t=')||keys.some(k=>!['t','c','g'].includes(k))||new Set(keys).size!==keys.length)return null;
   const view=decodeView(s.hash),hash=view&&encodeView(view);if(!hash)return null;stops.push({...base,kind:'view',name:s.name,hash});
  }else return null;
 }
 return {version:1,title:value.title,stops};
}
export function parseTripFile(value:string):Trip|null{if(bytes(value)>MAX_TRIP_FILE_BYTES)return null;try{return validateTrip(JSON.parse(value))}catch{return null}}
export function serializeTrip(trip:Trip){const valid=validateTrip(trip);return valid?JSON.stringify(valid,null,2):null}
export function encodeTripLink(trip:Trip):string|null{
 const valid=validateTrip(trip);if(!valid)return null;const data=new TextEncoder().encode(JSON.stringify(valid));
 let binary='';for(const b of data)binary+=String.fromCharCode(b);
 const hash='#trip=1.'+btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');return hash.length<=8000?hash:null;
}
export function decodeTripLink(hash:string):Trip|null{
 if(hash.length>8000||!/^#trip=1\.[A-Za-z0-9_-]+$/.test(hash))return null;
 try{const data=atob(hash.slice(8).replaceAll('-','+').replaceAll('_','/'));if(btoa(data).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')!==hash.slice(8))return null;const json=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(data,c=>c.charCodeAt(0)));return parseTripFile(json)}catch{return null}
}
export function tripHref(trip:Trip,base:string){const hash=encodeTripLink(trip);if(!hash)return null;const url=new URL(base);url.search='';url.hash=hash;return bytes(url.href)<=MAX_TRIP_URL_BYTES?url.href:null}
export function tripStopTitle(stop:TripStop){return stop.kind==='place'?builtinStop(stop.route,stop.stop)!.title:stop.name}
export function tripRoute(trip:Trip):TourData{
 return {key:'custom',title:trip.title,summary:'A shared itinerary',stops:trip.stops.map((s):TourStop=>s.kind==='place'?{...builtinStop(s.route,s.stop)!,id:s.id,sourceStop:{route:s.route,id:s.stop},note:s.note}:{id:s.id,title:s.name,caption:'A saved camera view. Any included galaxy identity is checked against this catalog; unavailable identities use the camera view alone.',cue:'Explore this saved perspective.',target:{kind:'view',view:decodeView(s.hash)!},travelSeconds:2.5,note:s.note})};
}
const STORAGE='atlas-custom-trips';
export function readTrips(storage:Pick<Storage,'getItem'>):SavedTrip[]{
 try{const raw=storage.getItem(STORAGE);if(!raw||raw.length>MAX_TRIP_FILE_BYTES*MAX_SAVED_TRIPS+1024)return [];const data=JSON.parse(raw);if(!record(data)||data.version!==1||!Array.isArray(data.trips)||data.trips.length>MAX_SAVED_TRIPS)return [];const out:SavedTrip[]=[];for(const item of data.trips){if(!record(item)||typeof item.id!=='string'||!key.test(item.id)||out.some(x=>x.id===item.id))return [];const trip=validateTrip(item.trip);if(!trip)return [];out.push({id:item.id,trip})}return out}catch{return []}
}
export function writeTrips(storage:Pick<Storage,'setItem'>,trips:SavedTrip[]):boolean{
 if(trips.length>MAX_SAVED_TRIPS||trips.some(t=>!key.test(t.id)||!validateTrip(t.trip))||new Set(trips.map(t=>t.id)).size!==trips.length)return false;
 try{storage.setItem(STORAGE,JSON.stringify({version:1,trips}));return true}catch{return false}
}
