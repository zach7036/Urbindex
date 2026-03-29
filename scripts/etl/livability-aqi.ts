/**
 * Livability - AQI ETL
 *
 * Fetches 14-day average US AQI for all cities using Open-Meteo Air Quality API.
 * Batches requests (50 cities at a time) to stay well below rate limits.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BATCH_SIZE = 50;

async function main() {
  console.log('Fetching AQI data from Open-Meteo...');

  // 1. Get all cities
  const cities: { fips_code: string; name: string; latitude: number; longitude: number }[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, name, latitude, longitude').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    cities.push(...data);
    page++;
  }
  
  console.log(`Loaded ${cities.length} cities.`);

  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cities.length; i += BATCH_SIZE) {
    const batch = cities.slice(i, i + BATCH_SIZE);
    
    // Ensure valid coordinates
    const validBatch = batch.filter(c => c.latitude !== 0 && c.longitude !== 0 && c.latitude != null && c.longitude != null);
    
    if (validBatch.length === 0) continue;
    
    const lats = validBatch.map(c => c.latitude).join(',');
    const lngs = validBatch.map(c => c.longitude).join(',');
    
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lngs}&hourly=us_aqi&past_days=14`;
    
    process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cities.length / BATCH_SIZE)} `);
    
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`API Error: ${res.status}`);
        errorCount += validBatch.length;
        continue;
      }
      
      const data = await res.json();
      
      // If single response vs array response (Open-Meteo returns array if multiple locs)
      const results = Array.isArray(data) ? data : [data];
      
      for (let j = 0; j < results.length; j++) {
        const city = validBatch[j];
        if (!city) continue;
        
        const resData = results[j];
        if (!resData || !resData.hourly || !resData.hourly.us_aqi) continue;
        
        // Filter out nulls from the hourly AQI array
        const aqiValues = resData.hourly.us_aqi.filter((val: number | null) => val !== null && val !== undefined);
        
        if (aqiValues.length > 0) {
          const avgAqi = Math.round(aqiValues.reduce((a: number, b: number) => a + b, 0) / aqiValues.length);
          
          const { error } = await supabase.from('city_livability')
            .update({ aqi_avg: avgAqi })
            .eq('fips_code', city.fips_code);
            
          if (!error) updatedCount++;
        }
      }
      console.log(`✅ updated ${results.length}`);
      
    } catch (e) {
      console.log(`❌ Request failed: ${e}`);
      errorCount += validBatch.length;
    }
    
    // API rate limit safety (10k/day = generous, but let's pause anyway)
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nCompleted: ${updatedCount} cities updated with AQI. (Errors: ${errorCount})`);
}

main().catch(console.error);
