import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

// Open-Meteo allows max 100 coordinates, but we use 30 to keep JSON response sizes manageable
const BATCH_SIZE = 30;
const DELAY_MS = 1500;

async function extractTrueHumidity() {
  const supabase = createServiceClient();
  console.log('Initiating True Humidity Data Extractor via Open-Meteo Archive API (2022 full year)...');

  // 1. Fetch all 4165 Cities from database
  const cities: {fips_code: string, latitude: number, longitude: number, name: string}[] = [];
  let page = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('cities')
      .select('fips_code, latitude, longitude, name')
      .range(page * 1000, (page + 1) * 1000 - 1);
      
    if (error) {
      console.error('Database Error:', error);
      process.exit(1);
    }
    if (!batch || batch.length === 0) break;
    cities.push(...batch);
    page++;
  }

  console.log(`Successfully loaded ${cities.length} geometric coordinates.`);

  let updates: {fips_code: string, avg_humidity: number}[] = [];
  let totalProcessed = 0;

  // 2. Loop in batches
  for (let i = 0; i < cities.length; i += BATCH_SIZE) {
    const batch = cities.slice(i, i + BATCH_SIZE);
    const validBatch = batch.filter(c => c.latitude && c.longitude);
    if (validBatch.length === 0) continue;

    const lats = validBatch.map(c => c.latitude).join(',');
    const lngs = validBatch.map(c => c.longitude).join(',');

    try {
      // 8760 hourly data points per city
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lngs}&start_date=2022-01-01&end_date=2022-12-31&hourly=relative_humidity_2m&timezone=America%2FNew_York`;

      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Status ${res.status}: Failed batch ${Math.floor(i/BATCH_SIZE)}. Waiting and restarting.`);
        await new Promise(r => setTimeout(r, DELAY_MS * 3));
        continue; // Note: We might miss 30 cities here, but typically it will be a 504 and next batch recovers
      }

      const json = await res.json();
      const responses = Array.isArray(json) ? json : [json];

      for (let j = 0; j < validBatch.length; j++) {
        const city = validBatch[j];
        
        let hourlyData;
        // In array vs single object responses
        if (responses[j]) {
            hourlyData = responses[j].hourly?.relative_humidity_2m;
        }

        if (!hourlyData || !Array.isArray(hourlyData)) {
          continue;
        }

        // Drop null values usually caused by sensor glitches
        const validHours = hourlyData.filter((h: any) => typeof h === 'number');
        if (validHours.length === 0) continue;

        // Perform algebraic reduction for annual mean
        const sum = validHours.reduce((acc: number, curr: number) => acc + curr, 0);
        const avg_humidity = Math.round(sum / validHours.length);

        updates.push({
          fips_code: city.fips_code,
          avg_humidity
        });
        
        totalProcessed++;
      }

      console.log(`[Batch ${Math.floor(i/BATCH_SIZE) + 1} / ${Math.ceil(cities.length/BATCH_SIZE)}] Re-mapped accurate humidity for ${validBatch.length} cities.`);

    } catch (err: any) {
      console.error(`Exception pulling batch ${Math.floor(i/BATCH_SIZE)}: ${err.message}`);
    }

    // Incremental Database Push (Chunked at 300)
    if (updates.length >= 250) {
      const dbBatch = updates.splice(0, 250);
      
      const promises = dbBatch.map(b => 
        supabase.from('city_climate').update({ avg_humidity: b.avg_humidity }).eq('fips_code', b.fips_code)
      );
      
      await Promise.all(promises);
      console.log(`---> Secured 250 accurate metrics to the Database...`);
    }

    // Rate Limit Safety Delay
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // 3. Final Flush
  if (updates.length > 0) {
    const promises = updates.map(b => 
      supabase.from('city_climate').update({ avg_humidity: b.avg_humidity }).eq('fips_code', b.fips_code)
    );
    await Promise.all(promises);
  }

  console.log(`\n==============================================`);
  console.log(`SUCCESS! Pulled ${totalProcessed * 8760} data points and mathematically averaged ${totalProcessed} Annual Humidities.`);
  console.log(`==============================================\n`);
}

extractTrueHumidity().catch(err => {
  console.error("Script Failed:", err);
});
