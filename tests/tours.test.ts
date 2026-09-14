import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {cartesian,formatDistance,separation} from '../src/format';
import {formatLookback,lookbackForDistance,lookbackReference} from '../src/lookback';
import {CMB_RADIUS_MPC} from '../src/cosmic-scale';
import {nearbyReference} from '../src/nearby-galaxies';
import {tours,type StopKind,type TourStop} from '../src/tour';
import milkyWay from '../src/data/milky-way.json';
import type {NameIndex} from '../src/galaxy-search';

const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const index:NameIndex=read('../public/data/galaxy-search.json'),manifest=read('../public/data/dr1/manifest.json'),sources=read('../src/data/tour-sources.json');
const stops=tours.flatMap(tour=>tour.stops),kinds:StopKind[]=['sun','core','localgroup','overview','cmb','nearby','catalog','cluster'];
const nearby=new Map(nearbyReference.entries.map(entry=>[entry.key,entry]));
const zoomOut=tours.find(tour=>tour.key==='zoom-out')!,roadTrip=tours.find(tour=>tour.key==='road-trip')!;
const two=(value:number)=>Number(value.toPrecision(2));
const sig=(value:number,digits:number)=>Number(value.toPrecision(digits)).toLocaleString('en-US');
// Framing constants mirror Explorer.reset (2.1 × the root half-diagonal) and Explorer.viewCosmicHorizon (50° field, aspect 1,
// 14% margin) and must move together with them.
const halfFov=25*Math.PI/180,frame=(radius:number)=>radius/Math.sin(halfFov)*1.14,OVERVIEW_FACTOR=2.1;

/** The distance each caption is about, taken from the data it must agree with; the Sun cites none. */
function citedDistance(stop:TourStop):number|null{
  switch(stop.target.kind){
    case 'sun':return null;
    case 'core':return milkyWay.observerDistanceMpc;
    case 'localgroup':case 'nearby':return nearby.get(stop.cites??stop.target.key!)!.distanceMpc;
    case 'overview':return manifest.maxDistanceMpc;
    case 'cmb':return CMB_RADIUS_MPC;
    case 'catalog':return index.entries.find(entry=>entry.name===stop.target.name)!.distance!;
    case 'cluster':return Math.hypot(...stop.target.positionMpc!);
  }
}

