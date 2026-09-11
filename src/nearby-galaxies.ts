import {ResolvedGalaxy,type GalaxyDetailData,type GalaxyFamily} from './galaxy-detail';
import {cartesian} from './format';
import reference from './data/nearby-galaxies.json';

export const nearbyReference=reference;
export function nearbyDetails():GalaxyDetailData[]{
 if(reference.entries.length>12||new Set(reference.entries.map(e=>e.id)).size!==reference.entries.length||reference.entries.some(e=>!Number.isInteger(e.id)||e.id>=0))throw new Error('Invalid nearby layer: use up to 12 distinct negative internal IDs.');
 return reference.entries.map(entry=>({
  version:1,catalogId:'nearby',catalogSourceSha256:reference.source.excerptSha256,name:entry.name,
  galaxy:{id:entry.id,targetId:`nearby:${entry.key}`,ra:entry.raDeg,dec:entry.decDeg,z:null,zerr:null,delta:null,distance:entry.distanceMpc,position:cartesian(entry.raDeg,entry.decDeg,entry.distanceMpc),
   nearby:{key:entry.key,name:entry.name,aliases:entry.aliases,method:entry.method,distanceError:entry.distanceError,distanceSource:entry.distanceSource,shapeNote:entry.shapeNote,shapeSources:entry.shapeSources,orientationMeasured:entry.orientationMeasured}},
  shape:{radiusArcsec:entry.radiusArcsec,e1:entry.e1,e2:entry.e2,sersic:entry.family==='elliptical'?2:1,profileType:'adopted-local'},
  gaussians:entry.gaussians,fitMaxRelativeError:entry.profileFitMaxRelativeError,
  model:{family:entry.family as GalaxyFamily,typeSource:entry.family==='irregular'?'proxy':'catalog',typeLabel:entry.typeLabel,shapeMeasured:entry.shapeMeasured,sourceName:'Nearby-galaxy literature',profileIndex:0},
  spiral:entry.family==='spiral'?{arms:2,pitchDegrees:entry.key==='m31'?12:20,phaseRadians:.4,seed:100-entry.id}:undefined,knotCount:12000,
 }));
}
export function createNearbyGalaxies(){return nearbyDetails().map(data=>new ResolvedGalaxy(data))}
