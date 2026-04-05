/**
 * Step 1: Revert the ~300 rows that got imputed by the aborted script.
 * Step 2: Then run the real Open-Meteo backfill.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function revert() {
  // The original 729 cities ALL had avg_high_jul = 0. We nulled them.
  // Then the aborted script updated ~300 with state averages.
  // We need to find those and null them back.
  
  // First, check current state
  const { count: nullCount } = await supabase
    .from('city_climate')
    .select('*', { count: 'exact', head: true })
    .is('avg_high_jul', null);
    
  console.log(`Currently null avg_high_jul: ${nullCount}`);
  console.log(`That means ~${729 - nullCount} were imputed by the aborted script`);
  
  // The imputed ones have is_imputed = true or were just recently set.
  // Let's find them by checking which cities have avg_high_jul but also had 
  // other indicators of being the original bad data.
  // 
  // Actually, the simplest approach: check a few known values from the state avg run
  // and compare. But let's try a different approach:
  // The imputed script didn't set is_imputed flag, so we can't use that.
  // But we know the original NOAA data was in a specific range. The imputed ones
  // would be close to state averages.
  //
  // Safest approach: Look at the comfort_index or other fields that were NOT nulled.
  // The original bad cities had other climate fields (like comfort_index, sunny_days etc.)
  // that were also 0. Let's check.
  
  const { data: sample } = await supabase
    .from('city_climate')
    .select('fips_code, avg_high_jul, comfort_index, sunny_days')
    .not('avg_high_jul', 'is', null)
    .eq('comfort_index', 0)
    .limit(5);
  
  console.log('\nSample of likely-imputed rows (comfort_index=0 but avg_high_jul set):');
  console.log(JSON.stringify(sample, null, 2));
  
  // Count how many have comfort_index = 0 AND avg_high_jul is NOT null
  // These are the partially-imputed ones
  const { count: imputedCount } = await supabase
    .from('city_climate')
    .select('*', { count: 'exact', head: true })
    .not('avg_high_jul', 'is', null)
    .eq('comfort_index', 0);
  
  console.log(`\nCities with comfort_index=0 and avg_high_jul set: ${imputedCount}`);
  
  // Also check: how many have sunny_days = 0?
  const { count: sunnyZero } = await supabase
    .from('city_climate')
    .select('*', { count: 'exact', head: true })
    .eq('sunny_days', 0);
  
  console.log(`Cities with sunny_days=0: ${sunnyZero}`);
}

revert();
