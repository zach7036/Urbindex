import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

const BATCH_SIZE = 30;
const DELAY_MS = 1500;

async function execute() {
  const supabase = createServiceClient();
  
  // Find cities that still have exactly 60 humidity
  // We use pagination to get all of them
  const validCities = [];
  let page = 0;
  while (true) {
    const { data: batch } = await supabase.from('city_climate').select('fips_code').eq('avg_humidity', 60).range(page * 1000, (page + 1) * 1000 - 1);
    if (!batch || batch.length === 0) break;
    validCities.push(...batch);
    page++;
  }

  console.log(`Resuming for remaining ${validCities.length} cities...`);
  if (validCities.length === 0) return;

  // We need their coordinates
  const fipsIds = validCities.map(x => x.fips_code);
  const citiesQueue = [];
  for (let i=0; i < fipsIds.length; i+=1000) {
     const chunk = fipsIds.slice(i, i+1000);
     const { data: c } = await supabase.from('cities').select('*').in('fips_code', chunk);
     if (c) citiesQueue.push(...c);
  }

  let updates = [];
  let totalProcessed = 0;

  for (let i = 0; i < citiesQueue.length; i += BATCH_SIZE) {
    const batch = citiesQueue.slice(i, i + BATCH_SIZE);
    const validBatch = batch.filter(c => c.latitude && c.longitude);
    if (!validBatch.length) continue;

    const lats = validBatch.map(c => c.latitude).join(',');
    const lngs = validBatch.map(c => c.longitude).join(',');

    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lngs}&start_date=2022-01-01&end_date=2022-12-31&hourly=relative_humidity_2m&timezone=America%2FNew_York`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[API] Rate limit hit. Cooling down...`);
        await new Promise(r => setTimeout(r, DELAY_MS * 5));
        continue;
      }

      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch(e) { console.error('JSON Parse fail on batch', i); continue; }
      
      const responses = Array.isArray(json) ? json : [json];

      for (let j = 0; j < validBatch.length; j++) {
        const city = validBatch[j];
        if (!responses[j]) continue; // SAFETY FIX
        const hourlyData = responses[j].hourly?.relative_humidity_2m;
        if (!hourlyData || !Array.isArray(hourlyData)) continue;

        const validHours = hourlyData.filter(h => typeof h === 'number');
        if (!validHours.length) continue;

        const sum = validHours.reduce((acc, curr) => acc + curr, 0);
        updates.push({
          fips_code: city.fips_code,
          avg_humidity: Math.round(sum / validHours.length)
        });
        totalProcessed++;
      }
      console.log(`[Batch ${Math.floor(i/BATCH_SIZE) + 1} / ${Math.ceil(citiesQueue.length/BATCH_SIZE)}] Re-mapped ${validBatch.length}`);
    } catch (e) { console.error('Error fetching batch', e.message); }

    if (updates.length >= 150) {
      const dbBatch = updates.splice(0, 150);
      const promises = dbBatch.map(b => supabase.from('city_climate').update({ avg_humidity: b.avg_humidity }).eq('fips_code', b.fips_code));
      await Promise.all(promises);
      console.log(`---> Secured 150 accurate metrics to the Database...`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  if (updates.length > 0) {
    const promises = updates.map(b => supabase.from('city_climate').update({ avg_humidity: b.avg_humidity }).eq('fips_code', b.fips_code));
    await Promise.all(promises);
  }
  
  console.log(`\n==============================================`);
  console.log(`SUCCESS! Resumed and averaged ${totalProcessed} Annual Humidities.`);
  console.log(`==============================================\n`);
}

execute().catch(console.error);
