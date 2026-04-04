/**
 * Urbindex — Disability % Backfill Script (CORRECTED)
 * 
 * Uses Census ACS Subject Table S1810 which provides the pre-calculated
 * disability percentage directly. The previous approach using C18108
 * was double-counting across age/insurance categories.
 * 
 * S1810_C03_001E = Percent with a disability (of total civilian noninstitutionalized pop)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const BASE_URL = 'https://api.census.gov/data/2022/acs/acs5/subject';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// S1810_C03_001E = Percent with a disability (already calculated by Census)
const VARS = 'S1810_C03_001E';

const STATE_FIPS = [
  '01','02','04','05','06','08','09','10','11','12',
  '13','15','16','17','18','19','20','21','22','23',
  '24','25','26','27','28','29','30','31','32','33',
  '34','35','36','37','38','39','40','41','42','44',
  '45','46','47','48','49','50','51','53','54','55','56'
];

async function run() {
  console.log('\n=== Disability % Backfill (CORRECTED using S1810) ===\n');

  // Step 1: Fetch correct disability % from Census Subject Table
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
      const pctIdx = headers.indexOf('S1810_C03_001E');
      const placeIdx = headers.indexOf('place');
      let count = 0;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const placeFips = `${sf}${row[placeIdx]}`;
        const pctVal = parseFloat(row[pctIdx]);

        if (isNaN(pctVal)) continue;

        updates.push({ fips_code: placeFips, disability_pct: pctVal });
        count++;
      }

      console.log(` ${count} places`);
    } catch (e) {
      console.log(` error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nCollected ${updates.length} corrected disability records.\n`);

  // Step 2: Batch update Supabase
  console.log('Updating Supabase...');
  let updated = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);

    const results = await Promise.all(
      batch.map(u =>
        supabase
          .from('city_demographics')
          .update({ disability_pct: u.disability_pct })
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

  // Verify with known cities
  console.log('Verification spot check:');
  const checks = [
    { fips: '3755000', expected: 'Raleigh, NC ~9.5%' },
    { fips: '4805000', expected: 'Austin, TX ~10%' },
    { fips: '0667000', expected: 'San Francisco, CA ~11%' },
    { fips: '1714000', expected: 'Chicago, IL ~11%' },
    { fips: '3651000', expected: 'New York, NY ~11%' },
    { fips: '4826664', expected: 'Fort Bliss, TX (military CDP)' },
  ];
  for (const c of checks) {
    const { data } = await supabase.from('city_demographics').select('disability_pct').eq('fips_code', c.fips).single();
    console.log(`  ${c.expected}: ${data?.disability_pct}%`);
  }

  // Top 10
  console.log('\nTop 10 highest disability %:');
  const { data: top } = await supabase.from('city_demographics')
    .select('fips_code, disability_pct')
    .order('disability_pct', { ascending: false })
    .limit(10);
  for (const r of top || []) {
    const { data: city } = await supabase.from('cities').select('name, state_code, population').eq('fips_code', r.fips_code).single();
    console.log(`  ${city?.name}, ${city?.state_code} (pop ${city?.population}): ${r.disability_pct}%`);
  }
}

run().catch(console.error);
