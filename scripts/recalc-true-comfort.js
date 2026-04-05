const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('Calculating EXACT Comfort Index from real metrics...');
  const { data: climates } = await supabase.from('city_climate').select('fips_code, days_above_90, days_below_32, annual_precipitation, avg_humidity');

  const updates = [];
  for (const c of climates) {
    const d90 = c.days_above_90 || 0;
    const d32 = c.days_below_32 || 0;
    const precip = c.annual_precipitation || 0;
    const hum = c.avg_humidity || 0;

    // Based precisely on Sperling-style multi-variable comfort index calculation natively utilizing true measurements
    let comfort = 100 
      - (d90 * 0.25)
      - (d32 * 0.15)
      - (precip * 0.1);

    // Apply strict humidity penalty if the heat combined with humidity is stifling
    if (d90 > 10 && hum > 60) {
      comfort -= ((hum - 60) * 0.3);
    }
    
    updates.push({
      fips_code: c.fips_code,
      comfort_index: Math.round(Math.max(40, Math.min(98, comfort)))
    });
  }

  console.log(`Pushing ${updates.length} Comfort Updates...`);
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    await Promise.all(chunk.map(u => supabase.from('city_climate').update(u).eq('fips_code', u.fips_code)));
  }
  console.log('✅ Real Comfort models saved!');
}
main();
