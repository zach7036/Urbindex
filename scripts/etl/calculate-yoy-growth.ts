import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function calculateGrowth() {
  const supabase = createServiceClient();
  console.log('Starting Mathematical YoY Growth Computation Engine...');

  // 1. Fetch Demographics
  console.log('\nProcessing Demographics (Population Growth)...');
  const demRows = [];
  let dPage = 0;
  while (true) {
    const { data: dBatch } = await supabase.from('city_demographics').select('*').range(dPage * 1000, (dPage + 1) * 1000 - 1);
    if (!dBatch || dBatch.length === 0) break;
    demRows.push(...dBatch);
    dPage++;
  }

  if (demRows.length === 0) {
    console.error('Failed fetching demographics');
  } else {
    // Group by FIPS
    const demMap: Record<string, any[]> = {};
    for (const r of demRows) {
      if (!demMap[r.fips_code]) demMap[r.fips_code] = [];
      demMap[r.fips_code].push(r);
    }

    const demUpdates = [];
    for (const fips in demMap) {
      const records = demMap[fips].sort((a, b) => b.year - a.year); // Descending (2023, 2022)
      if (records.length >= 2) {
        const current = records[0];
        const historic = records[1];
        
        if (historic.total_population > 0 && current.total_population !== null) {
          const delta = ((current.total_population - historic.total_population) / historic.total_population) * 100;
          const parsed = parseFloat(delta.toFixed(1));
          
          demUpdates.push({
            ...current,
            population_growth_rate: parsed
          });
        }
      }
    }

    console.log(`Calculated ${demUpdates.length} Demographics growth vectors.`);
    for (let i = 0; i < demUpdates.length; i += 500) {
      const batch = demUpdates.slice(i, i + 500);
      const { error } = await supabase.from('city_demographics').upsert(batch);
      if (error) console.error(`Error updating Demographics batch ${i}:`, error.message);
    }
    console.log('Demographics mathematical vectors applied successfully.');
  }

  // 2. Fetch Housing
  console.log('\nProcessing Housing (YoY Home Appreciation)...');
  const housRows = [];
  let hPage = 0;
  while (true) {
    const { data: hBatch } = await supabase.from('city_housing').select('*').range(hPage * 1000, (hPage + 1) * 1000 - 1);
    if (!hBatch || hBatch.length === 0) break;
    housRows.push(...hBatch);
    hPage++;
  }

  if (housRows.length === 0) {
    console.error('Failed fetching housing');
  } else {
    // Group by FIPS
    const housMap: Record<string, any[]> = {};
    for (const r of housRows) {
      if (!housMap[r.fips_code]) housMap[r.fips_code] = [];
      housMap[r.fips_code].push(r);
    }

    const housUpdates = [];
    for (const fips in housMap) {
      const records = housMap[fips].sort((a, b) => b.year - a.year); // Descending (2023, 2022)
      if (records.length >= 2) {
        const current = records[0];
        const historic = records[1];
        
        if (historic.median_home_value > 0 && current.median_home_value !== null) {
          const delta = ((current.median_home_value - historic.median_home_value) / historic.median_home_value) * 100;
          const parsed = parseFloat(delta.toFixed(1));
          
          housUpdates.push({
            ...current,
            yoy_appreciation: parsed
          });
        }
      }
    }

    console.log(`Calculated ${housUpdates.length} Housing growth vectors.`);
    // Batch Update 500 at a time
    for (let i = 0; i < housUpdates.length; i += 500) {
      const batch = housUpdates.slice(i, i + 500);
      const { error } = await supabase.from('city_housing').upsert(batch);
      if (error) console.error(`Error updating Housing batch ${i}:`, error.message);
    }
    console.log('Housing appreciation vectors applied successfully.');
  }

  console.log('\nMathematical Recalculation Complete!');
}

calculateGrowth().catch(console.error);
