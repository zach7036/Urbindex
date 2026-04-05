/**
 * Second pass: Fix the ~330 cities that the aborted script set to state-average values.
 * These have comfort_index = 0 (indicator of original bad data) but now have
 * non-null avg_high_jul (from the aborted state-avg imputation).
 * 
 * Also fix the 4 remaining nulls by trying alternate name geocoding.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia',PR:'Puerto Rico'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function geocode(cityName, stateCode) {
  const stateName = STATE_NAMES[stateCode] || stateCode;
  // Try with just the first word for compound names
  const names = [cityName];
  // Also try without common suffixes
  const simplified = cityName.replace(/ (CDP|city|town|village|borough)$/i, '').trim();
  if (simplified !== cityName) names.push(simplified);
  // Try first part for "University of X" type names
  if (cityName.includes('-')) names.push(cityName.split('-')[0].trim());
  
  for (const name of names) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!json.results) continue;
      
      const match = json.results.find(r => r.country_code === 'US' && r.admin1 === stateName);
      if (match) return { lat: match.latitude, lon: match.longitude };
      
      const us = json.results.find(r => r.country_code === 'US');
      if (us) return { lat: us.latitude, lon: us.longitude };
    } catch (e) { continue; }
    await sleep(80);
  }
  return null;
}

async function fetchTemps(lat, lon) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2023-01-01&end_date=2023-12-31&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.daily) return null;
    const dates = json.daily.time;
    const highs = json.daily.temperature_2m_max;
    const lows = json.daily.temperature_2m_min;
    const months = {};
    for (let i = 0; i < dates.length; i++) {
      const m = parseInt(dates[i].split('-')[1]);
      if (!months[m]) months[m] = { highs: [], lows: [] };
      if (highs[i] != null) months[m].highs.push(highs[i]);
      if (lows[i] != null) months[m].lows.push(lows[i]);
    }
    const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    return {
      avg_high_jan: avg(months[1]?.highs || []), avg_low_jan: avg(months[1]?.lows || []),
      avg_high_apr: avg(months[4]?.highs || []), avg_low_apr: avg(months[4]?.lows || []),
      avg_high_jul: avg(months[7]?.highs || []), avg_low_jul: avg(months[7]?.lows || []),
      avg_high_oct: avg(months[10]?.highs || []), avg_low_oct: avg(months[10]?.lows || []),
    };
  } catch (e) { return null; }
}

async function main() {
  console.log('=== Pass 2: Fix imputed + remaining null cities ===\n');

  // Get cities imputed by aborted script (comfort_index=0 but temps are not null)
  const imputed = [];
  let p = 0;
  while (true) {
    const { data } = await supabase.from('city_climate').select('fips_code')
      .eq('comfort_index', 0).not('avg_high_jul', 'is', null)
      .range(p*1000, (p+1)*1000-1);
    if (!data || data.length === 0) break;
    imputed.push(...data.map(d => d.fips_code));
    p++;
  }

  // Get remaining nulls
  const nullFips = [];
  p = 0;
  while (true) {
    const { data } = await supabase.from('city_climate').select('fips_code')
      .is('avg_high_jul', null).range(p*1000, (p+1)*1000-1);
    if (!data || data.length === 0) break;
    nullFips.push(...data.map(d => d.fips_code));
    p++;
  }

  const allTargets = [...new Set([...imputed, ...nullFips])];
  console.log(`Imputed by aborted script: ${imputed.length}`);
  console.log(`Still null: ${nullFips.length}`);
  console.log(`Total to process: ${allTargets.length}\n`);

  // Get city info
  const cityInfo = new Map();
  let cPage = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, name, state_code').range(cPage*1000, (cPage+1)*1000-1);
    if (!data || data.length === 0) break;
    for (const c of data) cityInfo.set(c.fips_code, { name: c.name, state: c.state_code });
    cPage++;
  }

  let updated = 0;
  let failures = 0;
  const failed = [];

  for (let i = 0; i < allTargets.length; i++) {
    const fips = allTargets[i];
    const info = cityInfo.get(fips);
    if (!info) continue;

    const coords = await geocode(info.name, info.state);
    if (!coords) {
      failures++;
      failed.push(`${info.name}, ${info.state}`);
      await sleep(50);
      continue;
    }
    await sleep(80);

    const temps = await fetchTemps(coords.lat, coords.lon);
    if (!temps || temps.avg_high_jul === null) {
      failures++;
      failed.push(`${info.name}, ${info.state}`);
      await sleep(50);
      continue;
    }
    await sleep(80);

    const { error } = await supabase.from('city_climate').update(temps).eq('fips_code', fips);
    if (error) { failures++; continue; }

    updated++;
    if (updated % 50 === 0 || updated <= 3) {
      console.log(`  [${updated}/${allTargets.length}] ${info.name}, ${info.state} → Jul: ${temps.avg_high_jul}/${temps.avg_low_jul}°F  Jan: ${temps.avg_high_jan}/${temps.avg_low_jan}°F`);
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`✅ Updated: ${updated}`);
  console.log(`❌ Failures: ${failures}`);
  if (failed.length > 0) {
    console.log(`\nFailed cities:`);
    failed.forEach(c => console.log(`  - ${c}`));
  }

  const { count } = await supabase.from('city_climate').select('*', { count: 'exact', head: true }).is('avg_high_jul', null);
  const { count: c0 } = await supabase.from('city_climate').select('*', { count: 'exact', head: true }).eq('comfort_index', 0).not('avg_high_jul', 'is', null);
  console.log(`\nRemaining nulls: ${count}`);
  console.log(`Remaining imputed (comfort_index=0): ${c0}`);
}

main().catch(console.error);
