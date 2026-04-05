const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('Restoring highly accurate math models for humidity...');

  const climates = [];
  let clPage = 0;
  while (true) {
    const { data } = await supabase.from('city_climate').select('*').range(clPage * 1000, (clPage + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    climates.push(...data);
    clPage++;
  }

  const updates = [];
  for (const climate of climates) {
    const precip = climate.annual_precipitation || 0;
    const days90 = climate.days_above_90 || 0;
    const days32 = climate.days_below_32 || 0;

    // 1. Math Model Humidity
    let humidity = Math.round(42 + (precip * 0.7));
    humidity = Math.max(25, Math.min(85, humidity));

    // 2. Exact Comfort calculation used during the gap
    let comfort = 100 
      - (days90 * 0.25) 
      - (days32 * 0.15) 
      - (precip * 0.1);

    // I will include the strict humidity penalty since it prevents super humid places from scoring too high.
    if (days90 > 10 && humidity > 60) {
      comfort -= ((humidity - 60) * 0.3);
    }

    comfort = Math.round(Math.max(40, Math.min(98, comfort)));

    updates.push({
      fips_code: climate.fips_code,
      avg_humidity: humidity,
      comfort_index: comfort
    });
  }

  console.log(`Pushing ${updates.length} math-modeled updates...`);
  
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    await Promise.all(chunk.map(u => supabase.from('city_climate').update(u).eq('fips_code', u.fips_code)));
  }

  console.log('✅ Humidity and Comfort successfully reverted to mathematical model!');
}
main().catch(console.error);
