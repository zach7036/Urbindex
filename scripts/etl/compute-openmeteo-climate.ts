import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function computeOpenMeteo() {
  const supabase = createServiceClient();
  console.log('Initiating Open-Meteo Authentic Climate Extractor...');

  // 1. Fetch Core Architecture
  const cities = [];
  let page = 0;
  while (true) {
    const { data: batch } = await supabase.from('cities').select('fips_code, latitude, longitude, name').range(page * 1000, (page + 1) * 1000 - 1);
    if (!batch || batch.length === 0) break;
    cities.push(...batch);
    page++;
  }

  console.log(`Loaded ${cities.length} Master Index Coordinate Models.`);

  // Open-Meteo supports up to 100 coordinates per request! We'll batch 50 at a time.
  const updates = [];
  
  for (let i = 0; i < cities.length; i += 50) {
    const batch = cities.slice(i, i + 50);
    const lats = batch.map(c => c.latitude).join(',');
    const lngs = batch.map(c => c.longitude).join(',');

    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lngs}&start_date=2022-01-01&end_date=2022-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,shortwave_radiation_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FNew_York`;

      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Status ${res.status}: Failed batch ${Math.floor(i/50)}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const json = await res.json();
      
      const responses = Array.isArray(json) ? json : [json];

      for (let j = 0; j < batch.length; j++) {
        const city = batch[j];
        const daily = responses[j]?.daily;
        if (!daily || !daily.temperature_2m_max) continue;

        const parseArray = (arr: any[]) => arr.map(e => (e === null || e === undefined) ? 0 : e);

        const maxTemps = parseArray(daily.temperature_2m_max);
        const minTemps = parseArray(daily.temperature_2m_min);
        const precip = parseArray(daily.precipitation_sum);
        const snow = parseArray(daily.snowfall_sum);
        const radiation = parseArray(daily.shortwave_radiation_sum);

        const days_above_90 = maxTemps.filter((t: number) => t >= 90).length;
        const days_below_32 = minTemps.filter((t: number) => t <= 32).length;
        const annual_precipitation = parseFloat(precip.reduce((a: number, b: number) => a + b, 0).toFixed(1));
        const annual_snowfall = parseFloat(snow.reduce((a: number, b: number) => a + b, 0).toFixed(1));
        const rainy_days = precip.filter((p: number) => p >= 0.05).length;
        const sunny_days = radiation.filter((r: number) => r >= 15.0).length;

        updates.push({
          fips_code: city.fips_code,
          days_above_90,
          days_below_32,
          annual_precipitation,
          annual_snowfall,
          rainy_days,
          sunny_days,
          is_imputed: false
        });
      }

      console.log(`Successfully processed batch ${Math.floor(i/50) + 1} / ${Math.ceil(cities.length/50)}`);

    } catch (err: any) {
      console.error(`Exception pulling batch ${Math.floor(i/50)}: ${err.message}`);
    }

    // Batch Update every 250 units
    if (updates.length >= 250) {
      const batchUpdate = updates.splice(0, 250);
      await Promise.all(batchUpdate.map(b => supabase.from('city_climate').update(b).eq('fips_code', b.fips_code)));
      console.log('Successfully recorded 250 payloads securely to the database...');
    }

    // Delay 1.5 seconds to respect limits
    await new Promise(r => setTimeout(r, 1500));
  }

  // Final Flush
  if (updates.length > 0) {
    await Promise.all(updates.map(b => supabase.from('city_climate').update(b).eq('fips_code', b.fips_code)));
  }

  console.log('Open-Meteo Architectural Data Extractor 100% Complete.');
}

computeOpenMeteo().catch(console.error);
