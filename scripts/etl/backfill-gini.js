/**
 * Urbindex — Gini Coefficient Backfill
 * 
 * B19083_001E = Gini Index of Income Inequality
 * Values range from 0 (perfect equality) to 1 (maximum inequality)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VARS = 'B19083_001E';

const STATE_FIPS = [
  '01','02','04','05','06','08','09','10','11','12',
  '13','15','16','17','18','19','20','21','22','23',
  '24','25','26','27','28','29','30','31','32','33',
  '34','35','36','37','38','39','40','41','42','44',
  '45','46','47','48','49','50','51','53','54','55','56'
];

async function run() {
  console.log('\n=== Gini Coefficient Backfill ===\n');

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
      const giniIdx = headers.indexOf('B19083_001E');
      const placeIdx = headers.indexOf('place');
      let count = 0;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const placeFips = `${sf}${row[placeIdx]}`;
        const gini = parseFloat(row[giniIdx]);

        if (isNaN(gini) || gini <= 0) continue;

        updates.push({ fips_code: placeFips, gini_coefficient: gini });
        count++;
      }

      console.log(` ${count} places`);
    } catch (e) {
      console.log(` error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nCollected ${updates.length} Gini records.\n`);

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
          .update({ gini_coefficient: u.gini_coefficient })
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
  for (const f of ['3755000','4805000','1714000','3651000']) {
    const { data: city } = await supabase.from('cities').select('name,state_code').eq('fips_code', f).single();
    const { data: e } = await supabase.from('city_economy').select('gini_coefficient').eq('fips_code', f).single();
    console.log(`  ${city?.name}, ${city?.state_code}: ${e?.gini_coefficient}`);
  }

  const { count: stillZero } = await supabase.from('city_economy').select('*', { count: 'exact', head: true }).eq('gini_coefficient', 0);
  const { count: hasData } = await supabase.from('city_economy').select('*', { count: 'exact', head: true }).gt('gini_coefficient', 0);
  console.log(`\nCities with Gini data: ${hasData}`);
  console.log(`Cities still at 0: ${stillZero}`);
}

run().catch(console.error);
