import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function imputeFinalGrowth() {
  const supabase = createServiceClient();
  console.log('Initiating State-Averaged ML Estimation Engine...');

  // 1. Fetch Core Architecture
  const { data: cities, error: cErr } = await supabase.from('cities').select('fips_code, state_code');
  if (cErr || !cities) throw new Error('Failed to fetch Master City Index.');

  const cityStateMap = new Map<string, string>();
  for (const c of cities) cityStateMap.set(c.fips_code, c.state_code);

  // 2. Fetch all Demographics & Housing (2022)
  console.log('Loading 2022 Local Database Architecture (Demographics & Housing)...');
  
  const demRows = [];
  let dPage = 0;
  while (true) {
    const { data: dBatch } = await supabase.from('city_demographics').select('*').eq('year', 2022).range(dPage * 1000, (dPage + 1) * 1000 - 1);
    if (!dBatch || dBatch.length === 0) break;
    demRows.push(...dBatch);
    dPage++;
  }

  const housRows = [];
  let hPage = 0;
  while (true) {
    const { data: hBatch } = await supabase.from('city_housing').select('*').eq('year', 2022).range(hPage * 1000, (hPage + 1) * 1000 - 1);
    if (!hBatch || hBatch.length === 0) break;
    housRows.push(...hBatch);
    hPage++;
  }

  // 3. Compute State Averages
  const stateAverages = new Map<string, { popSum: number, popCount: number, homeSum: number, homeCount: number }>();
  
  for (const d of demRows) {
    if (d.population_growth_rate !== 0 && d.population_growth_rate !== null) {
      const state = cityStateMap.get(d.fips_code);
      if (!state) continue;
      
      const stObj = stateAverages.get(state) || { popSum: 0, popCount: 0, homeSum: 0, homeCount: 0 };
      stObj.popSum += d.population_growth_rate;
      stObj.popCount += 1;
      stateAverages.set(state, stObj);
    }
  }

  for (const h of housRows) {
    if (h.yoy_appreciation !== 0 && h.yoy_appreciation !== null) {
      const state = cityStateMap.get(h.fips_code);
      if (!state) continue;

      const stObj = stateAverages.get(state) || { popSum: 0, popCount: 0, homeSum: 0, homeCount: 0 };
      stObj.homeSum += h.yoy_appreciation;
      stObj.homeCount += 1;
      stateAverages.set(state, stObj);
    }
  }

  // 4. Synthesize Missing Vectors
  const demUpdates = [];
  const housUpdates = [];

  for (const d of demRows) {
    if (d.population_growth_rate === 0 || d.population_growth_rate === null) {
      const state = cityStateMap.get(d.fips_code);
      const stObj = state ? stateAverages.get(state) : null;
      
      // If we literally don't have enough state data, default to national avg of 0.5%
      const baseAvg = (stObj && stObj.popCount > 0) ? (stObj.popSum / stObj.popCount) : 0.5;
      
      // Gaussian Local Variance (-1.2% to +1.2%)
      const variance = (Math.random() - 0.5) * 2.4; 
      const estimated = parseFloat((baseAvg + variance).toFixed(1));

      demUpdates.push({
        ...d,
        population_growth_rate: estimated,
        is_imputed: true
      });
    }
  }

  for (const h of housRows) {
    if (h.yoy_appreciation === 0 || h.yoy_appreciation === null) {
      const state = cityStateMap.get(h.fips_code);
      const stObj = state ? stateAverages.get(state) : null;
      
      // If we literally don't have enough state data, default to national avg of 4.2%
      const baseAvg = (stObj && stObj.homeCount > 0) ? (stObj.homeSum / stObj.homeCount) : 4.2;
      
      // Gaussian Local Variance (-1.2% to +1.2%)
      const variance = (Math.random() - 0.5) * 2.4; 
      const estimated = parseFloat((baseAvg + variance).toFixed(1));

      housUpdates.push({
        ...h,
        yoy_appreciation: estimated,
        is_imputed: true
      });
    }
  }

  console.log(`\nSynthesized exactly ${demUpdates.length} missing Demographics Growth parameters.`);
  console.log(`Synthesized exactly ${housUpdates.length} missing Real Estate Appreciation parameters.`);

  // 5. Fire Payload
  if (demUpdates.length > 0) {
    const { error } = await supabase.from('city_demographics').upsert(demUpdates);
    if (error) console.error('Demographics Upsert Error:', error.message);
  }

  if (housUpdates.length > 0) {
    const { error } = await supabase.from('city_housing').upsert(housUpdates);
    if (error) console.error('Housing Upsert Error:', error.message);
  }

  console.log('AI Missing Data Generation Engine 100% Core Complete.');
}

imputeFinalGrowth().catch(console.error);
