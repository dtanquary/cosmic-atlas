import data from './data/photos.json';
import type {TourStop} from './tour';
import type {ViewState} from './view-link';
import type {Vec3} from './types';
export interface Photograph{
 key:string;identity:string;title:string;source:string;download:string;credit:string;license:string;rights:string;note:string;
 fovArcmin:number[]|null;northClockwiseDeg:number|null;asset:string;bytes:number;sha256:string;width:number;height:number;
 match?:{raDeg:number;decDeg:number;fits:string;projection:string[];cdDegPerPixel:number[];referencePixel:number[]};
}
export const photographs=data.photos as Photograph[];
export const PHOTO_MAX_BYTES=data.maxEncodedBytes,PHOTO_MAX_DECODED=data.maxDecodedBytes;
const named:Record<string,string>={'NGC 3982':'39633325333155389','NGC 4026':'39633263488141603'};
export function photosForStop(stop:TourStop|null):Photograph[]{
 if(!stop)return [];
 if(stop.id==='andromeda-companions')return photographs.filter(p=>['nearby:m32','nearby:m110'].includes(p.identity));
 const target=stop.target,key=target.kind==='sun'||target.kind==='core'?'core':target.kind==='nearby'?`nearby:${target.key}`:target.kind==='catalog'?named[target.name!]:target.kind==='cluster'?`cluster:${target.key}`:null;
 return photographs.filter(p=>p.identity===key);
}
export function photosForIdentity(identity:string|null){return photographs.filter(p=>p.identity===(identity==='sun'?'core':identity))}
/** Observer-facing, with the calibrated photograph's vertical angular field. The atlas can have a different aspect ratio. */
export function matchedPhotoView(photo:Photograph,state:ViewState,verticalFovDegrees:number):ViewState|null{
 const identity=state.identity,publicId=typeof identity==='object'?identity?.targetId:identity;
 if(!photo.match||!photo.fovArcmin||publicId!==photo.identity||!(verticalFovDegrees>0&&verticalFovDegrees<180))return null;
 const distance=Math.hypot(...state.target);if(!(distance>0))return null;
 const viewDistance=distance*Math.tan(photo.fovArcmin[1]*Math.PI/(180*60*2))/Math.tan(verticalFovDegrees*Math.PI/360);
 return {...state,camera:state.target.map(v=>v*(1-viewDistance/distance)) as Vec3};
}
