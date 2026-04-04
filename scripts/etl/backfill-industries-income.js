/**
 * Urbindex — Top Industries & Income Brackets Backfill
 * 
 * Industry data: DP03_0033PE through DP03_0045PE (% by industry)
 * Income brackets: B19001_001E through B19001_017E (household counts by bracket)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const ACS_URL = 'https://api.census.gov/data/2022/acs/acs5';
const PROFILE_URL = 'https://api.census.gov/data/2022/acs/acs5/profile';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STATE_FIPS = [
  '01','02','04','05','06','08','09','10','11','12',
  '13','15','16','17','18','19','20','21','22','23',
  '24','25','26','27','28','29','30','31','32','33',
  '34','35','36','37','38','39','40','41','42','44',
  '45','46','47','48','49','50','51','53','54','55','56'
];

// Industry variable codes and labels (DP03 data profile, percentages)
const INDUSTRY_VARS = [
  { code: 'DP03_0033PE', name: 'Agriculture' },
  { code: 'DP03_0034PE', name: 'Construction' },
  { code: 'DP03_0035PE', name: 'Manufacturing' },
  { code: 'DP03_0036PE', name: 'Wholesale Trade' },
  { code: 'DP03_0037PE', name: 'Retail Trade' },
  { code: 'DP03_0038PE', name: 'Transportation' },
  { code: 'DP03_0039PE', name: 'Information' },
  { code: 'DP03_0040PE', name: 'Finance & Insurance' },
  { code: 'DP03_0041PE', name: 'Professional & Science' },
  { code: 'DP03_0042PE', name: 'Education & Healthcare' },
  { code: 'DP03_0043PE', name: 'Arts & Entertainment' },
  { code: 'DP03_0044PE', name: 'Other Services' },
  { code: 'DP03_0045PE', name: 'Public Administration' },
];

// Income bracket variable codes and labels (B19001, counts)
const INCOME_VARS = [
  { code: 'B19001_002E', range: '<$10K' },
  { code: 'B19001_003E', range: '$10K-$15K' },
  { code: 'B19001_004E', range: '$15K-$25K' },
  { code: 'B19001_005E', range: '$25K-$35K' },
  { code: 'B19001_006E', range: '$35K-$45K' },
  { code: 'B19001_007E', range: '$45K-$60K' },
  { code: 'B19001_008E', range: '$60K-$75K' },
  { code: 'B19001_009E', range: '$75K-$100K' },
  { code: 'B19001_010E', range: '$100K-$125K' },
  { code: 'B19001_011E', range: '$125K-$150K' },
  { code: 'B19001_012E', range: '$150K-$200K' },
  { code: 'B19001_013E', range: '$200K+' },
];

// Simplified income brackets (merge the 16 Census brackets into 8 for cleaner chart)
// B19001: 002=<$10K, 003=$10-15K, 004=$15-20K, 005=$20-25K, 006=$25-30K, 007=$30-35K,
//         008=$35-40K, 009=$40-45K, 010=$45-50K, 011=$50-60K, 012=$60-75K, 013=$75-100K,
//         014=$100-125K, 015=$125-150K, 016=$150-200K, 017=$200K+
const INCOME_MERGE = [
  { codes: ['B19001_002E', 'B19001_003E'], range: '<$15K' },
  { codes: ['B19001_004E', 'B19001_005E'], range: '$15-25K' },
  { codes: ['B19001_006E', 'B19001_007E', 'B19001_008E'], range: '$25-40K' },
  { codes: ['B19001_009E', 'B19001_010E'], range: '$40-50K' },
  { codes: ['B19001_011E', 'B19001_012E'], range: '$50-75K' },
  { codes: ['B19001_013E'], range: '$75-100K' },
  { codes: ['B19001_014E', 'B19001_015E'], range: '$100-150K' },
  { codes: ['B19001_016E'], range: '$150-200K' },
  { codes: ['B19001_017E'], range: '$200K+' },
];

async function run() {
  console.log('\n=== Top Industries & Income Brackets Backfill ===\n');

  const updates = []; // { fips_code, top_industries, income_brackets }

  for (let si = 0; si < STATE_FIPS.length; si++) {
    const sf = STATE_FIPS[si];
    process.stdout.write(`  [${si + 1}/${STATE_FIPS.length}] State ${sf}...`);

    try {
      // Fetch industry data (profile table)
      const industryVarStr = INDUSTRY_VARS.map(v => v.code).join(',');
      const industryUrl = `${PROFILE_URL}?get=${industryVarStr}&for=place:*&in=state:${sf}&key=${CENSUS_API_KEY}`;
      const indRes = await fetch(industryUrl);
      const indData = indRes.ok ? await indRes.json() : [];

      // Fetch income bracket data (detail table)
      const incomeVarStr = 'B19001_001E,B19001_002E,B19001_003E,B19001_004E,B19001_005E,B19001_006E,B19001_007E,B19001_008E,B19001_009E,B19001_010E,B19001_011E,B19001_012E,B19001_013E,B19001_014E,B19001_015E,B19001_016E,B19001_017E';
      const incomeUrl = `${ACS_URL}?get=${incomeVarStr}&for=place:*&in=state:${sf}&key=${CENSUS_API_KEY}`;
      const incRes = await fetch(incomeUrl);
      const incData = incRes.ok ? await incRes.json() : [];

      // Build lookup for industry by place
      const indLookup = {};
      if (indData.length > 1) {
        const ih = indData[0];
        const placeIdx = ih.indexOf('place');
        for (let i = 1; i < indData.length; i++) {
          const row = indData[i];
          const placeFips = `${sf}${row[placeIdx]}`;
          const industries = INDUSTRY_VARS
            .map(v => ({ name: v.name, pct: parseFloat(row[ih.indexOf(v.code)]) || 0 }))
            .filter(x => x.pct > 0)
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 8); // Top 8 industries
          indLookup[placeFips] = industries;
        }
      }

      // Build lookup for income by place
      const incLookup = {};
      if (incData.length > 1) {
        const ih = incData[0];
        const placeIdx = ih.indexOf('place');
        const totalIdx = ih.indexOf('B19001_001E');
        for (let i = 1; i < incData.length; i++) {
          const row = incData[i];
          const placeFips = `${sf}${row[placeIdx]}`;
          const total = parseInt(row[totalIdx]) || 0;
          if (total <= 0) continue;

          const brackets = INCOME_MERGE.map(m => {
            const count = m.codes.reduce((sum, c) => {
              const idx = ih.indexOf(c);
              return sum + (idx >= 0 ? (parseInt(row[idx]) || 0) : 0);
            }, 0);
            return { range: m.range, pct: Math.round((count / total) * 1000) / 10 };
          });
          incLookup[placeFips] = brackets;
        }
      }

      // Merge and create updates
      const allPlaces = new Set([...Object.keys(indLookup), ...Object.keys(incLookup)]);
      let count = 0;
      for (const fp of allPlaces) {
        updates.push({
          fips_code: fp,
          top_industries: indLookup[fp] || [],
          income_brackets: incLookup[fp] || [],
        });
        count++;
      }

      console.log(` ${count} places`);
    } catch (e) {
      console.log(` error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nCollected ${updates.length} records.\n`);

  // Batch update Supabase
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
          .update({
            top_industries: u.top_industries,
            income_brackets: u.income_brackets,
          })
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

  // Verify with Raleigh
  const { data: raleigh } = await supabase.from('city_economy')
    .select('top_industries, income_brackets')
    .eq('fips_code', '3755000')
    .single();
  console.log('Raleigh top industries:', JSON.stringify(raleigh?.top_industries?.slice(0, 3)));
  console.log('Raleigh income brackets:', JSON.stringify(raleigh?.income_brackets));
}

run().catch(console.error);
