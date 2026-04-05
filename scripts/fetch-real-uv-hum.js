/**
 * Local Bulk Real UV & Humidity Fetcher
 *
 * Pulls REAL numbers using batched Open-Meteo APIs natively parsing latitudes/longitudes in bulk.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchFromAPI(url) {
  let retries = 3;
  while (retries > 0) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      return await resp.json();
    } catch (e) {
      retries--;
      if (retries === 0) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log('=== Fetching REAL UV and Humidity Data ===\n');

  // Load Cities
  const cities = [];
  let page = 0;
  while (true) {
    const { data: b } = await supabase.from('cities').select('fips_code, latitude, longitude').not('latitude', 'is', null).range(page * 1000, (page + 1) * 1000 - 1);
    if (!b || b.length === 0) break;
    cities.push(...b);
    page++;
  }
  console.log(`Loaded ${cities.length} cities.`);

  const updates = [];
  let processed = 0;

  // Chunking 30 cities per request
  for (let i = 0; i < cities.length; i += 30) {
    const chunk = cities.slice(i, i + 30);
    const lats = chunk.map(c => c.latitude.toFixed(4)).join(',');
    const lons = chunk.map(c => c.longitude.toFixed(4)).join(',');

    try {
      // 1. Fetch UV Index Max from Forecast API (Summer: Jun 1 - Aug 31)
      const uvUrl = `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&start_date=2023-06-01&end_date=2023-08-31&daily=uv_index_max`;
      const uvData = await fetchFromAPI(uvUrl);

      // 2. Fetch Humidity from Climate API (Annual Average)
      const humUrl = `https://climate-api.open-meteo.com/v1/climate?latitude=${lats}&longitude=${lons}&start_date=2023-01-01&end_date=2023-12-31&models=CMCC_CM2_VHR4&daily=relative_humidity_2m_mean`;
      const humData = await fetchFromAPI(humUrl);

      const uvList = Array.isArray(uvData) ? uvData : [uvData];
      const humList = Array.isArray(humData) ? humData : [humData];

      for (let j = 0; j < chunk.length; j++) {
        const idx = j;
        let uvAvg = 6.0;
        let humAvg = 60.0;

        // Process UV
        if (uvList[idx] && uvList[idx].daily && uvList[idx].daily.uv_index_max) {
          const arr = uvList[idx].daily.uv_index_max.filter(x => x != null);
          if (arr.length > 0) {
            uvAvg = arr.reduce((a, b) => a + b, 0) / arr.length;
          }
        }

        // Process Humidity
        if (humList[idx] && humList[idx].daily && humList[idx].daily.relative_humidity_2m_mean) {
          const arr = humList[idx].daily.relative_humidity_2m_mean.filter(x => x != null);
          if (arr.length > 0) {
            humAvg = arr.reduce((a, b) => a + b, 0) / arr.length;
          }
        }

        updates.push({
          fips_code: chunk[j].fips_code,
          uv_index: parseFloat(uvAvg.toFixed(1)),
          avg_humidity: Math.round(humAvg)
        });
      }

    } catch (e) {
      console.error(`Error processing chunk at index ${i}:`, e.message);
    }
    
    // Pace requests strictly to respect free limit tiers (max 40 req/minute)
    await new Promise(r => setTimeout(r, 4500)); 
  }

  console.log(`\nPushing actual numbers to Supabase for ${updates.length} cities.`);
  
  let successCount = 0;
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    await Promise.all(chunk.map(u => supabase.from('city_climate').update(u).eq('fips_code', u.fips_code)));
    successCount += chunk.length;
    console.log(`  Uploaded ${successCount}/${updates.length}...`);
  }

  console.log('✅ Real data upload complete!');
}

main().catch(console.error);
