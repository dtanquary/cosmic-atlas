import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {cartesian,formatDistance,separation} from '../src/format';
import {formatLookback,lightTravelGyr,lookbackForDistance,lookbackReference} from '../src/lookback';
import {CMB_RADIUS_MPC} from '../src/cosmic-scale';
import {nearbyReference} from '../src/nearby-galaxies';
import milkyWay from '../src/data/milky-way.json';
import type {NameIndex} from '../src/galaxy-search';

type Kind='sun'|'core'|'localgroup'|'overview'|'cmb'|'nearby'|'catalog'|'cluster';
interface Stop{
  title:string;caption:string;target:{kind:Kind;key?:string;name?:string;positionMpc?:number[];distanceMpc?:number};
  distanceMpc?:number;dwellSeconds:number;travelSeconds:number;
  factCheck?:{key?:string;distanceMpc:number;lookbackGyr:number;count?:number;redshift?:number;desiMembers?:{count:number;radiusDeg:number;redshiftWindow:number;catalogId:string;catalogSourceSha256:string}};
}
interface Tours{version:number;tours:{key:string;title:string;summary:string;stops:Stop[]}[]}
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const tours:Tours=read('../src/data/tours.json'),index:NameIndex=read('../public/data/galaxy-search.json'),manifest=read('../public/data/dr1/manifest.json');
const stops=tours.tours.flatMap(tour=>tour.stops),kinds:Kind[]=['sun','core','localgroup','overview','cmb','nearby','catalog','cluster'];
const nearby=new Map(nearbyReference.entries.map(entry=>[entry.key,entry]));
const zoomOut=tours.tours.find(tour=>tour.key==='zoom-out')!,roadTrip=tours.tours.find(tour=>tour.key==='road-trip')!;
const two=(value:number)=>Number(value.toPrecision(2));
const sig=(value:number,digits:number)=>Number(value.toPrecision(digits)).toLocaleString('en-US');
// The same 50° field, aspect 1 and 14% margin as Explorer.viewCosmicHorizon.
const halfFov=25*Math.PI/180,frame=(radius:number)=>radius/Math.sin(halfFov)*1.14;

