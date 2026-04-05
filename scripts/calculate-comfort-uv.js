/**
 * Urbindex — Dynamic Modeling for Comfort, UV, Humidity & Sunny Days
 * 
 * Replaces hardcoded values (uv=6, comfort=70) with dynamic calculations
 * based on actual NOAA latitude, precipitation, and extreme temperature days.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('=== Dynamic Climate Modeling (UV & Comfort) ===\n');

  // Fetch all cities
  const cities = [];
  let cPage = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, latitude').not('latitude', 'is', null).range(cPage * 1000, (cPage + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    cities.push(...data);
    cPage++;
  }

  // Fetch all climates
  const climates = [];
  let clPage = 0;
  while (true) {
    const { data } = await supabase.from('city_climate').select('*').range(clPage * 1000, (clPage + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    climates.push(...data);
    clPage++;
  }

  const latMap = new Map(cities.map(c => [c.fips_code, c.latitude]));
  const updates = [];

  for (const climate of climates) {
    const lat = latMap.get(climate.fips_code);
    if (!lat) continue;

    const precip = climate.annual_precipitation || 0;
    const days90 = climate.days_above_90 || 0;
    const days32 = climate.days_below_32 || 0;

    // 1. Sunny Days: Inversely correlated with precipitation. 
    // US avg is 205. SW deserts get ~300. Pacific NW gets ~150.
    let sunny = Math.round(280 - (precip * 2.2));
    // Bonus for southern latitudes
    if (lat < 35) sunny += 15;
    sunny = Math.max(140, Math.min(320, sunny));

    // 2. UV Index: Correlated with latitude and sunny days.
    // Base 0-11 scale based on latitude distance from equator
    let uv = 11.5 - ((lat - 25) * 0.2);
    // Multiply by sunlight availability
    uv = uv * (sunny / 250);
    uv = (Math.max(1.5, Math.min(11.0, uv))).toFixed(1);

    // 3. Avg Humidity: Correlated with precipitation.
    let humidity = Math.round(42 + (precip * 0.7));
    humidity = Math.max(25, Math.min(85, humidity));

    // 4. Comfort Index (0-100):
    // Penalty for intense heat, freezing cold, and high rainfall
    let comfort = 100 
      - (days90 * 0.25)   // Heat penalty
      - (days32 * 0.15)   // Freeze penalty
      - (precip * 0.1);   // Precipitation penalty

    comfort = Math.round(Math.max(40, Math.min(98, comfort)));

    updates.push({
      fips_code: climate.fips_code,
      sunny_days: sunny,
      uv_index: parseFloat(uv),
      avg_humidity: humidity,
      comfort_index: comfort
    });
  }

  console.log(`Generated dynamic models for ${updates.length} cities...`);
  
  // Upload to Supabase using targeted individual updates
  let successCount = 0;
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    await Promise.all(chunk.map(async (u) => {
      const { fips_code, ...fields } = u;
      const { error } = await supabase.from('city_climate').update(fields).eq('fips_code', fips_code);
      if (error) console.error(`Error for ${fips_code}:`, error.message);
      else successCount++;
    }));
    console.log(`  Uploaded ${successCount}/${updates.length}...`);
  }

  console.log(`\n✅ Completed mapping and update for ${successCount} entries.`);
}

main().catch(console.error);
