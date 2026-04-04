import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function fix() {
  const supabase = createServiceClient();
  
  // 1. Fetch ALL cities
  const cities = [];
  let page = 0;
  while (true) {
    const { data: batch } = await supabase.from('cities').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (!batch || batch.length === 0) break;
    cities.push(...batch);
    page++;
  }

  // 2. Fetch ALL climate rows
  const climateRows = [];
  page = 0;
  while (true) {
    const { data: batch } = await supabase.from('city_climate').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (!batch || batch.length === 0) break;
    climateRows.push(...batch);
    page++;
  }

  const existingFips = new Set(climateRows.map(c => c.fips_code));
  const missingCities = cities.filter(c => !existingFips.has(c.fips_code));

  console.log(`Found ${missingCities.length} missing cities.`);

  if (missingCities.length === 0) return;

  // Build State Averages
  const stTotals = new Map<string, any>();
  for (const c of climateRows) {
    const matchedCity = cities.find(x => x.fips_code === c.fips_code);
    if (!matchedCity) continue;
    const state = matchedCity.state_code;
    
    const obj = stTotals.get(state) || { h_jan:0, l_jan:0, h_apr:0, l_apr:0, h_jul:0, l_jul:0, h_oct:0, l_oct:0, p_ann:0, s_ann:0, count:0 };
    obj.h_jan += c.avg_high_jan; obj.l_jan += c.avg_low_jan; obj.h_apr += c.avg_high_apr; obj.l_apr += c.avg_low_apr; obj.h_jul += c.avg_high_jul; obj.l_jul += c.avg_low_jul; obj.h_oct += c.avg_high_oct; obj.l_oct += c.avg_low_oct; obj.p_ann += c.annual_precipitation; obj.s_ann += c.annual_snowfall; obj.count++;
    stTotals.set(state, obj);
  }

  const synthesized = [];
  for (const city of missingCities) {
    const st = stTotals.get(city.state_code);
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

    synthesized.push({
      fips_code: city.fips_code,
      avg_high_jan: Math.round(avgHJan), avg_low_jan: Math.round(avgLJan),
      avg_high_apr: Math.round(avgHApr), avg_low_apr: Math.round(avgLApr),
      avg_high_jul: Math.round(avgHJul), avg_low_jul: Math.round(avgLJul),
      avg_high_oct: Math.round(avgHOct), avg_low_oct: Math.round(avgLOct),
      annual_precipitation: parseFloat(avgPAnn.toFixed(1)),
      annual_snowfall: parseFloat(avgSAnn.toFixed(1)),
      rainy_days: Math.round(avgPAnn * 3),
      days_above_90: Math.round(avgHJul > 90 ? 45 : Math.max(10, avgHJul / 3)),
      days_below_32: Math.round(avgLJan < 32 ? 60 : Math.max(5, 50 - avgLJan)),
      sunny_days: 205,
      avg_humidity: 60,
      uv_index: 6.0,
      comfort_index: 70,
      is_imputed: true
    });
  }

  console.log(`Upserting ${synthesized.length} synthesized records...`);
  const { error } = await supabase.from('city_climate').upsert(synthesized);
  if (error) console.error('Upsert failed:', error);
  else console.log('Successfully inserted missing records!');
}
fix().catch(console.error);
