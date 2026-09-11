/** Display safeguard for the current redshift-only catalogs, not a reliability boundary. */
export const LOCAL_REDSHIFT_GUARD_MPC=1;
export function uncertainLocalDistance(distanceMpc:number){
 return Number.isFinite(distanceMpc)&&distanceMpc>=0&&distanceMpc<LOCAL_REDSHIFT_GUARD_MPC;
}
