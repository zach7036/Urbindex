/**
 * Fetch REAL temperature data for all 729 cities from Open-Meteo.
 * Uses the Historical Weather API (free, no key needed).
 * 
 * Step 1: Identify all bad cities (comfort_index=0 indicates original NOAA failure)
 * Step 2: Null their temps back
 * Step 3: Geocode each city → lat/lon
 * Step 4: Fetch 2023 daily highs/lows → compute Jan & Jul averages
 * Step 5: Update Supabase with real data
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
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=10&language=en&format=json`;
  
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.results || json.results.length === 0) return null;
    
    // Find US result matching the state
    const match = json.results.find(r =>
      r.country_code === 'US' && r.admin1 === stateName
    );
    if (match) return { lat: match.latitude, lon: match.longitude };
    
    // Fallback: any US result
    const us = json.results.find(r => r.country_code === 'US');
    if (us) return { lat: us.latitude, lon: us.longitude };
    
    return null;
  } catch (e) {
    return null;
  }
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
    
    // Group by month
    const months = {};
    for (let i = 0; i < dates.length; i++) {
      const m = parseInt(dates[i].split('-')[1]);
      if (!months[m]) months[m] = { highs: [], lows: [] };
      if (highs[i] != null) months[m].highs.push(highs[i]);
      if (lows[i] != null) months[m].lows.push(lows[i]);
    }
    
    const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    
    return {
      avg_high_jan: avg(months[1]?.highs || []),
      avg_low_jan: avg(months[1]?.lows || []),
      avg_high_apr: avg(months[4]?.highs || []),
      avg_low_apr: avg(months[4]?.lows || []),
      avg_high_jul: avg(months[7]?.highs || []),
      avg_low_jul: avg(months[7]?.lows || []),
      avg_high_oct: avg(months[10]?.highs || []),
      avg_low_oct: avg(months[10]?.lows || []),
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('=== Open-Meteo Real Temperature Backfill ===\n');

  // Step 1: Identify ALL 729 bad cities (comfort_index = 0 means original NOAA failure + other 0 fields)
  // Get the ones still null
  const stillNull = [];
  let p = 0;
  while (true) {
    const { data } = await supabase.from('city_climate').select('fips_code').is('avg_high_jul', null).range(p*1000, (p+1)*1000-1);
    if (!data || data.length === 0) break;
    stillNull.push(...data.map(d => d.fips_code));
    p++;
  }
  
  // Get the ones that were imputed by the aborted script (comfort_index=0 but avg_high_jul is set)
  const imputed = [];
  p = 0;
  while (true) {
    const { data } = await supabase.from('city_climate').select('fips_code').eq('comfort_index', 0).not('avg_high_jul', 'is', null).range(p*1000, (p+1)*1000-1);
    if (!data || data.length === 0) break;
    imputed.push(...data.map(d => d.fips_code));
    p++;
  }
  
  console.log(`Still null: ${stillNull.length}`);
  console.log(`Imputed by aborted script (need real data): ${imputed.length}`);
  
  const allTargets = [...new Set([...stillNull, ...imputed])];
  console.log(`Total targets: ${allTargets.length}\n`);

  // Step 2: Get city info
  const cityInfo = new Map();
  let cPage = 0;
  while (true) {
    const { data } = await supabase.from('cities').select('fips_code, name, state_code').range(cPage*1000, (cPage+1)*1000-1);
    if (!data || data.length === 0) break;
    for (const c of data) cityInfo.set(c.fips_code, { name: c.name, state: c.state_code });
    cPage++;
  }

  // Step 3: Process each city
  let updated = 0;
  let geocodeFails = 0;
  let tempFails = 0;
  const failedCities = [];

  for (let i = 0; i < allTargets.length; i++) {
    const fips = allTargets[i];
    const info = cityInfo.get(fips);
    if (!info) continue;

    // Geocode
    const coords = await geocode(info.name, info.state);
    if (!coords) {
      geocodeFails++;
      failedCities.push(`${info.name}, ${info.state} (geocode)`);
      await sleep(50);
      continue;
    }
    await sleep(80); // respect geocoding rate limit

    // Fetch real temperatures
    const temps = await fetchTemps(coords.lat, coords.lon);
    if (!temps || temps.avg_high_jul === null) {
      tempFails++;
      failedCities.push(`${info.name}, ${info.state} (temps)`);
      await sleep(50);
      continue;
    }
    await sleep(80); // respect archive rate limit

    // Update DB
    const { error } = await supabase
      .from('city_climate')
      .update(temps)
      .eq('fips_code', fips);

    if (error) {
      console.error(`  DB error: ${info.name}, ${info.state} — ${error.message}`);
      continue;
    }

    updated++;
    if (updated % 50 === 0 || updated <= 5) {
      console.log(`  [${updated}/${allTargets.length}] ${info.name}, ${info.state} → Jul: ${temps.avg_high_jul}/${temps.avg_low_jul}°F  Jan: ${temps.avg_high_jan}/${temps.avg_low_jan}°F`);
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`✅ Updated with real data: ${updated}`);
  console.log(`❌ Geocode failures: ${geocodeFails}`);
  console.log(`❌ Temperature fetch failures: ${tempFails}`);
  
  if (failedCities.length > 0 && failedCities.length <= 20) {
    console.log(`\nFailed cities:`);
    failedCities.forEach(c => console.log(`  - ${c}`));
  } else if (failedCities.length > 20) {
    console.log(`\nFirst 20 failed cities:`);
    failedCities.slice(0, 20).forEach(c => console.log(`  - ${c}`));
  }

  // Verify
  const { count } = await supabase.from('city_climate').select('*', { count: 'exact', head: true }).is('avg_high_jul', null);
  console.log(`\nRemaining nulls: ${count}`);
}

main().catch(console.error);
