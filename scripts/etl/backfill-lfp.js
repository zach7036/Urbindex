/**
 * Urbindex — Labor Force Participation Fix
 * 
 * Uses Census Data Profile DP03_0002PE which is the official pre-calculated
 * labor force participation rate (% of population 16+ in the labor force).
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5/profile';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VARS = 'DP03_0002PE';

const STATE_FIPS = [
  '01','02','04','05','06','08','09','10','11','12',
  '13','15','16','17','18','19','20','21','22','23',
  '24','25','26','27','28','29','30','31','32','33',
  '34','35','36','37','38','39','40','41','42','44',
  '45','46','47','48','49','50','51','53','54','55','56'
];

async function run() {
  console.log('\n=== Labor Force Participation Fix ===\n');

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
      const lfpIdx = headers.indexOf('DP03_0002PE');
      const placeIdx = headers.indexOf('place');
      let count = 0;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const placeFips = `${sf}${row[placeIdx]}`;
        const lfpRate = parseFloat(row[lfpIdx]);

        if (isNaN(lfpRate)) continue;

        updates.push({ fips_code: placeFips, labor_force_participation: lfpRate });
        count++;
      }

      console.log(` ${count} places`);
    } catch (e) {
      console.log(` error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nCollected ${updates.length} corrected LFP records.\n`);

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
          .update({ labor_force_participation: u.labor_force_participation })
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
    { fips: '0807850', name: 'Boulder, CO (should be ~64%)' },
    { fips: '3755000', name: 'Raleigh, NC' },
    { fips: '4805000', name: 'Austin, TX' },
    { fips: '1714000', name: 'Chicago, IL' },
    { fips: '3651000', name: 'New York, NY' },
  ];
  for (const c of checks) {
    const { data } = await supabase.from('city_economy').select('labor_force_participation').eq('fips_code', c.fips).single();
    console.log(`  ${c.name}: ${data?.labor_force_participation}%`);
  }

  const { count: above90 } = await supabase.from('city_economy').select('*', { count: 'exact', head: true }).gte('labor_force_participation', 90);
  console.log(`\nCities with LFP >= 90%: ${above90} (should be very few or zero)`);
}

run().catch(console.error);
