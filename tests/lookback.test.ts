import {describe,expect,it} from 'vitest';
import {chooseRings,formatLookback,lightTravelGyr,lookbackForDistance,lookbackReference} from '../src/lookback';
import {CMB_RADIUS_MPC} from '../src/cosmic-scale';

const {table,rings,maxInterpolationErrorGyr}=lookbackReference;

describe('Planck18 lookback table',()=>{
  it('is strictly monotonic in comoving distance and lookback time',()=>{
    for(let i=1;i<table.redshift.length;i++){
      expect(table.redshift[i]).toBeGreaterThan(table.redshift[i-1]);
      expect(table.comovingMpc[i]).toBeGreaterThan(table.comovingMpc[i-1]);
      expect(table.lookbackGyr[i]).toBeGreaterThan(table.lookbackGyr[i-1]);
    }
    expect(lookbackReference.cosmology).toBe('Planck18');
    expect(maxInterpolationErrorGyr).toBeLessThan(.01);
  });
  it('round-trips every ring within the measured interpolation error',()=>{
    for(const ring of rings)expect(Math.abs(lookbackForDistance(ring.comovingMpc)-ring.lookbackGyr)).toBeLessThanOrEqual(maxInterpolationErrorGyr+1e-6);
  });
  it('uses distance ÷ c below the first row and clamps at the CMB radius',()=>{
    const galacticCenterYears=lookbackForDistance(.008122)*1e9;
    expect(Math.abs(galacticCenterYears-26500)/26500).toBeLessThan(.01);
    expect(lightTravelGyr(.008122)*1e9).toBeCloseTo(galacticCenterYears,6);
    const last=table.lookbackGyr[table.lookbackGyr.length-1];
    expect(lookbackForDistance(CMB_RADIUS_MPC)).toBe(last);
    expect(lookbackForDistance(CMB_RADIUS_MPC*3)).toBe(last);
    expect(lookbackForDistance(-1)).toBeNaN();
    expect(lookbackForDistance(NaN)).toBeNaN();
  });
});

describe('formatLookback',()=>{
  it('uses years, million and billion tiers with three significant digits',()=>{
    expect(formatLookback(.0000265)).toBe('26,500 years');
    expect(formatLookback(.82)).toBe('820 million years');
    expect(formatLookback(2.1)).toBe('2.1 billion years');
    expect(formatLookback(13.7865)).toBe('13.8 billion years');
    expect(formatLookback(.005)).toBe('5 million years');
    expect(formatLookback(.0009)).toBe('900,000 years');
    expect(formatLookback(NaN)).toBe('Unavailable');
  });
});

describe('chooseRings',()=>{
  const fov=50,aspect=1.6,height=1000,tanHalf=Math.tan(fov*Math.PI/360);
  const pixels=(angle:number)=>Math.tan(angle)/tanHalf*height/2;
  it('keeps at most eight ascending rings inside the camera distance and field of view',()=>{
    for(const d of [50,1000,10000,CMB_RADIUS_MPC*3]){
      const chosen=chooseRings(d,fov,aspect,height);
      expect(chosen.length).toBeLessThanOrEqual(8);
      for(let i=0;i<chosen.length;i++){
        const ring=chosen[i];
        expect(ring.comovingMpc).toBeLessThan(d);
        expect(ring.angle).toBeCloseTo(Math.asin(ring.comovingMpc/d),12);
        expect(ring.angle).toBeGreaterThanOrEqual(Math.PI/180);
        expect(ring.angle).toBeLessThanOrEqual(Math.atan(tanHalf*Math.sqrt(1+aspect*aspect)));
        if(i){expect(ring.lookbackGyr).toBeGreaterThan(chosen[i-1].lookbackGyr);expect(pixels(ring.angle)-pixels(chosen[i-1].angle)).toBeGreaterThanOrEqual(28)}
      }
    }
    expect(chooseRings(10000,fov,aspect,height).length).toBeGreaterThan(0);
  });
  it('returns nothing at the 10 pc orbit distance or for invalid input',()=>{
    expect(chooseRings(1e-5,fov,aspect,height)).toEqual([]);
    expect(chooseRings(0,fov,aspect,height)).toEqual([]);
    expect(chooseRings(NaN,fov,aspect,height)).toEqual([]);
  });
  it('keeps exact ring sets: larger lookbacks survive crowding, the overview shows eight',()=>{
    expect(chooseRings(30000,fov,aspect,120).map(ring=>ring.lookbackGyr)).toEqual([9,13.5]);
    expect(chooseRings(16664,fov,aspect,height).map(ring=>ring.lookbackGyr)).toEqual([7,8,9,10,11,12,13,13.5]);
  });
});
