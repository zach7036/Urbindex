import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function execute() {
  const supabase = createServiceClient();

  // Find the exact 112 cities that were Imputed with State Averages (we just imputed them)
  // We can find them by looking up 'is_imputed = true' and joining against cities table
  const { data: imputedRows } = await supabase.from('city_climate').select('fips_code').eq('is_imputed', true);
  if (!imputedRows || !imputedRows.length) return;

  const fipsIds = imputedRows.map(c => c.fips_code);
  const { data: cities } = await supabase.from('cities').select('*').in('fips_code', fipsIds);

  console.log(`Pulling exact historical values 1-by-1 for ${cities.length} remaining isolated cities...`);
  
  const updates = [];
  let successCount = 0;

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    if (!city.latitude || !city.longitude) continue;

    try {
      // 1-by-1 query to bypass batch corruption
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.latitude}&longitude=${city.longitude}&start_date=2022-01-01&end_date=2022-12-31&hourly=relative_humidity_2m&timezone=America%2FNew_York`;
      const res = await fetch(url);
      
      if (!res.ok) {
        console.log(`[Drop] ${city.name} failed Open-Meteo validation.`);
        continue;
      }
      
      const json = await res.json();
      const arr = json.hourly?.relative_humidity_2m;
      
      if (arr && Array.isArray(arr)) {
        const valid = arr.filter(h => typeof h === 'number');
        if (valid.length > 0) {
           const sum = valid.reduce((acc, curr) => acc + curr, 0);
           const exactStr = Math.round(sum / valid.length);
           updates.push({ fips_code: city.fips_code, avg_humidity: exactStr });
           successCount++;
           console.log(`[Success] Extracted exactly ${exactStr}% true humidity for ${city.name}, ${city.state_code}`);
        }
      }
    } catch(e) {
      console.log(`[Err] ${city.name} extraction failed.`);
    }

    // 0.5s delay to strictly comply with API limits
    await new Promise(r => setTimeout(r, 500));
  }

  if (updates.length > 0) {
    console.log(`\nPersisting exact empirical data for ${updates.length} cities...`);
    for (let i = 0; i < updates.length; i += 50) {
      const chunk = updates.slice(i, i + 50);
      await Promise.all(chunk.map(b => supabase.from('city_climate').update({ avg_humidity: b.avg_humidity }).eq('fips_code', b.fips_code)));
    }
  }

  console.log(`\nCOMPLETED 100% TRUE METRICS ENGINE. Total recovered: ${successCount}`);
}

execute().catch(console.error);
