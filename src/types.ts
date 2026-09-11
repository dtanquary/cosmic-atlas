export type Vec3 = [number, number, number];
export interface Asset { url: string; bytes: number; decodedBytes: number; sha256: string }
export interface SpatialNode {
  id: string; count: number; storedCount: number; center: Vec3; min: Vec3; max: Vec3;
  children: string[]; points: Asset; metadata: Asset;
}
export interface Manifest {
  version: 1; id: string; title: string; count: number; subset: string | null;
  root: string; nodes: SpatialNode[]; units: 'Mpc'; coordinateSystem: string;
  source: { url: string; sha256: string; acceptedRows: number; examinedRows: number; sourceRows: number; maxDistanceInterpolationErrorMpc: number };
  maxDistanceMpc: number; maxRedshift: number; totalCompressedBytes: number;
  cosmology: { name: string; H0: number; Om0: number }; filters: string[];
}
export interface Galaxy {
  id: number; targetId: string; ra: number; dec: number; z: number | null; zerr: number | null;
  distance: number; delta: number | null; position: Vec3;
  /** Present only for the separately sourced nearby layer; negative IDs are internal, never DESI IDs. */
  nearby?: {key:string;name:string;aliases:string[];method:string;distanceError:string;distanceSource:string;shapeNote:string;shapeSources:string[];orientationMeasured:boolean};
}
