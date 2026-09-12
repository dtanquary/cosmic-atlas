import reference from './data/lookback.json';
import {MLY_PER_MPC} from './format';
import {CMB_RADIUS_MPC} from './cosmic-scale';

export const lookbackReference=reference;
const {comovingMpc,lookbackGyr}=reference.table;
const last=comovingMpc.length-1;

/** Light travel time for a directly measured distance: distance ÷ c, in Gyr. */
export function lightTravelGyr(mpc:number){return mpc*MLY_PER_MPC/1000}

/** Planck18 lookback time for a present-day comoving distance from the observer. */
export function lookbackForDistance(mpc:number){
  if(!Number.isFinite(mpc)||mpc<0)return NaN;
  if(mpc<comovingMpc[0])return lightTravelGyr(mpc); // Exact to ~1e-4 below the first row.
  if(mpc>=CMB_RADIUS_MPC)return lookbackGyr[last];
  let low=0,high=last;
  while(high-low>1){const mid=(low+high)>>1;if(comovingMpc[mid]<=mpc)low=mid;else high=mid}
  const t=(mpc-comovingMpc[low])/(comovingMpc[high]-comovingMpc[low]);
  return lookbackGyr[low]+t*(lookbackGyr[high]-lookbackGyr[low]);
}

export function formatLookback(gyr:number){
  if(!Number.isFinite(gyr)||gyr<0)return 'Unavailable';
  const years=gyr*1e9,[scale,label]=years>=1e9?[1e9,'billion years']:years>=1e6?[1e6,'million years']:[1,'years'];
  return `${(years/scale).toLocaleString('en-US',{maximumSignificantDigits:3})} ${label}`;
}

export interface LookbackRing {lookbackGyr:number;comovingMpc:number;angle:number}

/** Rings visible from a camera at distance d from the observer: at most 8, ascending, projected ≥28 px apart. */
export function chooseRings(dOriginMpc:number,fovDeg:number,aspect:number,heightPx:number):LookbackRing[]{
  if(!Number.isFinite(dOriginMpc)||dOriginMpc<=0)return [];
  const tanHalf=Math.tan(fovDeg*Math.PI/360),maxAngle=Math.atan(tanHalf*Math.sqrt(1+aspect*aspect)),minAngle=Math.PI/180;
  const pixels=(angle:number)=>Math.tan(angle)/tanHalf*heightPx/2;
  const kept:LookbackRing[]=[];
  // Largest lookback first, so culling drops the crowded inner rings.
  for(let i=reference.rings.length-1;i>=0&&kept.length<8;i--){
    const ring=reference.rings[i];if(ring.comovingMpc>=dOriginMpc)continue;
    const angle=Math.asin(ring.comovingMpc/dOriginMpc);
    if(angle<minAngle||angle>maxAngle)continue;
    // ponytail: fixed 28 px ring spacing stands in for label collision layout; add rect-based culling if oblique views overlap
    if(kept.length&&pixels(kept[kept.length-1].angle)-pixels(angle)<28)continue;
    kept.push({lookbackGyr:ring.lookbackGyr,comovingMpc:ring.comovingMpc,angle});
  }
  return kept.reverse();
}
