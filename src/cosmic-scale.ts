import reference from './data/cosmic-horizon.json';

export const cosmicHorizonReference=reference;
export const CMB_RADIUS_MPC=reference.radiusMpc;

/** Radial reach only: neither survey volume nor galaxy census completeness. */
export function catalogRadialReach(maxDistanceMpc:number){
  return Number.isFinite(maxDistanceMpc)&&maxDistanceMpc>=0?maxDistanceMpc/CMB_RADIUS_MPC:null;
}
