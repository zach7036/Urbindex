import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function imputeClimateMetrics() {
  const supabase = createServiceClient();
  console.log('Initiating State-Averaged Geoclimatic Estimation Engine...');

  // 1. Fetch Core Architecture
  const { data: cities, error: cErr } = await supabase.from('cities').select('fips_code, state_code');
  if (cErr || !cities) throw new Error('Failed to fetch Master City Index.');

  const cityStateMap = new Map<string, string>();
  for (const c of cities) cityStateMap.set(c.fips_code, c.state_code);

  // 2. Fetch all verified climate datasets
  const climateRows = [];
  let cPage = 0;
  while (true) {
    const { data: cBatch } = await supabase.from('city_climate').select('*').range(cPage * 1000, (cPage + 1) * 1000 - 1);
    if (!cBatch || cBatch.length === 0) break;
    climateRows.push(...cBatch);
    cPage++;
  }

  const existingFips = new Set(climateRows.map(c => c.fips_code));

  // 3. Compute State Averages for core climate variables
  const stTotals = new Map<string, any>();
  
  for (const c of climateRows) {
    const state = cityStateMap.get(c.fips_code);
    if (!state) continue;

    const obj = stTotals.get(state) || { 
      h_jan: 0, l_jan: 0, 
      h_apr: 0, l_apr: 0, 
      h_jul: 0, l_jul: 0, 
      h_oct: 0, l_oct: 0, 
      p_ann: 0, s_ann: 0,
      count: 0
    };

    obj.h_jan += c.avg_high_jan;
    obj.l_jan += c.avg_low_jan;
    obj.h_apr += c.avg_high_apr;
    obj.l_apr += c.avg_low_apr;
    obj.h_jul += c.avg_high_jul;
    obj.l_jul += c.avg_low_jul;
    obj.h_oct += c.avg_high_oct;
    obj.l_oct += c.avg_low_oct;
    obj.p_ann += c.annual_precipitation;
    obj.s_ann += c.annual_snowfall;
    obj.count++;

    stTotals.set(state, obj);
  }

  // 4. Synthesize Missing Weather Regions
  const synthesizedUpdates = [];
  let missingCount = 0;

  for (const city of cities) {
    if (!existingFips.has(city.fips_code)) {
      missingCount++;
      const st = stTotals.get(city.state_code);
      
      // Default to National Avg if the entire state somehow has no sensors
      const avgHJan = st ? st.h_jan / st.count : 40;
      const avgLJan = st ? st.l_jan / st.count : 25;
      const avgHApr = st ? st.h_apr / st.count : 65;
      const avgLApr = st ? st.l_apr / st.count : 45;
      const avgHJul = st ? st.h_jul / st.count : 85;
      const avgLJul = st ? st.l_jul / st.count : 65;
      const avgHOct = st ? st.h_oct / st.count : 70;
      const avgLOct = st ? st.l_oct / st.count : 50;
      const avgPAnn = st ? st.p_ann / st.count : 35.0;
      const avgSAnn = st ? st.s_ann / st.count : 15.0;

      // Variance ±2 degrees
      const v = () => (Math.random() - 0.5) * 4;

      const baseHighJul = Math.round(avgHJul + v());
      const baseLowJan = Math.round(avgLJan + v());
      const basePrecip = parseFloat((avgPAnn + v()).toFixed(1));

      synthesizedUpdates.push({
        fips_code: city.fips_code,
        avg_high_jan: Math.round(avgHJan + v()),
        avg_low_jan: baseLowJan,
        avg_high_apr: Math.round(avgHApr + v()),
        avg_low_apr: Math.round(avgLApr + v()),
        avg_high_jul: baseHighJul,
        avg_low_jul: Math.round(avgLJul + v()),
        avg_high_oct: Math.round(avgHOct + v()),
        avg_low_oct: Math.round(avgLOct + v()),
        annual_precipitation: basePrecip,
        annual_snowfall: parseFloat((avgSAnn + v()).toFixed(1)),
        rainy_days: Math.round(basePrecip * 3),
        days_above_90: Math.round(baseHighJul > 90 ? 45 : Math.max(10, baseHighJul / 3)),
        days_below_32: Math.round(baseLowJan < 32 ? 60 : Math.max(5, 50 - baseLowJan)),
        sunny_days: 205 + Math.round(v()*5),
        avg_humidity: 60 + Math.round(v()*2),
        uv_index: parseFloat((6.0 + v()/3).toFixed(1)),
        comfort_index: 70 + Math.round(v()),
        is_imputed: true
      });
    }
  }

  console.log(`Synthesizing weather stations for exactly ${missingCount} missing jurisdictions...`);

  if (synthesizedUpdates.length > 0) {
    const { error } = await supabase.from('city_climate').upsert(synthesizedUpdates);
    if (error) console.error('Geoclimatic Upsert Error:', error.message);
  }

  console.log('AI Missing Data Generation Engine fully finalized.');
}

imputeClimateMetrics().catch(console.error);
