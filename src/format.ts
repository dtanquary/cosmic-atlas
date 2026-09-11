import type { Galaxy, Vec3 } from './types';
export const MLY_PER_MPC = 3.2615637771674333;
export type Units = 'ly' | 'Mpc';
export function formatDistance(mpc: number, units: Units = 'ly', precision = 3): string {
  if (!Number.isFinite(mpc) || mpc < 0) return 'Unavailable';
  if (units === 'Mpc') return `${mpc.toLocaleString('en-US', { maximumSignificantDigits: precision })} Mpc`;
  const ly = mpc * MLY_PER_MPC * 1e6;
  const [scale, label] = ly >= 1e9 ? [1e9, 'billion ly'] : ly >= 1e6 ? [1e6, 'million ly'] : ly >= 1e3 ? [1e3, 'thousand ly'] : [1, 'ly'];
  return `${(ly / (scale as number)).toLocaleString('en-US', { maximumSignificantDigits: precision })} ${label}`;
}
export function cartesian(ra: number, dec: number, distance: number): Vec3 {
  const a = ra * Math.PI / 180, d = dec * Math.PI / 180;
  return [distance * Math.cos(d) * Math.cos(a), distance * Math.cos(d) * Math.sin(a), distance * Math.sin(d)];
}
export function separation(a: Vec3, b: Vec3): number { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); }
export function validateBinary(buffer: ArrayBuffer, kind: 'points' | 'metadata' | 'profiles', expectedCount?: number): number {
  if(buffer.byteLength < 16) throw new Error('Truncated data header');
  const view = new DataView(buffer), count = view.getUint32(8, true);
  if(view.getUint32(0,true) !== (kind === 'points' ? 0x43415431 : kind==='profiles'?0x43415331:0x43414d31) || view.getUint32(4,true) !== 1) throw new Error('Unsupported data format');
  if(count > 65536 || (expectedCount !== undefined && count !== expectedCount) || buffer.byteLength !== 16+count*(kind==='points'?16:kind==='profiles'?20:56)) throw new Error('Data length does not match manifest');
  return count;
}
export function decodeGalaxy(buffer: ArrayBuffer, row: number, id: number): Galaxy {
  const count = validateBinary(buffer, 'metadata');
  if(!Number.isInteger(row) || row < 0 || row >= count) throw new Error('Invalid object reference');
  const view = new DataView(buffer), p = 16+row*56;
  const ra = view.getFloat64(p+8,true), dec=view.getFloat64(p+16,true), z=view.getFloat64(p+24,true), distance=view.getFloat64(p+40,true);
  if(!Number.isFinite(ra+dec+z+distance) || distance<=0) throw new Error('Invalid galaxy measurements');
  return {id,targetId:view.getBigInt64(p,true).toString(),ra,dec,z,zerr:view.getFloat64(p+32,true),distance,delta:view.getFloat64(p+48,true),position:cartesian(ra,dec,distance)};
}
export function niceScale(maximum: number): number {
  if(!Number.isFinite(maximum)||maximum<=0)return 1;
  const power=10**Math.floor(Math.log10(maximum));
  return [5,2,1].find(v=>v*power<=maximum)!*power;
}
