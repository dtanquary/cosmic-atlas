import {describe,expect,it} from 'vitest';
import {catalogRadialReach,CMB_RADIUS_MPC,cosmicHorizonReference} from '../src/cosmic-scale';
import {MLY_PER_MPC} from '../src/format';

describe('CMB scale reference',()=>{
  it('uses present-day comoving distance, not 13.8 billion light years of travel time',()=>{
    expect(CMB_RADIUS_MPC*MLY_PER_MPC/1000).toBeCloseTo(45.28,1);
    expect(cosmicHorizonReference.lookbackGyr).toBeCloseTo(13.79,2);
    expect(cosmicHorizonReference.ageAtEmissionYears).toBeGreaterThan(360000);
    expect(cosmicHorizonReference.ageAtEmissionYears).toBeLessThan(390000);
    expect(cosmicHorizonReference.cosmology).toBe('Planck18');
  });
  it('compares linear reach without presenting a volume or census fraction',()=>{
    expect(catalogRadialReach(4830.888927)).toBeCloseTo(.34794,4);
    expect(catalogRadialReach(0)).toBe(0);
    expect(catalogRadialReach(CMB_RADIUS_MPC*2)).toBe(2);
    expect(catalogRadialReach(NaN)).toBeNull();
    expect(catalogRadialReach(-1)).toBeNull();
  });
});
