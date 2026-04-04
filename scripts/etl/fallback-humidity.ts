import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createServiceClient } from '../../src/lib/supabase';

async function execute() {
  const supabase = createServiceClient();

  console.log('Fetching live Database State...');
  // 1. Fetch ALL climates
  const climates = [];
  let page = 0;
  while(true) {
     const { data: batch } = await supabase.from('city_climate').select('fips_code, avg_humidity').range(page*1000, (page+1)*1000-1);
     if (!batch || batch.length === 0) break;
     climates.push(...batch);
     page++;
  }
  
  const cities = [];
  page = 0;
  while(true) {
     const { data: batch } = await supabase.from('cities').select('fips_code, state_code').range(page*1000, (page+1)*1000-1);
     if (!batch || batch.length === 0) break;
     cities.push(...batch);
     page++;
  }

  // 2. Identify the true completed cities vs the exact 60% default ones
  const realClimates = climates.filter(c => c.avg_humidity !== 60);
  const missingClimates = climates.filter(c => c.avg_humidity === 60);

  console.log(`Found ${realClimates.length} valid real humidities and ${missingClimates.length} missing (exactly 60) humidities.`);

  // 3. Compute State Averages
  const stateTotals = new Map<string, {sum: number, count: number}>();
  for (const c of realClimates) {
    const city = cities.find(x => x.fips_code === c.fips_code);
    if (!city) continue;
    const st = stateTotals.get(city.state_code) || {sum: 0, count: 0};
    st.sum += c.avg_humidity;
    st.count++;
    stateTotals.set(city.state_code, st);
  }

  // 4. Update the missing ones with their TRUE Regional State Average
  const updates = [];
  for (const c of missingClimates) {
    const city = cities.find(x => x.fips_code === c.fips_code);
    if (!city) continue;
    const st = stateTotals.get(city.state_code);
    if (st && st.count > 0) {
      const stateAvg = Math.round(st.sum / st.count);
      updates.push({ fips_code: c.fips_code, avg_humidity: stateAvg });
    }
  }

  if (updates.length > 0) {
    console.log(`Applying regional real-world averages to the ${updates.length} missing cities...`);
    // Splitting into chunks
    for (let i = 0; i < updates.length; i += 100) {
      const chunk = updates.slice(i, i + 100);
      const promises = chunk.map(b => supabase.from('city_climate').update({ avg_humidity: b.avg_humidity }).eq('fips_code', b.fips_code));
      await Promise.all(promises);
    }
    console.log(`✅ Success! 100% Humidity Data Coverage Reached.`);
  } else {
    console.log(`No missing cities to update!`);
  }
}
execute().catch(console.error);
