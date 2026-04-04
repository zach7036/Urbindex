import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

const BATCH_SIZE = 30;
const DELAY_MS = 1500;

async function execute() {
  const supabase = createServiceClient();
  // Get ONLY the 161 recently imputed cities
  const { data: imputed } = await supabase.from('city_climate').select('fips_code').eq('is_imputed', true);
  if (!imputed || imputed.length === 0) return;
  
  const fipsIds = imputed.map(x => x.fips_code);
  const { data: validCities } = await supabase.from('cities').select('*').in('fips_code', fipsIds);

  const updates = [];
  for (let i = 0; i < validCities.length; i += BATCH_SIZE) {
    const batch = validCities.slice(i, i + BATCH_SIZE);
    const validBatch = batch.filter(c => c.latitude && c.longitude);
    if (!validBatch.length) continue;

    const lats = validBatch.map(c => c.latitude).join(',');
    const lngs = validBatch.map(c => c.longitude).join(',');

    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lngs}&start_date=2022-01-01&end_date=2022-12-31&hourly=relative_humidity_2m&timezone=America%2FNew_York`;
      const res = await fetch(url);
      if (!res.ok) {
        await new Promise(r => setTimeout(r, DELAY_MS * 3));
        continue;
      }

      const json = await res.json();
      const responses = Array.isArray(json) ? json : [json];

      for (let j = 0; j < validBatch.length; j++) {
        const city = validBatch[j];
        if (!responses[j]) continue;
        const hourlyData = responses[j].hourly?.relative_humidity_2m;
        if (!hourlyData || !Array.isArray(hourlyData)) continue;

        const validHours = hourlyData.filter(h => typeof h === 'number');
        if (!validHours.length) continue;

        const sum = validHours.reduce((acc, curr) => acc + curr, 0);
        updates.push({
          fips_code: city.fips_code,
          avg_humidity: Math.round(sum / validHours.length)
        });
      }
      console.log(`Processed batch ${Math.floor(i/BATCH_SIZE) + 1}`);
    } catch (e) { console.error('Error fetching batch'); }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  if (updates.length > 0) {
    const promises = updates.map(b => supabase.from('city_climate').update({ avg_humidity: b.avg_humidity }).eq('fips_code', b.fips_code));
    await Promise.all(promises);
    console.log(`Saved exact true humidity for the ${updates.length} recovered cities.`);
  }
}

execute().catch(console.error);
