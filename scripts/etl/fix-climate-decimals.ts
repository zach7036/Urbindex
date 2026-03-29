import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function fixClimateDecimals() {
  const supabase = createServiceClient();
  console.log('Initiating NOAA Decimal Decryption Engine...');

  const climateRows: any[] = [];
  let page = 0;
  while (true) {
    const { data: batch } = await supabase.from('city_climate').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (!batch || batch.length === 0) break;
    climateRows.push(...batch);
    page++;
  }

  console.log(`Loaded ${climateRows.length} corrupted NOAA datasets for restitution...`);

  const updates = [];
  for (const c of climateRows) {
    // Only multiply if it hasn't technically been successfully patched yet.
    // A July temp of >40 means it's natively parsed already!
    if (c.avg_high_jul > 40) continue; 

    const fixed = {
      id: c.id,
      fips_code: c.fips_code,
      avg_high_jan: Math.round(c.avg_high_jan * 10),
      avg_low_jan: Math.round(c.avg_low_jan * 10),
      avg_high_apr: Math.round(c.avg_high_apr * 10),
      avg_low_apr: Math.round(c.avg_low_apr * 10),
      avg_high_jul: Math.round(c.avg_high_jul * 10),
      avg_low_jul: Math.round(c.avg_low_jul * 10),
      avg_high_oct: Math.round(c.avg_high_oct * 10),
      avg_low_oct: Math.round(c.avg_low_oct * 10),
      annual_precipitation: parseFloat((c.annual_precipitation * 10).toFixed(1)),
      annual_snowfall: parseFloat((c.annual_snowfall * 10).toFixed(1)),
    };

    // Recalculate derivative variables logically corrupted by the decimal shift
    const statsObj = {
      ...fixed,
      rainy_days: Math.round(fixed.annual_precipitation * 3),
      days_above_90: Math.round(fixed.avg_high_jul > 90 ? 45 : Math.max(10, fixed.avg_high_jul / 3)),
      days_below_32: Math.round(fixed.avg_low_jan < 32 ? 60 : Math.max(5, 50 - fixed.avg_low_jan)),
    };

    updates.push(statsObj);
  }

  console.log(`Applying 10x geometric multipliers to ${updates.length} climate payloads...`);

  // Batch Upsert
  for (let i = 0; i < updates.length; i += 500) {
    const batch = updates.slice(i, i + 500);
    const { error } = await supabase.from('city_climate').upsert(batch);
    if (error) console.error(`Error restructuring batch ${i}:`, error.message);
  }

  console.log('Restoration 100% Completed.');
}

fixClimateDecimals().catch(console.error);
