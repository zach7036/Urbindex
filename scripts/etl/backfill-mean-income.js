/**
 * Urbindex — Mean Household Income Fix
 * 
 * The ETL stored B19025_001E (Aggregate Household Income = total for the whole city)
 * instead of the actual per-household mean. This script fetches the correct
 * mean household income from the Census data profile and updates Supabase.
 * 
 * Uses DP03_0065E = Mean household income (dollars)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5/profile';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// DP03_0065E = Mean household income (dollars) from the data profile
const VARS = 'DP03_0065E';

const STATE_FIPS = [
  '01','02','04','05','06','08','09','10','11','12',
  '13','15','16','17','18','19','20','21','22','23',
  '24','25','26','27','28','29','30','31','32','33',
  '34','35','36','37','38','39','40','41','42','44',
  '45','46','47','48','49','50','51','53','54','55','56'
];

async function run() {
  console.log('\n=== Mean Household Income Fix ===\n');

  const updates = [];

  for (let si = 0; si < STATE_FIPS.length; si++) {
    const sf = STATE_FIPS[si];
    process.stdout.write(`  [${si + 1}/${STATE_FIPS.length}] State ${sf}...`);

    try {
      const url = `${BASE_URL}?get=${VARS}&for=place:*&in=state:${sf}&key=${CENSUS_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) { console.log(` API error ${res.status}`); continue; }
      const data = await res.json();
      if (!data || data.length <= 1) { console.log(' no data'); continue; }

      const headers = data[0];
      const meanIdx = headers.indexOf('DP03_0065E');
      const placeIdx = headers.indexOf('place');
      let count = 0;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const placeFips = `${sf}${row[placeIdx]}`;
        const meanIncome = parseInt(row[meanIdx]);

        if (isNaN(meanIncome) || meanIncome <= 0) continue;

        updates.push({ fips_code: placeFips, mean_household_income: meanIncome });
        count++;
      }

      console.log(` ${count} places`);
    } catch (e) {
      console.log(` error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nCollected ${updates.length} corrected mean income records.\n`);

  // Batch update
  console.log('Updating Supabase...');
  let updated = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);

    const results = await Promise.all(
      batch.map(u =>
        supabase
          .from('city_economy')
          .update({ mean_household_income: u.mean_household_income })
          .eq('fips_code', u.fips_code)
      )
    );

    for (const r of results) {
      if (r.error) errors++;
      else updated++;
    }

    if ((i / BATCH) % 20 === 0) {
      console.log(`  ${i + batch.length}/${updates.length} processed...`);
    }
  }

  console.log(`\n✅ Done! Updated ${updated} cities. Errors: ${errors}.\n`);

  // Verify
  console.log('Verification:');
  const checks = [
    { fips: '3755000', name: 'Raleigh, NC' },
    { fips: '4805000', name: 'Austin, TX' },
    { fips: '1714000', name: 'Chicago, IL' },
    { fips: '3651000', name: 'New York, NY' },
    { fips: '5143432', name: 'Lake Ridge, VA (was $2.1B)' },
  ];
  for (const c of checks) {
    const { data } = await supabase.from('city_economy').select('mean_household_income').eq('fips_code', c.fips).single();
    console.log(`  ${c.name}: $${data?.mean_household_income?.toLocaleString()}`);
  }

  // Top 10
  console.log('\nTop 10 highest mean household income:');
  const { data: top } = await supabase.from('city_economy')
    .select('fips_code, mean_household_income')
    .order('mean_household_income', { ascending: false })
    .limit(10);
  for (const r of top || []) {
    const { data: city } = await supabase.from('cities').select('name, state_code').eq('fips_code', r.fips_code).single();
    console.log(`  ${city?.name}, ${city?.state_code}: $${r.mean_household_income?.toLocaleString()}`);
  }
}

run().catch(console.error);