describe('tour routes',()=>{
  it('keeps the schema: known kinds, positive timings, unique keys, short captions',()=>{
    expect(new Set(tours.map(tour=>tour.key)).size).toBe(tours.length);
    expect(tours.length).toBe(2);
    for(const tour of tours){
      expect(tour.title.length).toBeGreaterThan(0);expect(tour.summary.length).toBeGreaterThan(0);expect(tour.stops.length).toBeGreaterThan(1);
      expect(new Set(tour.stops.map(stop=>stop.id)).size).toBe(tour.stops.length);
      for(const stop of tour.stops){
        expect(stop.id).toMatch(/^[a-z][a-z0-9-]{0,31}$/);
        expect(stop.cue.length).toBeGreaterThan(0);expect(stop.cue.length).toBeLessThanOrEqual(110);
        expect(stop.cue).not.toMatch(/<|>|\{catalogCount\}|\b\d/); // numeric claims remain in the source-pinned explanation
        expect(kinds).toContain(stop.target.kind);
        expect(stop.title.length).toBeGreaterThan(0);
        expect(stop.travelSeconds).toBeGreaterThan(0);
        if(stop.dwellSeconds!==undefined)expect(stop.dwellSeconds).toBeGreaterThan(0);
        if(stop.distanceMpc!==undefined)expect(stop.distanceMpc).toBeGreaterThan(0);
        if(stop.target.kind==='nearby'||stop.target.kind==='cluster')expect(stop.target.key).toBeTruthy();
        if(stop.target.kind==='nearby')expect(nearby.has(stop.target.key!),stop.title).toBe(true);
        if(stop.target.kind==='catalog')expect(stop.target.name).toBeTruthy();
        if(stop.target.kind==='localgroup'||stop.target.kind==='cluster')expect(stop.target.positionMpc!.length).toBe(3);
        if(stop.cites!==undefined)expect(nearby.has(stop.cites)).toBe(true);
        expect(stop.caption.split(/[.!?](?=\s|$)/).filter(Boolean).length,stop.title).toBeLessThanOrEqual(2);
      }
    }
    expect(zoomOut.stops.map(stop=>stop.target.kind)).toEqual(['sun','core','localgroup','overview','cmb']);
    expect(roadTrip.stops.map(stop=>stop.target.kind)).toEqual(['core','nearby','nearby','nearby','nearby','nearby','catalog','catalog','cluster','overview']);
  });
  it('quotes each stop\'s distance and its lookback time from the source data',()=>{
    for(const stop of stops){
      const distance=citedDistance(stop);
      if(distance===null){expect(stop.target.kind).toBe('sun');expect(stop.caption).not.toMatch(/\d/);continue}
      const lookback=lookbackForDistance(distance),renderings=[formatLookback(two(lookback)),formatLookback(lookback)];
      expect(renderings.some(text=>stop.caption.includes(text)),`${stop.title}: ${renderings.join(' | ')}`).toBe(true);
      switch(stop.target.kind){
        case 'core':expect(stop.caption).toContain(`${sig(distance*1000,2)} kpc`);expect(stop.caption).toContain(`${stop.distanceMpc!*1000} kpc`);break;
        case 'localgroup':case 'nearby':expect(stop.caption).toContain(`${sig(distance*1000,3)} kpc`);break;
        case 'overview':expect(stop.caption).toContain(`${Math.round(distance).toLocaleString('en-US')} Mpc`);break;
        case 'cmb':expect(stop.caption).toContain(`${Math.round(distance).toLocaleString('en-US')} Mpc`);expect(stop.caption).toContain(formatDistance(distance,'ly'));break;
        default:expect(stop.caption).toContain(`${sig(distance,3)} Mpc`);
      }
    }
  });
  it('resolves every catalog stop by name to a verified visit destination',()=>{
    const catalog=stops.filter(stop=>stop.target.kind==='catalog');
    expect(catalog.length).toBe(2);
    for(const stop of catalog){
      const entry=index.entries.find(entry=>entry.name===stop.target.name)!;
      expect(entry,stop.title).toBeDefined();
      expect(entry.id).toBeGreaterThan(0);expect(entry.node).toMatch(/^\d+$/);expect(Number.isInteger(entry.row)).toBe(true);expect(entry.targetId).toMatch(/^\d+$/);
    }
  });
  it('frames the satellites around Andromeda and quotes M32 and M110 from their own measurements',()=>{
    const satellites=roadTrip.stops.find(stop=>stop.title==='M32 and M110')!;
    const at=(key:string)=>{const e=nearby.get(key)!;return cartesian(e.raDeg,e.decDeg,e.distanceMpc)};
    const reach=Math.max(separation(at('m31'),at('m32')),separation(at('m31'),at('m110')));
    expect(satellites.target.key).toBe('m31');expect(satellites.cites).toBe('m110');
    expect(satellites.distanceMpc!).toBeGreaterThanOrEqual(frame(reach));
    expect(satellites.distanceMpc!).toBeLessThan(frame(reach)*2);
    for(const key of ['m32','m110'])expect(satellites.caption).toContain(`${sig(nearby.get(key)!.distanceMpc*1000,3)} kpc`);
    expect(nearby.get('m32')!.distanceError).toContain('80 kpc');expect(satellites.caption).toContain('roughly 80 kpc');
    expect(satellites.caption).toMatch(/measured/);
  });
  it('frames the Local Group from the Sun–Andromeda midpoint with all six galaxies in view',()=>{
    const stop=zoomOut.stops.find(stop=>stop.target.kind==='localgroup')!,m31=nearby.get('m31')!;
    const midpoint=cartesian(m31.raDeg,m31.decDeg,m31.distanceMpc/2);
    stop.target.positionMpc!.forEach((value,i)=>expect(Math.abs(value-midpoint[i])).toBeLessThan(1e-12));
    const reach=Math.max(...nearbyReference.entries.map(e=>separation(cartesian(e.raDeg,e.decDeg,e.distanceMpc),midpoint)),separation([0,0,0],midpoint));
    expect(stop.distanceMpc!).toBeGreaterThanOrEqual(frame(reach));
    expect(stop.distanceMpc!).toBeLessThan(frame(reach)*2);
    expect(stop.cites).toBe('m31');
    expect(nearbyReference.entries.length).toBe(6);expect(stop.caption).toContain('Six nearby galaxies');
  });
  it('orders the zoom-out by strictly increasing framing distance',()=>{
    const root=manifest.nodes.find((node:{id:string})=>node.id===manifest.root);
    const overviewRadius=Math.hypot(...(root.max as number[]).map((value:number,i:number)=>value-root.min[i]))/2;
    const framing=zoomOut.stops.map(stop=>{
      switch(stop.target.kind){
        case 'overview':return overviewRadius*OVERVIEW_FACTOR;
        case 'cmb':return frame(CMB_RADIUS_MPC);
        default:return stop.distanceMpc!;
      }
    });
    expect(framing[0]).toBe(.003);expect(framing[1]).toBe(.06);
    for(let i=1;i<framing.length;i++)expect(framing[i],zoomOut.stops[i].title).toBeGreaterThan(framing[i-1]);
  });
  it('places the Coma cluster stop at its cited NED position on Planck18 axes with DESI rows around it',()=>{
    const stop=roadTrip.stops.find(stop=>stop.target.kind==='cluster')!,cluster=sources.clusters.find((c:{key:string})=>c.key===stop.target.key);
    expect(cluster.aliases).toContain('ABELL 1656');expect(cluster.redshiftRefCode).toBeTruthy();expect(cluster.positionRefCode).toBeTruthy();
    const distance=Math.hypot(...stop.target.positionMpc!),expected=cartesian(cluster.raDeg,cluster.decDeg,distance);
    stop.target.positionMpc!.forEach((value,i)=>expect(Math.abs(value-expected[i])).toBeLessThan(1e-9));
    // The distance must be Planck18 comoving at the cited redshift: interpolate the lookback table's redshift column.
    const {redshift,comovingMpc}=lookbackReference.table;let low=0;while(redshift[low+1]<cluster.redshift)low++;
    const t=(cluster.redshift-redshift[low])/(redshift[low+1]-redshift[low]),interpolated=comovingMpc[low]+t*(comovingMpc[low+1]-comovingMpc[low]);
    expect(Math.abs(interpolated-distance)/distance).toBeLessThan(1e-3);
    expect(cluster.desiMembers.count).toBeGreaterThanOrEqual(200);
    expect(cluster.desiMembers).toMatchObject({catalogId:manifest.id,catalogSourceSha256:manifest.source.sha256});
    expect(stop.caption).toContain(`z = ${two(cluster.redshift)}`);
    expect(stop.caption).toContain('Abell 1656');
  });
  it('discloses what is illustrative, assumed or only inferred at every stop',()=>{
    const required:Record<StopKind,RegExp[]>={
      sun:[/illustrative/,/not to scale/,/origin/],
      core:[/illustrative/,/adopted/],
      localgroup:[/independently measured/,/hidden by default/,/not as corrected/],
      overview:[/\{catalogCount\} accepted DESI DR1 observations in this dataset/,/inferred from redshift/,/not confirmed empty/],
      cmb:[/illustrative/,/approximate/,/comoving/,/1090/,/not a physical edge/],
      nearby:[/illustrative/,/measured|assumed/],
      catalog:[/measured redshift/,/illustrative|inferred/],
      cluster:[/redshift/,/line of sight/,/NED/,/rather than true membership/],
    };
    for(const stop of stops)for(const pattern of required[stop.target.kind])expect(stop.caption,`${stop.title} needs ${pattern}`).toMatch(pattern);
    for(const stop of stops.filter(stop=>stop.target.kind==='nearby')){
      const entry=nearby.get(stop.target.key!)!;
      if(!entry.shapeMeasured)expect(stop.caption,stop.title).toMatch(/assumed/);
      if(!entry.orientationMeasured)expect(stop.caption,stop.title).toMatch(/orientation is not measured/);
      if(!stop.cites&&/disk approximation/i.test(entry.shapeNote))expect(stop.caption,stop.title).toMatch(/single-disk/); // the satellites stop is about M32/M110, not the M31 disk
    }
    const lmc=nearby.get('lmc')!,lmcStop=roadTrip.stops.find(stop=>stop.target.key==='lmc')!;
    expect(lmc.shapeMeasured).toBe(false);expect(lmcStop.caption).toContain(`${lmc.radiusKpc} kpc size are assumed`);
  });
});