describe('tour routes',()=>{
  it('keeps the schema: known kinds, positive timings, unique keys, short captions',()=>{
    expect(tours.version).toBe(1);
    expect(new Set(tours.tours.map(tour=>tour.key)).size).toBe(tours.tours.length);
    expect(tours.tours.length).toBe(2);
    for(const tour of tours.tours){
      expect(tour.title.length).toBeGreaterThan(0);expect(tour.summary.length).toBeGreaterThan(0);expect(tour.stops.length).toBeGreaterThan(1);
      for(const stop of tour.stops){
        expect(kinds).toContain(stop.target.kind);
        expect(stop.title.length).toBeGreaterThan(0);
        expect(stop.dwellSeconds).toBeGreaterThan(0);expect(stop.travelSeconds).toBeGreaterThan(0);
        if(stop.distanceMpc!==undefined)expect(stop.distanceMpc).toBeGreaterThan(0);
        if(stop.target.kind==='nearby'||stop.target.kind==='cluster')expect(stop.target.key).toBeTruthy();
        if(stop.target.kind==='catalog')expect(stop.target.name).toBeTruthy();
        expect(stop.caption.split(/[.!?](?=\s|$)/).filter(Boolean).length,stop.title).toBeLessThanOrEqual(2);
      }
    }
  });
  it('resolves every catalog stop by name to a verified visit destination with its distance',()=>{
    const catalog=stops.filter(stop=>stop.target.kind==='catalog');
    expect(catalog.length).toBe(2);
    for(const stop of catalog){
      const entry=index.entries.find(entry=>entry.name===stop.target.name)!;
      expect(entry,stop.title).toBeDefined();
      expect(entry.id).toBeGreaterThan(0);expect(entry.node).toMatch(/^\d+$/);expect(Number.isInteger(entry.row)).toBe(true);expect(entry.targetId).toMatch(/^\d+$/);
      expect(stop.factCheck!.distanceMpc).toBe(entry.distance);
      expect(stop.caption).toContain(`${sig(entry.distance!,3)} Mpc`);
    }
  });
  it('uses existing nearby keys, their exact adopted distances and light travel times',()=>{
    const local=stops.filter(stop=>stop.target.kind==='nearby');
    expect(local.length).toBe(5);
    for(const stop of local){
      expect(nearby.has(stop.target.key!),stop.title).toBe(true);
      const cited=nearby.get(stop.factCheck!.key??stop.target.key!)!;
      expect(stop.factCheck!.distanceMpc).toBe(cited.distanceMpc);
      expect(stop.factCheck!.lookbackGyr).toBeCloseTo(lightTravelGyr(cited.distanceMpc),12);
      expect(stop.caption).toContain(`${sig(cited.distanceMpc*1000,3)} kpc`);
    }
    // The satellites stop pulls back far enough that M32 and M110 fit in the frame around Andromeda.
    const satellites=roadTrip.stops.find(stop=>stop.title==='M32 and M110')!,m31=nearby.get('m31')!;
    const at=(key:string)=>{const e=nearby.get(key)!;return cartesian(e.raDeg,e.decDeg,e.distanceMpc)};
    const reach=Math.max(separation(at('m31'),at('m32')),separation(at('m31'),at('m110')));
    expect(satellites.target.key).toBe('m31');
    expect(satellites.distanceMpc!).toBeGreaterThanOrEqual(frame(reach));
    expect(satellites.distanceMpc!).toBeLessThan(frame(reach)*2);
    for(const key of ['m32','m110'])expect(satellites.caption).toContain(`${sig(nearby.get(key)!.distanceMpc*1000,3)} kpc`);
    expect(m31.distanceMpc).toBe(.785);
  });
  it('ties every factCheck to Planck18 lookback and repeats the number in the caption',()=>{
    const checked=stops.filter(stop=>stop.factCheck);
    // Only the Sun cites no distance or lookback.
    expect(stops.filter(stop=>!stop.factCheck).map(stop=>stop.target.kind)).toEqual(['sun']);
    for(const {title,caption,factCheck} of checked){
      const {distanceMpc,lookbackGyr}=factCheck!;
      expect(two(lookbackForDistance(distanceMpc)),title).toBe(two(lookbackGyr));
      const renderings=[formatLookback(two(lookbackGyr)),formatLookback(lookbackGyr)];
      expect(renderings.some(text=>caption.includes(text)),`${title}: ${renderings.join(' | ')}`).toBe(true);
    }
  });
  it('quotes the Milky Way, survey and CMB reference numbers from their sources',()=>{
    for(const stop of stops.filter(stop=>stop.target.kind==='core')){
      expect(stop.distanceMpc).toBe(.06);
      expect(stop.factCheck!.distanceMpc).toBe(milkyWay.observerDistanceMpc);
      expect(stop.caption).toContain(`${stop.distanceMpc!*1000} kpc`);
      expect(stop.caption).toContain(`${sig(milkyWay.observerDistanceMpc*1000,2)} kpc`);
    }
    const overviews=stops.filter(stop=>stop.target.kind==='overview');
    expect(overviews.length).toBe(2);
    for(const stop of overviews){
      expect(stop.factCheck!.count).toBe(manifest.count);
      expect(stop.factCheck!.distanceMpc).toBe(manifest.maxDistanceMpc);
      expect(stop.caption).toContain(manifest.count.toLocaleString('en-US'));
      expect(stop.caption).toContain(`${Math.round(manifest.maxDistanceMpc).toLocaleString('en-US')} Mpc`);
      expect(stop.caption).toMatch(/not confirmed empty/);
    }
    const cmb=zoomOut.stops.find(stop=>stop.target.kind==='cmb')!;
    expect(cmb.factCheck!.distanceMpc).toBe(CMB_RADIUS_MPC);
    expect(cmb.factCheck!.redshift).toBe(1090);
    expect(cmb.caption).toContain(`${Math.round(CMB_RADIUS_MPC).toLocaleString('en-US')} Mpc`);
    expect(cmb.caption).toContain(formatDistance(CMB_RADIUS_MPC,'ly'));
    expect(cmb.caption).toContain('1090');
    expect(cmb.caption).toMatch(/not a physical edge/);
  });
  it('frames the Local Group from the Sun–Andromeda midpoint with all six galaxies in view',()=>{
    const stop=zoomOut.stops.find(stop=>stop.target.kind==='localgroup')!,m31=nearby.get('m31')!;
    const midpoint=cartesian(m31.raDeg,m31.decDeg,m31.distanceMpc/2);
    expect(stop.target.positionMpc!.length).toBe(3);
    stop.target.positionMpc!.forEach((value,i)=>expect(Math.abs(value-midpoint[i])).toBeLessThan(1e-12));
    const reach=Math.max(...nearbyReference.entries.map(e=>separation(cartesian(e.raDeg,e.decDeg,e.distanceMpc),midpoint)),separation([0,0,0],midpoint));
    expect(stop.distanceMpc!).toBeGreaterThanOrEqual(frame(reach));
    expect(stop.distanceMpc!).toBeLessThan(frame(reach)*2);
    expect(stop.factCheck!.key).toBe('m31');
    expect(nearbyReference.entries.length).toBe(6);expect(stop.caption).toContain('Six nearby galaxies');
  });
  it('orders the zoom-out by strictly increasing framing distance',()=>{
    expect(zoomOut.stops.map(stop=>stop.target.kind)).toEqual(['sun','core','localgroup','overview','cmb']);
    const root=manifest.nodes.find((node:{id:string})=>node.id===manifest.root);
    const overviewRadius=Math.hypot(...(root.max as number[]).map((value:number,i:number)=>value-root.min[i]))/2;
    const framing=zoomOut.stops.map(stop=>{
      switch(stop.target.kind){
        case 'overview':return overviewRadius*2.1; // Explorer.reset
        case 'cmb':return frame(CMB_RADIUS_MPC); // Explorer.viewCosmicHorizon
        default:return stop.distanceMpc!;
      }
    });
    expect(framing[0]).toBe(.003);expect(framing[1]).toBe(.06);
    for(let i=1;i<framing.length;i++)expect(framing[i],zoomOut.stops[i].title).toBeGreaterThan(framing[i-1]);
    expect(framing[4]/framing[0]).toBeGreaterThan(1e7);
  });
  it('places the Coma cluster stop at its cited NED position on Planck18 axes with enough DESI rows around it',()=>{
    const sources=read('../src/data/tour-sources.json');
    const stop=roadTrip.stops.find(stop=>stop.target.kind==='cluster')!,cluster=sources.clusters.find((c:{key:string})=>c.key===stop.target.key);
    expect(cluster.role).toBe('primary');expect(cluster.verified).toBe(true);expect(cluster.query).toBe('ABELL 1656');
    expect(stop.factCheck!.redshift).toBe(cluster.redshift);
    expect(stop.factCheck!.distanceMpc).toBe(stop.target.distanceMpc);
    const expected=cartesian(cluster.raDeg,cluster.decDeg,stop.target.distanceMpc!);
    expect(stop.target.positionMpc!.length).toBe(3);
    stop.target.positionMpc!.forEach((value,i)=>expect(Math.abs(value-expected[i])).toBeLessThan(1e-9));
    // The comoving distance must be Planck18 at the cited redshift: interpolate the lookback table's redshift column.
    const {redshift,comovingMpc}=lookbackReference.table;let low=0;while(redshift[low+1]<cluster.redshift)low++;
    const t=(cluster.redshift-redshift[low])/(redshift[low+1]-redshift[low]),interpolated=comovingMpc[low]+t*(comovingMpc[low+1]-comovingMpc[low]);
    expect(Math.abs(interpolated-stop.target.distanceMpc!)/stop.target.distanceMpc!).toBeLessThan(1e-3);
    expect(stop.distanceMpc).toBe(3*cluster.framingRadiusMpc);
    const members=stop.factCheck!.desiMembers!;
    expect(sources.membership).toMatchObject({radiusDeg:2,redshiftWindow:.01,minimumRows:200});
    expect(members.count).toBeGreaterThanOrEqual(sources.membership.minimumRows);
    expect(members).toMatchObject({radiusDeg:2,redshiftWindow:.01,catalogId:manifest.id,catalogSourceSha256:manifest.source.sha256});
    expect(cluster.desiMembers).toEqual(members);
    expect(stop.caption).toContain(`z = ${two(cluster.redshift)}`);
    expect(stop.caption).toContain(`${sig(stop.target.distanceMpc!,3)} Mpc`);
    expect(stop.caption).toContain('Abell 1656');
  });
  it('discloses what is illustrative, assumed or only inferred at every stop',()=>{
    const required:Record<Kind,RegExp[]>={
      sun:[/illustrative/,/not to scale/,/origin/],
      core:[/illustrative/,/adopted/],
      localgroup:[/independently measured/,/hidden by default/,/not as corrected/],
      overview:[/measured redshift/,/not confirmed empty/],
      cmb:[/illustrative/,/approximate/,/comoving/],
      nearby:[/illustrative/,/measured|assumed/],
      catalog:[/measured redshift/,/illustrative|inferred/],
      cluster:[/redshift/,/line of sight/,/NED/],
    };
    for(const stop of stops)for(const pattern of required[stop.target.kind])expect(stop.caption,`${stop.title} needs ${pattern}`).toMatch(pattern);
    for(const stop of stops.filter(stop=>stop.target.kind==='nearby')){
      const entry=nearby.get(stop.target.key!)!;
      if(!entry.shapeMeasured)expect(stop.caption,stop.title).toMatch(/assumed/);
      if(!entry.orientationMeasured)expect(stop.caption,stop.title).toMatch(/orientation is not measured/);
    }
    expect(roadTrip.stops.map(stop=>stop.target.kind)).toEqual(['core','nearby','nearby','nearby','nearby','nearby','catalog','catalog','cluster','overview']);
  });
});
