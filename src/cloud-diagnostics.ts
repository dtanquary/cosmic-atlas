import type * as THREE from 'three';
import {nearbyDetails} from './nearby-galaxies';
import {probeVolumes} from './volume-diagnostics';
export function probeCloudModels(renderer:THREE.WebGLRenderer,preview?:HTMLElement){
 return probeVolumes(renderer,nearbyDetails().filter(data=>data.cloud),{calls:2,maxBytes:672000},preview);
}
