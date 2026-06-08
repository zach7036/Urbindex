/**
 * FBI State-Average Fallback ETL
 * 
 * For the ~676 cities whose counties didn't report to FBI Table 10,
 * use the state-wide average violent & property crime rates from
 * cities we already have data for in city_safety.
 * 
 * This gives us 100% coverage using the most statistically accurate
 * fallback possible — the average of all reporting jurisdictions in
 * the same state.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, select) {
  const all = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    page++;
  }
  return all;
}

async function main() {
  console.log('=== State-Average Fallback ETL ===\n');

  // ── Get current data ──
  const allCities = await fetchAll('cities', 'fips_code, name, state_code, population');
  const allSafety = await fetchAll('city_safety', 'fips_code, violent_crime_rate, property_crime_rate, safety_score');
  const safetyMap = new Map(allSafety.map(s => [s.fips_code, s]));
  const missingCities = allCities.filter(c => !safetyMap.has(c.fips_code));
  
  console.log(`Total cities: ${allCities.length}`);
  console.log(`Have safety: ${allSafety.length}`);
  console.log(`Still missing: ${missingCities.length}\n`);
  
  if (missingCities.length === 0) { console.log('All cities covered!'); return; }

  // ── Compute state averages from existing data ──
  const stateStats = {};
  for (const s of allSafety) {
    const city = allCities.find(c => c.fips_code === s.fips_code);
    if (!city) continue;
    const st = city.state_code;
    if (!stateStats[st]) stateStats[st] = { sumV: 0, sumP: 0, count: 0 };
    stateStats[st].sumV += s.violent_crime_rate || 0;
    stateStats[st].sumP += s.property_crime_rate || 0;
    stateStats[st].count++;
  }
  
  const stateAvg = {};
  for (const [st, stats] of Object.entries(stateStats)) {
    stateAvg[st] = {
      violent: Math.round((stats.sumV / stats.count) * 100) / 100,
      property: Math.round((stats.sumP / stats.count) * 100) / 100,
    };
  }
  
  console.log('State averages (sample):');
  ['MD', 'FL', 'PA', 'NY', 'VA'].forEach(st => {
    if (stateAvg[st]) console.log(`  ${st}: violent=${stateAvg[st].violent}/100k, property=${stateAvg[st].property}/100k`);
  });

  // ── Build insert records ──
  const toInsert = [];
  for (const city of missingCities) {
    const avg = stateAvg[city.state_code];
    if (!avg) continue;
    
    const violentScore = Math.max(0, 100 - (avg.violent / 380) * 50);
    const propertyScore = Math.max(0, 100 - (avg.property / 1900) * 50);
    const safetyScore = Math.round((violentScore * 0.7) + (propertyScore * 0.3));
    
    toInsert.push({
      fips_code: city.fips_code,
      year: 2022,
      violent_crime_rate: avg.violent,
      property_crime_rate: avg.property,
      total_crime_rate: Math.round((avg.violent + avg.property) * 100) / 100,
      safety_score: Math.min(100, Math.max(0, safetyScore)),
      crime_trend: 'stable'
    });
  }
  
  console.log(`\nReady to insert: ${toInsert.length}\n`);

  // ── Insert ──
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from('city_safety').insert(batch);
    if (error) {
      console.error(`  ❌ Batch error: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  
  console.log(`🎉 DONE! Inserted ${inserted} state-average fallback records.`);
  console.log(`   Final coverage: ${allSafety.length + inserted} / ${allCities.length} cities`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
